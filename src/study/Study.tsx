import { useCallback, useEffect, useRef, useState } from 'react';
import { scenarios, schemes } from '../data';
import { reportIncluded } from '../report-included';
import { defaultMode, sectionsForMode, visibleChildren } from '../score/cost';
import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import {
  persistenceMode,
  saveEvents,
  saveResponse,
  saveSession,
  type EventKind,
  type SaveResult,
  type StudyEvent,
  type StudySession,
} from '../session';

/**
 * Asked once per task, before the participant can see the menu for that task.
 * Stored with each answer so rewording it later cannot change what old answers
 * mean.
 *
 * Per task rather than per scenario: one scenario covers several different jobs,
 * and the word someone reaches for when turning a flag off is not the word they
 * reach for when checking whether it worked.
 */
export const LABEL_PROMPT = 'What navigation label would you look for?';

/**
 * Scenarios run in the order they are authored, which `src/data.ts` takes from
 * the filenames. They were shuffled per participant to spread order effects
 * across the sample; they are not any more, because the scenarios tell a
 * sequence. Someone shipping their first flag has not had a pager go off yet,
 * and a run that opens on the incident asks them to fix something they never
 * released. Every participant now sees the same order, which trades order
 * effects for a coherent story and makes runs directly comparable.
 *
 * Tasks inside a scenario were already in file order.
 */

/**
 * Which menu this participant gets, from `?scheme=<id>` in the link.
 *
 * Participants no longer choose: the operator sends a link per menu, so
 * assignment is a property of the link rather than something a participant can
 * change. Three outcomes, kept distinct on purpose:
 *
 * - a known id: use it.
 * - no parameter at all: assign at random, which keeps a bare link usable.
 * - an id we do not recognise: refuse to start. Falling back to random here
 *   would attribute the run to a menu nobody meant to test, and a typo in a
 *   link sent to twenty people is worth catching loudly.
 */
function requestedScheme(): { scheme: Scheme; assigned: 'link' | 'random' } | { badId: string } {
  const wanted = new URLSearchParams(window.location.search).get('scheme');
  if (wanted === null || wanted === '') {
    return { scheme: schemes[Math.floor(Math.random() * schemes.length)], assigned: 'random' };
  }
  const found = schemes.find((s) => s.id === wanted);
  return found ? { scheme: found, assigned: 'link' } : { badId: wanted };
}

/**
 * Scenario context is authored as markdown, so hard-wrapped lines inside a
 * paragraph need rejoining before display.
 */
function contextParagraphs(scenario: Scenario): string[] {
  return scenario.context
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

type Phase = 'intro' | 'scenario' | 'expect' | 'task' | 'done';

/**
 * How many scenarios and how many tasks each carries, read from the loaded
 * files. Hard-coding these in the intro invites a contradiction with the
 * "Scenario 1 of 4" counter the moment a scenario is added or removed.
 */
function shape(all: Scenario[]): { scenarios: number; tasks: string } {
  const counts = all.map((s) => s.tasks.length);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  return { scenarios: all.length, tasks: low === high ? `${low}` : `${low} to ${high}` };
}

export function Study() {
  // Fixed for the whole visit: the link decides the menu, so re-reading it per
  // run cannot hand the same person a different menu on a second attempt.
  const [assignment] = useState(requestedScheme);
  const [studyShape] = useState(() => shape(scenarios));
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [taskIndex, setTaskIndex] = useState(0);
  const [trail, setTrail] = useState<SchemeNode[]>([]);
  const [label, setLabel] = useState('');
  const [guess, setGuess] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  const sessionId = useRef<string>(crypto.randomUUID());
  const seq = useRef(0);
  const sessionStart = useRef<number>(Date.now());
  const taskStart = useRef<number>(0);
  const pending = useRef<StudyEvent[]>([]);
  /** Bumped each time this task's label answer is submitted again after a step back. */
  const revision = useRef(0);

  const scenario: Scenario | undefined = scenarios[scenarioIndex];
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

  /**
   * Without this, closing the tab mid-task loses that task's clicks: flush()
   * otherwise only runs when a participant advances. pagehide and a hidden
   * visibilitychange rather than beforeunload, which Safari does not fire
   * reliably. Abandoned runs are the ones worth keeping, because where someone
   * gave up is a result in itself.
   */
  useEffect(() => {
    const flushQuietly = () => {
      if (pending.current.length === 0) return;
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushQuietly();
    };
    window.addEventListener('pagehide', flushQuietly);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushQuietly);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

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
    if ('badId' in assignment || label.trim() === '') return;
    const resolved = assignment.scheme;
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
    setScenarioIndex(0);
    setTaskIndex(0);
    setTrail([]);
    setGuess('');
    revision.current = 0;
    setPhase('intro');
  };

  /**
   * Save what they said they would look for on this task, then let them at the
   * menu. Written before the menu appears so it cannot be revised once the real
   * labels are on screen, which is the whole point of asking first.
   */
  const submitExpectation = async () => {
    if (!scenario || guess.trim() === '') return;
    noteSave(
      await saveResponse({
        session_id: sessionId.current,
        scenario_id: scenario.id,
        task_index: taskIndex,
        revision: revision.current,
        prompt: LABEL_PROMPT,
        response: guess.trim(),
        ts: new Date().toISOString(),
      }),
    );
    // Kept rather than cleared, so stepping back shows what they wrote and can
    // be edited. Cleared when the next task begins.
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
        // The next task asks what they expect before showing the menu again, so
        // the 'start' event is recorded there rather than here.
        setTaskIndex(taskIndex + 1);
        setTrail([]);
        seq.current = 0;
        setGuess('');
        revision.current = 0;
        setPhase('expect');
        return;
      }

      const isLastScenario = scenarioIndex + 1 >= scenarios.length;
      if (isLastScenario) {
        if (scheme) noteSave(await saveSession(session(scheme.id, true)));
        setPhase('done');
        return;
      }
      setScenarioIndex((i) => i + 1);
      setTaskIndex(0);
      setTrail([]);
      seq.current = 0;
      setGuess('');
      revision.current = 0;
      setPhase('scenario');
    },
    [flush, noteSave, record, scenario?.tasks.length, scenarioIndex, scheme, session, taskIndex],
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

  /**
   * Leave this card for the one before it. Bounded to the current task on
   * purpose: stepping back across a task boundary would mean re-answering
   * something already recorded as finished, and the run would no longer describe
   * one pass through the study.
   *
   * Recorded as `stepback` rather than `back`, because wanting to change an
   * answer is a different act from moving up a level inside the menu. Coming back
   * to the question keeps what they wrote and bumps the revision, so a changed
   * answer is stored as a new row and the highest revision is the final one.
   */
  const stepBack = () => {
    if (phase === 'task') {
      record('stepback', undefined, { nodePath: 'task' });
      revision.current += 1;
      setTrail([]);
      setPhase('expect');
      return;
    }
    if (phase === 'expect') {
      record('stepback', undefined, { trail: [], nodePath: 'expect' });
      setPhase('scenario');
    }
  };

  const canStepBack = phase === 'task' || phase === 'expect';

  const scenarioTasks = scenario?.tasks.length ?? 0;

  /**
   * Progress is reported per scenario rather than across all 31 tasks. A single
   * bar creeping across the whole run tells a participant almost nothing, and
   * "task 2 of 3" is something they can actually act on.
   */
  const scenarioProgress = (
    <div className="progress-block">
      <p className="progress-meta">
        <span>
          Scenario {scenarioIndex + 1} of {scenarios.length}
        </span>
        <span>
          Task {taskIndex + 1} of {scenarioTasks}
        </span>
      </p>
      <div
        className="segments"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={scenarioTasks}
        // Matches the filled segment count and the visible "Task 1 of 3", so the
        // announced value and the drawn one cannot disagree.
        aria-valuenow={taskIndex + 1}
        aria-label={`Task ${taskIndex + 1} of ${scenarioTasks} in this scenario`}
      >
        {Array.from({ length: scenarioTasks }, (_, i) => (
          <span key={i} className={i <= taskIndex ? 'segment filled' : 'segment'} />
        ))}
      </div>
    </div>
  );

  /**
   * Repeated on every task page. A prompt like "turn off the feature that
   * shipped this morning" is meaningless without the incident it belongs to,
   * and a participant who leaves and comes back would otherwise never see the
   * context again.
   */
  const scenarioContext = scenario ? (
    <section className="scenario-context" aria-label="Scenario">
      {contextParagraphs(scenario).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  ) : null;

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
      <button className="ghost small-btn" onClick={stepBack} disabled={!canStepBack}>
        Back
      </button>
      <button className="ghost small-btn" onClick={() => setConfirmRestart(true)}>
        Start over
      </button>
    </div>
  );

  // A link with an unknown menu id is a broken link. Starting anyway would file
  // the run against a menu nobody meant to test, so it stops here instead.
  if ('badId' in assignment) {
    return (
      <div className="card">
        <h1>This link is not quite right</h1>
        <p>
          It asks for a menu called <code>{assignment.badId}</code>, which does not exist. Please ask whoever sent it
          for a new one.
        </p>
      </div>
    );
  }

  if (phase === 'intro' || !scheme) {
    return (
      <>
        <div className="card">
        <h1>Navigation study</h1>
        <p>
          You will be given {studyShape.scenarios} scenarios, each with {studyShape.tasks} tasks. Every task has two
          steps. First you tell us, in your own words, what you would call the section you would look in, before any
          menu is on screen. Then the menu appears and you click through it to where you would go to do the task.
        </p>
        <p>
          Click through until you reach the place you would look. If you have no idea, click "I would not know where to look." Guessing
          is less useful to us than telling us you are lost.
        </p>

        <label className="field">
          Your name
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void start();
            }}
          />
        </label>

        {persistenceMode === 'local' ? (
          <p className="muted small">Database not connected. Results are being saved locally.</p>
        ) : null}

        <button className="primary" onClick={() => void start()} disabled={label.trim() === ''}>
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
          Scenario {scenarioIndex + 1} of {scenarios.length}
        </p>
        {contextParagraphs(scenario).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        <button
          className="primary"
          autoFocus
          onClick={() => {
            setGuess('');
            setPhase('expect');
          }}
        >
          Continue
        </button>
        </div>
        {saveNotice}
      </>
    );
  }

  /**
   * Step one of every task: the job in words, and what they would call the
   * section, before any menu is on screen. Asking first is the whole point, so
   * the menu is not rendered anywhere on this page.
   */
  if (phase === 'expect' && scenario && task) {
    return (
      <>
        <div className="card">
        {restartBar}
        {scenarioProgress}
        {scenarioContext}
        <h2 className="prompt">{task.prompt}</h2>

        <label className="field">
          {LABEL_PROMPT}
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              // Enter submits, so the answer can be given without reaching for
              // the mouse. A section name is a few words, so one line is the
              // right shape for it.
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitExpectation();
              }
            }}
          />
        </label>

        <button className="primary" onClick={() => void submitExpectation()} disabled={guess.trim() === ''}>
          Submit
        </button>
        </div>
        {saveNotice}
      </>
    );
  }

  if (phase === 'task' && task) {
    const level =
      trail.length === 0 ? sectionsForMode(scheme, mode) : visibleChildren(trail[trail.length - 1], mode);
    return (
      <>
        <div className="study">
        {restartBar}
        {scenarioProgress}
        {scenarioContext}
        <h2 className="prompt">{task.prompt}</h2>
        <p className="muted small">Select the page you&rsquo;d try first. Explain your choice.</p>

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
              <button onClick={goBack}>Up one level</button>
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
        {reportIncluded ? (
          <a className="linkbtn" href="#/report">
            See the report
          </a>
        ) : null}
      </div>
      </div>
      {saveNotice}
    </>
  );
}
