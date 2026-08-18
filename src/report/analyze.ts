import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import type { StudyEvent, StudySession } from '../session';

export type ResultsFile = { sessions: StudySession[]; events: StudyEvent[] };

function findByLabels(scheme: Scheme, labels: string[]): SchemeNode | null {
  let level = scheme.sections;
  let node: SchemeNode | null = null;
  for (const label of labels) {
    const match = level.find((n) => n.label === label);
    if (!match) return null;
    node = match;
    level = match.children;
  }
  return node;
}

function subtreeIds(node: SchemeNode, out = new Set<string>()) {
  if (node.destinationId) out.add(node.destinationId);
  for (const child of node.children) subtreeIds(child, out);
  return out;
}

export type TaskOutcome = {
  scenarioId: string;
  taskIndex: number;
  prompt: string;
  attempts: number;
  successes: number;
  direct: number;
  firstClickCorrect: number;
  giveups: number;
  medianMs: number | null;
};

export type ScenarioOutcome = {
  scenarioId: string;
  persona: string;
  attempts: number;
  successes: number;
  /** Median of each participant's total time across this scenario's tasks. */
  medianMs: number | null;
};

export type SchemeOutcome = {
  schemeId: string;
  sessions: number;
  attempts: number;
  successRate: number | null;
  directnessRate: number | null;
  firstClickRate: number | null;
  giveupRate: number | null;
  medianMs: number | null;
  /** Median time for one participant to get through every scenario. */
  medianRunMs: number | null;
  tasks: TaskOutcome[];
  scenarioOutcomes: ScenarioOutcome[];
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Success is derived here rather than at collection time, so the rules can change
 * without re-running a study.
 */
export function analyze(results: ResultsFile, schemes: Scheme[], scenarios: Scenario[]): SchemeOutcome[] {
  const schemeById = new Map(schemes.map((s) => [s.id, s]));
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));
  const sessionById = new Map(results.sessions.map((s) => [s.id, s]));

  // Group events by session, scenario, and task.
  const groups = new Map<string, StudyEvent[]>();
  for (const event of results.events) {
    const key = `${event.session_id}|${event.scenario_id}|${event.task_index}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  type Acc = { attempts: number; successes: number; direct: number; firstClick: number; giveups: number; times: number[] };
  const bySchemeTask = new Map<string, Acc>();
  const bySchemeSessions = new Map<string, Set<string>>();
  // Time is worth reporting on its own: a flat menu can score well on effort and
  // still be slower to read. Totals are per participant so they can be medianed
  // rather than summed across people.
  const scenarioTime = new Map<string, number>(); // scheme|scenario|session -> ms
  const runTime = new Map<string, number>(); // scheme|session -> ms

  const accFor = (map: Map<string, Acc>, key: string) => {
    const existing = map.get(key);
    if (existing) return existing;
    const fresh: Acc = { attempts: 0, successes: 0, direct: 0, firstClick: 0, giveups: 0, times: [] };
    map.set(key, fresh);
    return fresh;
  };

  for (const [key, events] of groups) {
    const [sessionId, scenarioId, taskIndexRaw] = key.split('|');
    const session = sessionById.get(sessionId);
    const scenario = scenarioById.get(scenarioId);
    if (!session || !scenario) continue;
    // Only completed runs count. A participant who restarts leaves an unfinished
    // session behind, and its answers should not be mixed into the results.
    if (!session.finished_at) continue;
    const scheme = schemeById.get(session.scheme_id);
    if (!scheme) continue;

    const taskIndex = Number(taskIndexRaw);
    const task = scenario.tasks[taskIndex];
    if (!task) continue;

    const accepted = new Set([...task.targets, ...task.accept]);
    const ordered = [...events].sort((a, b) => a.seq - b.seq);
    const start = ordered.find((e) => e.kind === 'start');
    const terminal = ordered.find((e) => e.kind === 'submit' || e.kind === 'giveup');
    if (!terminal) continue;

    const acc = accFor(bySchemeTask, `${scheme.id}|${scenarioId}|${taskIndex}`);
    const schemeAcc = accFor(bySchemeTask, `${scheme.id}|__all__|0`);
    const sessions = bySchemeSessions.get(scheme.id) ?? new Set<string>();
    sessions.add(sessionId);
    bySchemeSessions.set(scheme.id, sessions);

    for (const a of [acc, schemeAcc]) a.attempts += 1;

    if (terminal.kind === 'giveup') {
      for (const a of [acc, schemeAcc]) a.giveups += 1;
    } else if (terminal.destination_id && accepted.has(terminal.destination_id)) {
      for (const a of [acc, schemeAcc]) a.successes += 1;
      const backtracked = ordered.some((e) => e.kind === 'back');
      if (!backtracked) for (const a of [acc, schemeAcc]) a.direct += 1;
    }

    const firstNav = ordered.find((e) => e.kind === 'click' || e.kind === 'mode');
    if (firstNav?.kind === 'mode') {
      // Reaching for the switcher first is only the right move when the answer
      // lives in sections exclusive to that mode. If it is in a shared section,
      // switching was unnecessary.
      const target = scheme.modes?.find((m) => m.label === firstNav.node_path);
      if (target) {
        const reachable = new Set<string>();
        for (const section of scheme.sections) {
          if (section.mode === target.id) subtreeIds(section, reachable);
        }
        if ([...accepted].some((id) => reachable.has(id))) {
          for (const a of [acc, schemeAcc]) a.firstClick += 1;
        }
      }
    } else if (firstNav) {
      const node = findByLabels(scheme, firstNav.node_path.split(' / '));
      if (node) {
        const reachable = subtreeIds(node);
        if ([...accepted].some((id) => reachable.has(id))) {
          for (const a of [acc, schemeAcc]) a.firstClick += 1;
        }
      }
    } else if (terminal.kind === 'submit' && terminal.destination_id && accepted.has(terminal.destination_id)) {
      // Answered at the top level without drilling, which is a correct first choice.
      for (const a of [acc, schemeAcc]) a.firstClick += 1;
    }

    if (start) {
      const ms = new Date(terminal.ts).getTime() - new Date(start.ts).getTime();
      if (Number.isFinite(ms) && ms >= 0) {
        for (const a of [acc, schemeAcc]) a.times.push(ms);
        const sKey = `${scheme.id}|${scenarioId}|${sessionId}`;
        scenarioTime.set(sKey, (scenarioTime.get(sKey) ?? 0) + ms);
        const rKey = `${scheme.id}|${sessionId}`;
        runTime.set(rKey, (runTime.get(rKey) ?? 0) + ms);
      }
    }
  }

  const rate = (num: number, den: number) => (den === 0 ? null : num / den);

  return schemes
    .map((scheme) => {
      const overall = bySchemeTask.get(`${scheme.id}|__all__|0`);
      const tasks: TaskOutcome[] = [];
      for (const scenario of scenarios) {
        scenario.tasks.forEach((task, taskIndex) => {
          const acc = bySchemeTask.get(`${scheme.id}|${scenario.id}|${taskIndex}`);
          if (!acc) return;
          tasks.push({
            scenarioId: scenario.id,
            taskIndex,
            prompt: task.prompt,
            attempts: acc.attempts,
            successes: acc.successes,
            direct: acc.direct,
            firstClickCorrect: acc.firstClick,
            giveups: acc.giveups,
            medianMs: median(acc.times),
          });
        });
      }
      const scenarioOutcomes: ScenarioOutcome[] = scenarios
        .map((scenario) => {
          const perSession: number[] = [];
          for (const [key, ms] of scenarioTime) {
            const [schemeId, scenarioId] = key.split('|');
            if (schemeId === scheme.id && scenarioId === scenario.id) perSession.push(ms);
          }
          const totals = scenario.tasks.reduce(
            (agg, _task, taskIndex) => {
              const acc = bySchemeTask.get(`${scheme.id}|${scenario.id}|${taskIndex}`);
              return {
                attempts: agg.attempts + (acc?.attempts ?? 0),
                successes: agg.successes + (acc?.successes ?? 0),
              };
            },
            { attempts: 0, successes: 0 },
          );
          return {
            scenarioId: scenario.id,
            persona: scenario.persona,
            attempts: totals.attempts,
            successes: totals.successes,
            medianMs: median(perSession),
          };
        })
        .filter((o) => o.attempts > 0);

      const runTimes: number[] = [];
      for (const [key, ms] of runTime) {
        if (key.split('|')[0] === scheme.id) runTimes.push(ms);
      }

      return {
        schemeId: scheme.id,
        sessions: bySchemeSessions.get(scheme.id)?.size ?? 0,
        attempts: overall?.attempts ?? 0,
        successRate: rate(overall?.successes ?? 0, overall?.attempts ?? 0),
        directnessRate: rate(overall?.direct ?? 0, overall?.attempts ?? 0),
        firstClickRate: rate(overall?.firstClick ?? 0, overall?.attempts ?? 0),
        giveupRate: rate(overall?.giveups ?? 0, overall?.attempts ?? 0),
        medianMs: median(overall?.times ?? []),
        medianRunMs: median(runTimes),
        tasks,
        scenarioOutcomes,
      };
    })
    .filter((o) => o.attempts > 0);
}
