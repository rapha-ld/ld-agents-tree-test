import { useCallback, useMemo, useRef, useState } from 'react';
import { scenarios, schemes } from '../data';
import { defaultMode, sectionsForMode } from '../score/cost';
import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import {
  persistenceMode,
  saveEvents,
  saveSession,
  type EventKind,
  type SaveResult,
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
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

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
      at?: { scenarioId?: string; taskIndex?: number; trail?: SchemeNode[]; nodePath?: string },
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
        node_path: at?.nodePath ?? [...path, ...(node ? [node] : [])].map((n) => n.label).join(' / '),
        destination_id: node?.destinationId ?? null,
        depth: path.length + (node ? 1 : 0),
        ts: new Date().toISOString(),
      });
    },
    [scenario, taskIndex, trail],
  );

  /**
   * A failed write must never be silent. The participant is told their answers
   * were recorded, so if that is not true they need to see it while there is
   * still someone around to do something about it.
   */
  const noteSave = useCallback((result: SaveResult) => {
    if (result.remote === 'failed') {
      setSaveIssue(
        result.local
          ? 'Database not connected. Your answers are being saved locally.'
          : 'Your answers are not being saved. Please tell whoever is running this study.',
      );
      return;
    }
    if (!result.local && result.remote === 'skipped') {
      setSaveIssue('Your answers are not being saved. Please tell whoever is running this study.');
    }
  }, []);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = [];
    noteSave(await saveEvents(batch));
  }, [noteSave]);

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
    setMode(defaultMode(resolved));
    sessionStart.current = Date.now();
    taskStart.current = Date.now();
    noteSave(await saveSession(session(resolved.id, false)));
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
    setSaveIssue(null);
    setScheme(null);
    setMode(null);
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
        if (scheme) noteSave(await saveSession(session(scheme.id, true)));
        setPhase('done');
        return;
      }
      setScenarioIndex((i) => i + 1);
      setTaskIndex(0);
      setTrail([]);
      seq.current = 0;
      setPhase('scenario');
    },
    [flush, noteSave, order.length, record, scenario?.tasks.length, scenarioIndex, scheme, session, taskIndex],
  );

  const choose = (node: SchemeNode) => {
    if (node.children.length > 0) {
      record('click', node);
      setTrail((t) => [...t, node]);
      return;
    }
    void advance('submit', node);
  };

  const switchMode = (next: string) => {
    if (next === mode) return;
    const label = scheme?.modes?.find((m) => m.id === next)?.label ?? next;
    record('mode', undefined, { trail: [], nodePath: label });
    setMode(next);
    setTrail([]);
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

  const saveNotice = saveIssue ? (
    <p className="save-notice">{saveIssue}</p>
  ) : null;

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
      <>
        <div className="card">
        <h1>Navigation study</h1>
        <p>
          You will be given a series of short tasks. For each one, click through the menu to where you would expect to
          find the answer.
        </p>
        <p>
          Click through until you reach the place you would look. If you have no idea, click "I would not know where to look." Guessing
          is less useful to us than telling us you are lost.
        </p>

        <label className="field">
          Select navigation scheme
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={RANDOM}>Pick one at random</option>
            {schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Your Name
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="optional" />
        </label>

        {persistenceMode === 'local' ? (
          <p className="muted small">Database not connected. Results are being saved locally.</p>
        ) : null}

        <button className="primary" onClick={() => void start()}>
          Start
        </button>
        </div>
        {saveNotice}
      </>
    );
  }

  if (phase === 'scenario' && scenario) {
    return (
      <>
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
        {saveNotice}
      </>
    );
  }

  if (phase === 'task' && task) {
    const level = trail.length === 0 ? sectionsForMode(scheme, mode) : trail[trail.length - 1].children;
    return (
      <>
        <div className="study">
        {restartBar}
        <div className="progress">
          <div className="bar" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
        </div>
        <p className="muted small">
          Task {doneTasks + 1} of {totalTasks}
        </p>
        <h2 className="prompt">{task.prompt}</h2>

        {scheme.modes ? (
          <div className="modes" role="radiogroup" aria-label="Navigation mode">
            {scheme.modes.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={m.id === mode}
                className={m.id === mode ? 'modetab active' : 'modetab'}
                onClick={() => switchMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

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
        {saveNotice}
      </>
    );
  }

  return (
    <>
      <div className="card">
      <h1>Done</h1>
      {saveIssue ? (
        <p>
          Thank you. Please let whoever is running this study know that the message above appeared, because your answers
          may not have been stored.
        </p>
      ) : (
        <p>Thank you. Your answers are recorded.</p>
      )}
      {saveIssue === null && persistenceMode === 'local' ? (
        <p className="muted small">Database not connected. Results are saved locally.</p>
      ) : null}
      <div className="actions">
        <button className="primary" onClick={restart}>
          Run it again
        </button>
        <a className="linkbtn" href="#/report">
          See the report
        </a>
      </div>
      </div>
      {saveNotice}
    </>
  );
}
