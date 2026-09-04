import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import type { StudyEvent, StudyResponse, StudySession } from '../session';

export type ResultsFile = {
  sessions: StudySession[];
  events: StudyEvent[];
  /** Absent in files exported before the label question existed. */
  responses?: StudyResponse[];
};

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
  /**
   * Among attempts whose first move could be evaluated, how many were heading
   * somewhere the answer lives. Null when none could be evaluated, which the
   * report renders as "no data" rather than as zero.
   */
  firstClickRate: number | null;
  firstClickKnown: number;
  giveupRate: number | null;
  medianMs: number | null;
  /** Median time for one participant to get through every scenario. */
  medianRunMs: number | null;
  /** Every session assigned this scheme, finished or not. */
  startedSessions: number;
  /** Sessions that reached the end. Only these feed the rates above. */
  finishedSessions: number;
  /** Sessions that started and stopped partway. Stored, but excluded from rates. */
  abandonedSessions: number;
  /**
   * Median number of tasks an abandoned run got through before stopping. Null
   * when nobody abandoned. Where people quit is a result in its own right.
   */
  medianTasksBeforeAbandon: number | null;
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

  /**
   * Tasks a session actually got through, counted for every session including
   * abandoned ones. A task counts once it has a submit or a giveup; clicks
   * alone mean the participant was still working on it.
   */
  const tasksCompleted = new Map<string, Set<string>>();
  for (const event of results.events) {
    if (event.kind !== 'submit' && event.kind !== 'giveup') continue;
    const done = tasksCompleted.get(event.session_id) ?? new Set<string>();
    done.add(`${event.scenario_id}|${event.task_index}`);
    tasksCompleted.set(event.session_id, done);
  }

  const started = new Map<string, number>();
  const finished = new Map<string, number>();
  const abandonedTaskCounts = new Map<string, number[]>();
  for (const session of results.sessions) {
    const schemeId = session.scheme_id;
    started.set(schemeId, (started.get(schemeId) ?? 0) + 1);
    if (session.finished_at) {
      finished.set(schemeId, (finished.get(schemeId) ?? 0) + 1);
      continue;
    }
    const counts = abandonedTaskCounts.get(schemeId) ?? [];
    counts.push(tasksCompleted.get(session.id)?.size ?? 0);
    abandonedTaskCounts.set(schemeId, counts);
  }

  type Acc = {
    attempts: number;
    successes: number;
    direct: number;
    firstClick: number;
    /**
     * Attempts where the first move could actually be evaluated. A click path
     * only resolves if its labels still match the scheme, so a renamed label
     * makes old events unreadable. Without this the rate silently reported 0%,
     * which is indistinguishable from everyone guessing wrong.
     */
    firstClickKnown: number;
    giveups: number;
    times: number[];
  };
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
    const fresh: Acc = { attempts: 0, successes: 0, direct: 0, firstClick: 0, firstClickKnown: 0, giveups: 0, times: [] };
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
        for (const a of [acc, schemeAcc]) a.firstClickKnown += 1;
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
        for (const a of [acc, schemeAcc]) a.firstClickKnown += 1;
        const reachable = subtreeIds(node);
        if ([...accepted].some((id) => reachable.has(id))) {
          for (const a of [acc, schemeAcc]) a.firstClick += 1;
        }
      }
    } else if (terminal.kind === 'submit' && terminal.destination_id) {
      // Answered at the top level without drilling, so the submit itself is the
      // first move, and it is one we can judge either way. Counting only the
      // correct ones here would have kept wrong top-level answers out of the
      // metric entirely.
      for (const a of [acc, schemeAcc]) a.firstClickKnown += 1;
      if (accepted.has(terminal.destination_id)) {
        for (const a of [acc, schemeAcc]) a.firstClick += 1;
      }
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
        firstClickRate: rate(overall?.firstClick ?? 0, overall?.firstClickKnown ?? 0),
        firstClickKnown: overall?.firstClickKnown ?? 0,
        giveupRate: rate(overall?.giveups ?? 0, overall?.attempts ?? 0),
        medianMs: median(overall?.times ?? []),
        medianRunMs: median(runTimes),
        startedSessions: started.get(scheme.id) ?? 0,
        finishedSessions: finished.get(scheme.id) ?? 0,
        abandonedSessions: abandonedTaskCounts.get(scheme.id)?.length ?? 0,
        medianTasksBeforeAbandon: median(abandonedTaskCounts.get(scheme.id) ?? []),
        tasks,
        scenarioOutcomes,
      };
    })
    /**
     * A scheme with no finished attempts still has something to say if anyone
     * started it. Filtering on attempts alone hid the worst possible outcome,
     * a scheme every participant abandoned, behind an empty report.
     */
    .filter((o) => o.attempts > 0 || o.startedSessions > 0);
}

export type SessionSummary = {
  sessionId: string;
  label: string | null;
  schemeId: string;
  startedAt: string;
  finished: boolean;
  /** Start to last recorded event. Null when the session left no events. */
  durationMs: number | null;
  tasksCompleted: number;
  successes: number;
  giveups: number;
};

/**
 * One row per person who started, for the participants table.
 *
 * Separate from analyze() because it answers a different question: analyze
 * compares menus, this describes people. It counts abandoned runs too, since
 * deciding whether to keep a run is exactly what the table is for.
 */
export function summarizeSessions(results: ResultsFile, scenarios: Scenario[]): SessionSummary[] {
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  type Agg = { completed: Set<string>; successes: number; giveups: number; lastTs: number };
  const bySession = new Map<string, Agg>();
  const aggFor = (id: string) => {
    const existing = bySession.get(id);
    if (existing) return existing;
    const fresh: Agg = { completed: new Set(), successes: 0, giveups: 0, lastTs: 0 };
    bySession.set(id, fresh);
    return fresh;
  };

  for (const event of results.events) {
    const agg = aggFor(event.session_id);
    agg.lastTs = Math.max(agg.lastTs, Date.parse(event.ts));
    if (event.kind !== 'submit' && event.kind !== 'giveup') continue;

    agg.completed.add(`${event.scenario_id}|${event.task_index}`);
    if (event.kind === 'giveup') {
      agg.giveups += 1;
      continue;
    }
    const task = scenarioById.get(event.scenario_id)?.tasks[event.task_index];
    if (!task) continue;
    const accepted = new Set([...task.targets, ...task.accept]);
    if (event.destination_id && accepted.has(event.destination_id)) agg.successes += 1;
  }

  return results.sessions.map((session) => {
    const agg = bySession.get(session.id);
    const start = Date.parse(session.started_at);
    const end = session.finished_at ? Date.parse(session.finished_at) : (agg?.lastTs ?? 0);
    return {
      sessionId: session.id,
      label: session.participant_label,
      schemeId: session.scheme_id,
      startedAt: session.started_at,
      finished: session.finished_at !== null,
      durationMs: end > start ? end - start : null,
      tasksCompleted: agg?.completed.size ?? 0,
      successes: agg?.successes ?? 0,
      giveups: agg?.giveups ?? 0,
    };
  });
}
