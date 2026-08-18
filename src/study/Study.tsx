import { useCallback, useMemo, useRef, useState } from 'react';
import { scenarios, schemes } from '../data';
import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import {
  persistenceMode,
  saveEvents,
  saveSession,
  type EventKind,
  type StudyEvent,
  type StudySession,
} from '../session';

const RANDOM = 'random';

/** Fisher-Yates. Scenario order varies per participant. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function initialChoice(): string {
  const wanted = new URLSearchParams(window.location.search).get('scheme');
  return wanted && schemes.some((s) => s.id === wanted) ? wanted : RANDOM;
}

function resolveScheme(choice: string): Scheme {
  const found = schemes.find((s) => s.id === choice);
  if (found) return found;
  // Uniform random assignment: the insert-only table gives the client no way to
  // read existing counts and balance them.
  return schemes[Math.floor(Math.random() * schemes.length)];
}

type Phase = 'intro' | 'scenario' | 'task' | 'done';

export function Study() {
  const [choice, setChoice] = useState(initialChoice);
  // Resolved when the run starts, so picking Random gives a fresh draw each time.
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [order, setOrder] = useState<Scenario[]>(() => shuffled(scenarios));
  const [phase, setPhase] = useState<Phase>('intro');
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [trail, setTrail] = useState<SchemeNode[]>([]);
  const [label, setLabel] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);

  const sessionId = useRef<string>(crypto.randomUUID());
  const seq = useRef(0);
  const sessionStart = useRef<number>(Date.now());
  const taskStart = useRef<number>(0);
  const pending = useRef<StudyEvent[]>([]);

  const scenario: Scenario | undefined = order[scenarioIndex];
  const task = scenario?.tasks[taskIndex];

  const record = useCallback(
    (
      kind: EventKind,
      node?: SchemeNode,
      at?: { scenarioId?: string; taskIndex?: number; trail?: SchemeNode[] },
    ) => {
      const scenarioId = at?.scenarioId ?? scenario?.id;
      if (!scenarioId) return;
      const path = at?.trail ?? trail;
      seq.current += 1;
      pending.current.push({
        session_id: sessionId.current,
        scenario_id: scenarioId,
        task_index: at?.taskIndex ?? taskIndex,
        seq: seq.current,
        kind,
        node_path: [...path, ...(node ? [node] : [])].map((n) => n.label).join(' / '),
        destination_id: node?.destinationId ?? null,
        depth: path.length + (node ? 1 : 0),
        ts: new Date().toISOString(),
      });
    },
    [scenario, taskIndex, trail],
  );

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = [];
    await saveEvents(batch);
  }, []);

  const session = useCallback(
    (schemeId: string, finished: boolean): StudySession => ({
      id: sessionId.current,
      participant_label: label.trim() === '' ? null : label.trim(),
      scheme_id: schemeId,
      started_at: new Date(sessionStart.current).toISOString(),
      finished_at: finished ? new Date().toISOString() : null,
      user_agent: navigator.userAgent,
    }),
    [label],
  );

  const start = async () => {
    const resolved = resolveScheme(choice);
    setScheme(resolved);
    sessionStart.current = Date.now();
    taskStart.current = Date.now();
    await saveSession(session(resolved.id, false));
    setPhase('scenario');
  };

  /**
   * Abandon this run and go back to the start. The new run gets its own session
   * id; only sessions that reach the end are counted, so the abandoned rows do
   * not pollute the results.
   */
  const restart = () => {
    pending.current = [];
    seq.current = 0;
    sessionId.current = crypto.randomUUID();
    setConfirmRestart(false);
    setScheme(null);
    setOrder(shuffled(scenarios));
    setScenarioIndex(0);
    setTaskIndex(0);
    setTrail([]);
    setPhase('intro');
  };

  const beginTask = () => {
    taskStart.current = Date.now();
    setTrail([]);
    record('start');
    setPhase('task');
  };

  const advance = useCallback(
    async (kind: 'submit' | 'giveup', node?: SchemeNode, pathOverride?: SchemeNode[]) => {
      record(kind, node, pathOverride ? { trail: pathOverride } : undefined);
      await flush();

      const isLastTask = taskIndex + 1 >= (scenario?.tasks.length ?? 0);
      if (!isLastTask) {
        const nextTask = taskIndex + 1;
        setTaskIndex(nextTask);
        setTrail([]);
        taskStart.current = Date.now();
        seq.current = 0;
        record('start', undefined, { taskIndex: nextTask, trail: [] });
        return;
      }

      const isLastScenario = scenarioIndex + 1 >= order.length;
      if (isLastScenario) {
        if (scheme) await saveSession(session(scheme.id, true));
        setPhase('done');
        return;
      }
      setScenarioIndex((i) => i + 1);
      setTaskIndex(0);
      setTrail([]);
      seq.current = 0;
      setPhase('scenario');
    },
    [flush, order.length, record, scenario?.tasks.length, scenarioIndex, scheme, session, taskIndex],
  );

  const choose = (node: SchemeNode) => {
    if (node.children.length > 0) {
      record('click', node);
      setTrail((t) => [...t, node]);
      return;
    }
    void advance('submit', node);
  };

  const goBack = () => {
    record('back');
    setTrail((t) => t.slice(0, -1));
  };

  const totalTasks = useMemo(() => order.reduce((s, x) => s + x.tasks.length, 0), [order]);
  const doneTasks = useMemo(
    () => order.slice(0, scenarioIndex).reduce((s, x) => s + x.tasks.length, 0) + taskIndex,
    [order, scenarioIndex, taskIndex],
  );

  const restartBar = confirmRestart ? (
    <div className="restart-confirm">
      <span>Start over from the beginning? This run&rsquo;s answers are discarded.</span>
      <span className="confirm-actions">
        <button onClick={restart}>Yes, start over</button>
        <button className="ghost" onClick={() => setConfirmRestart(false)}>
          Keep going
        </button>
      </span>
    </div>
  ) : (
    <div className="restart-bar">
      <button className="ghost small-btn" onClick={() => setConfirmRestart(true)}>
        Start over
      </button>
    </div>
  );

  if (phase === 'intro' || !scheme) {
    return (
      <div className="card">
        <h1>Navigation study</h1>
        <p>
          You will be given a series of short tasks. For each one, click through the menu to where you would expect to
          find the answer. There is no content behind the labels, and nothing will tell you whether you were right.
        </p>
        <p>
          Click through until you reach the place you would look. If you have no idea, say so and move on. Guessing
          wildly is less useful to us than telling us you are lost.
        </p>
        <p className="muted">
          {totalTasks} tasks across {order.length} scenarios. About 10 minutes.
        </p>

        <label className="field">
          Which menu to test
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={RANDOM}>Pick one at random</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="hint">
            {choice === RANDOM
              ? 'Random is the right choice for a real study, because it keeps participants from being compared unfairly.'
              : 'Choose Random instead if you are collecting results you want to compare across menus.'}
          </span>
        </label>

        <label className="field">
          Name or initials (optional)
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
        </label>

        <button className="primary" onClick={() => void start()}>
          Start
        </button>
        <p className="muted small">
          Results are saved {persistenceMode === 'supabase' ? 'to the study database' : 'in this browser'}.
        </p>
      </div>
    );
  }

  if (phase === 'scenario' && scenario) {
    return (
      <div className="card">
        {restartBar}
        <p className="muted small">
          Scenario {scenarioIndex + 1} of {order.length}
        </p>
        <h2>{scenario.persona}</h2>
        {scenario.context
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
          .filter(Boolean)
          .map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        <button className="primary" onClick={beginTask}>
          Continue
        </button>
      </div>
    );
  }

  if (phase === 'task' && task) {
    const level = trail.length === 0 ? scheme.sections : trail[trail.length - 1].children;
    return (
      <div className="study">
        {restartBar}
        <div className="progress">
          <div className="bar" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
        </div>
        <p className="muted small">
          Task {doneTasks + 1} of {totalTasks}
        </p>
        <h2 className="prompt">{task.prompt}</h2>

        <nav className="crumbs" aria-label="Where you are">
          <button
            className="crumb"
            onClick={() => {
              record('back');
              setTrail([]);
            }}
            disabled={trail.length === 0}
          >
            Top level
          </button>
          {trail.map((node, i) => (
            <span key={`${node.label}-${i}`}>
              <span className="sep">/</span>
              <button
                className="crumb"
                onClick={() => {
                  record('back');
                  setTrail((t) => t.slice(0, i + 1));
                }}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>

        <ul className="tree">
          {level.map((node, i) => (
            <li key={`${node.label}-${i}`}>
              <button className="node" onClick={() => choose(node)}>
                <span>{node.label}</span>
                {node.children.length > 0 ? <span className="chev">&rsaquo;</span> : null}
              </button>
            </li>
          ))}
        </ul>

        <div className="actions">
          {trail.length > 0 ? (
            <>
              <button onClick={goBack}>Back</button>
              <button
                className="primary"
                // The current node is already the last trail entry, so the path
                // passed here excludes it to avoid recording it twice.
                onClick={() => void advance('submit', trail[trail.length - 1], trail.slice(0, -1))}
              >
                I would look here
              </button>
            </>
          ) : null}
          <button className="ghost" onClick={() => void advance('giveup')}>
            I would not know where to look
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Done</h1>
      <p>Thank you. Your answers are recorded.</p>
      <p className="muted small">
        {persistenceMode === 'supabase'
          ? 'Saved to the study database.'
          : 'Saved in this browser. Whoever is running the study can export them from the report page.'}
      </p>
      <div className="actions">
        <button className="primary" onClick={restart}>
          Run it again
        </button>
        <a className="linkbtn" href="#/report">
          See the report
        </a>
      </div>
    </div>
  );
}
