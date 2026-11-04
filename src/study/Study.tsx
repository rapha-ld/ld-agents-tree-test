import { useCallback, useEffect, useRef, useState } from 'react';
import { scenarios, schemes } from '../data';
import { reportIncluded } from '../report-included';
import type { Scenario, Scheme, SchemeNode } from '../parse/types';
import {
  checkWrite,
  exportLocalResults,
  persistenceMode,
  saveEvents,
  saveSession,
  saveTaskResult,
  type EventKind,
  type SaveResult,
  type StudyEvent,
  type StudySession,
} from '../session';
import { classifyTask } from './outcome';

/** Shown before the scenario, from the study page. */
const INTRO =
  "You'll see a menu from a software product. For each task, click through the menu to where you'd expect to do it, then choose \u2018I'd find it here\u2019. You can go back up the menu as often as you like. We're testing the menu, not you.";

export const CONFIDENCE_PROMPT = 'How confident are you that you picked the right page?';
export const UNSURE_PROMPT = 'What made you unsure?';

/** Asked on the intro screen so LaunchDarkly experience can be balanced across groups. */
export const LD_USAGE_OPTIONS = [
  { id: 'regularly', label: 'Yes, I use it regularly' },
  { id: 'a-few-times', label: 'Yes, a few times' },
  { id: 'never', label: 'No, never' },
] as const;

/** Post-test grid, from the study page. Survey only, not scored. */
export const CAPABILITIES = [
  { id: 'try-before-customers', label: 'Try out changes to an AI feature before customers see them' },
  { id: 'small-percentage-first', label: 'Give a new version of an AI feature to a small percentage of customers first' },
  { id: 'see-cost', label: 'See what your AI features cost' },
  { id: 'find-cheaper-model', label: 'Automatically find a cheaper or better AI model for a feature' },
  { id: 'connect-bots', label: 'Connect several AI bots so they hand work to each other' },
  { id: 'grade-answers', label: 'Grade AI answers automatically' },
  { id: 'host-code', label: "Host and run your AI feature's code" },
  { id: 'train-models', label: 'Train or fine-tune your own AI models' },
] as const;

const SURVEY_CHOICES = [
  { id: 'yes', label: 'Yes' },
  { id: 'not-sure', label: 'Not sure' },
  { id: 'no', label: 'No' },
] as const;

type SaveIssue = { message: string; reason: string | null };

function downloadLocalResults(): void {
  const blob = new Blob([exportLocalResults()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'agents-tree-test-results.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyLocalResults(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportLocalResults());
    return true;
  } catch {
    return false;
  }
}

const pathKey = (path: SchemeNode[]) => path.map((n) => n.label).join('/');

/** Fisher-Yates. Every participant gets every task, each in their own order. */
export function shuffled(count: number, random: () => number = Math.random): number[] {
  const out = Array.from({ length: count }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Which tree this participant gets. `?scheme=tree-a` or `?scheme=tree-b`
 * forces one; no parameter assigns at random; an unknown id refuses to start.
 */
function requestedScheme(): { scheme: Scheme; assigned: 'link' | 'random' } | { badId: string } {
  const wanted = new URLSearchParams(window.location.search).get('scheme');
  if (wanted === null || wanted === '') {
    return { scheme: schemes[Math.floor(Math.random() * schemes.length)], assigned: 'random' };
  }
  const found = schemes.find((s) => s.id === wanted);
  return found ? { scheme: found, assigned: 'link' } : { badId: wanted };
}

function contextParagraphs(scenario: Scenario): string[] {
  return scenario.context
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

type Phase = 'intro' | 'scenario' | 'task' | 'confidence' | 'survey' | 'done';

/** The study has one scenario; every task comes from it. */
const scenario: Scenario | undefined = scenarios[0];
const taskCount = scenario?.tasks.length ?? 0;

export function Study() {
  const [assignment] = useState(requestedScheme);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [order, setOrder] = useState<number[]>(() => shuffled(taskCount));
  const [position, setPosition] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ node: SchemeNode; path: SchemeNode[] } | null>(null);
  const [label, setLabel] = useState('');
  const [ldUsage, setLdUsage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [unsure, setUnsure] = useState('');
  const [survey, setSurvey] = useState<Record<string, string>>({});
  const [confusing, setConfusing] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [saveIssue, setSaveIssue] = useState<SaveIssue | null>(null);
  const [writeBlocked, setWriteBlocked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /**
   * True while a save is in flight. Buttons that move on are disabled, so a
   * double click on a slow connection can't skip or score a task twice.
   */
  const [busy, setBusy] = useState(false);

  const sessionId = useRef<string>(crypto.randomUUID());
  const seq = useRef(0);
  const sessionStart = useRef<number>(Date.now());
  const pending = useRef<StudyEvent[]>([]);
  /** Every event of the current task, kept to score it once it ends. */
  const taskEvents = useRef<StudyEvent[]>([]);

  const taskIndex = order[position] ?? 0;
  const task = scenario?.tasks[taskIndex];

  const record = useCallback(
    (kind: EventKind, node?: SchemeNode, trail: SchemeNode[] = []) => {
      if (!scenario) return;
      seq.current += 1;
      const event: StudyEvent = {
        session_id: sessionId.current,
        scenario_id: scenario.id,
        task_index: taskIndex,
        seq: seq.current,
        kind,
        node_path: [...trail, ...(node ? [node] : [])].map((n) => n.label).join(' / '),
        destination_id: node?.destinationId ?? null,
        depth: trail.length + (node ? 1 : 0),
        ts: new Date().toISOString(),
      };
      pending.current.push(event);
      taskEvents.current.push(event);
    },
    [taskIndex],
  );

  const noteSave = useCallback((result: SaveResult) => {
    if (result.remote === 'failed') {
      setSaveIssue({
        message: result.local
          ? 'Database not connected. Your answers are being saved locally.'
          : 'Your answers are not being saved. Please tell whoever is running this study.',
        reason: result.error ?? null,
      });
      return;
    }
    if (!result.local && result.remote === 'skipped') {
      setSaveIssue({
        message: 'Your answers are not being saved. Please tell whoever is running this study.',
        reason: null,
      });
    }
  }, []);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = [];
    noteSave(await saveEvents(batch));
  }, [noteSave]);

  // Closing the tab mid-task would otherwise lose that task's clicks.
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

  useEffect(() => {
    if (persistenceMode === 'local') return;
    let live = true;
    void checkWrite().then((result) => {
      if (live) setWriteBlocked(result.ok ? null : result.reason);
    });
    return () => {
      live = false;
    };
  }, []);

  const session = useCallback(
    (schemeId: string, finished: boolean): StudySession => ({
      id: sessionId.current,
      participant_label: label.trim() === '' ? null : label.trim(),
      scheme_id: schemeId,
      started_at: new Date(sessionStart.current).toISOString(),
      finished_at: finished ? new Date().toISOString() : null,
      user_agent: navigator.userAgent,
      ld_usage: ldUsage,
      task_order: order,
      survey: finished ? survey : null,
      survey_confusing: finished && confusing.trim() !== '' ? confusing.trim() : null,
    }),
    [label, ldUsage, order, survey, confusing],
  );

  const canStart = label.trim() !== '' && ldUsage !== null;

  const start = () =>
    once(async () => {
      if ('badId' in assignment || !canStart) return;
      sessionStart.current = Date.now();
      noteSave(await saveSession(session(assignment.scheme.id, false)));
      setScheme(assignment.scheme);
      setPhase('scenario');
    });

  /** Fresh tree, fresh event trail, then the 'start' that times the task. */
  const beginTask = () => {
    setOpen(new Set());
    setSelected(null);
    seq.current = 0;
    taskEvents.current = [];
    record('start');
    setPhase('task');
  };

  // 'start' must carry the new task's index, so it is recorded after the
  // position has changed and React has re-rendered with it.
  const startPending = useRef(false);
  useEffect(() => {
    if (startPending.current && phase === 'task') {
      startPending.current = false;
      beginTask();
    }
  }, [position, phase]);

  const restart = () => {
    pending.current = [];
    taskEvents.current = [];
    seq.current = 0;
    sessionId.current = crypto.randomUUID();
    setConfirmRestart(false);
    setSaveIssue(null);
    setScheme(null);
    setOrder(shuffled(taskCount));
    setPosition(0);
    setOpen(new Set());
    setSelected(null);
    setConfidence(null);
    setUnsure('');
    setSurvey({});
    setConfusing('');
    setPhase('intro');
  };

  /** Score this task from its events and store one row for it. */
  const saveTask = async (conf: number | null, reason: string | null) => {
    if (!scenario || !task) return;
    const accepted = new Set([...task.targets, ...task.accept]);
    const scored = classifyTask(taskEvents.current, accepted);
    if (!scored) return;
    noteSave(
      await saveTaskResult({
        session_id: sessionId.current,
        scenario_id: scenario.id,
        task_index: taskIndex,
        position,
        prompt: task.prompt,
        outcome: scored.outcome,
        answer_path: scored.answerPath,
        answer_destination: scored.answerDestination,
        first_click: scored.firstClick,
        time_on_task_ms: scored.timeMs,
        confidence: conf,
        unsure_reason: reason,
        ts: new Date().toISOString(),
      }),
    );
  };

  const nextTask = () => {
    setConfidence(null);
    setUnsure('');
    if (position + 1 >= order.length) {
      setPhase('survey');
      return;
    }
    startPending.current = true;
    setPosition((p) => p + 1);
    setPhase('task');
  };

  /** Run one step that saves, once, however many times it is clicked. */
  const once = async (step: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await step();
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    once(async () => {
      if (!selected) return;
      record('submit', selected.node, selected.path.slice(0, -1));
      await flush();
      setPhase('confidence');
    });

  /** A skip counts as a failure but is reported on its own. No confidence question. */
  const skip = () =>
    once(async () => {
      record('giveup');
      await flush();
      await saveTask(null, null);
      nextTask();
    });

  const submitConfidence = () =>
    once(async () => {
      if (confidence === null) return;
      await saveTask(confidence, confidence <= 4 && unsure.trim() !== '' ? unsure.trim() : null);
      nextTask();
    });

  const finish = () =>
    once(async () => {
      if (!scheme) return;
      noteSave(await saveSession(session(scheme.id, true)));
      setPhase('done');
    });

  /**
   * Treejack-style: everything starts closed. Opening a section is a click,
   * closing it is a back. A section that is also a page (Agents, Configs) is
   * picked as it opens, so it can be the answer.
   */
  const toggle = (node: SchemeNode, path: SchemeNode[]) => {
    const key = pathKey(path);
    const parents = path.slice(0, -1);
    if (open.has(key)) {
      record('back', node, parents);
      setOpen((prev) => {
        const next = new Set(prev);
        for (const k of prev) if (k === key || k.startsWith(`${key}/`)) next.delete(k);
        return next;
      });
      if (selected && pathKey(selected.path).startsWith(key) && pathKey(selected.path) !== key) setSelected(null);
      return;
    }
    record('click', node, parents);
    setOpen((prev) => new Set(prev).add(key));
    // The tick always shows the last thing clicked, so opening a plain section
    // clears it rather than leaving an earlier pick selected out of view.
    setSelected(node.destinationId ? { node, path } : null);
  };

  const pick = (node: SchemeNode, path: SchemeNode[]) => {
    record('click', node, path.slice(0, -1));
    setSelected({ node, path });
  };

  const saveNotice = saveIssue ? (
    <p className="save-notice">
      {saveIssue.message}
      {saveIssue.reason === null ? null : <span className="save-reason">{saveIssue.reason}</span>}
    </p>
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
      <span />
      <button className="ghost small-btn" onClick={() => setConfirmRestart(true)}>
        Start over
      </button>
    </div>
  );

  const progress = (
    <div className="progress-block">
      <div
        className="segments"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={taskCount}
        aria-valuenow={position + 1}
        aria-label={`Task ${position + 1} of ${taskCount}`}
      >
        {Array.from({ length: taskCount }, (_, i) => (
          <span key={i} className={i <= position ? 'segment filled' : 'segment'} />
        ))}
      </div>
    </div>
  );

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

  if (!scenario) return <div className="card">No tasks are configured.</div>;

  if (phase === 'intro' || !scheme) {
    return (
      <>
        <div className="card">
          <h1>Navigation study</h1>
          <p>{INTRO}</p>
          <p className="muted small">
            There are {taskCount} short tasks and a few questions at the end. It takes about 10 minutes.
          </p>

          <label className="field">
            Your name or participant ID
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void start();
              }}
            />
          </label>

          <fieldset className="field choice-list">
            <legend>Have you used LaunchDarkly before?</legend>
            {LD_USAGE_OPTIONS.map((o) => (
              <label key={o.id} className="choice">
                <input
                  type="radio"
                  name="ld-usage"
                  checked={ldUsage === o.id}
                  onChange={() => setLdUsage(o.id)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>

          {persistenceMode === 'local' ? (
            <p className="muted small">Database not connected. Results are being saved locally.</p>
          ) : null}

          {writeBlocked === null ? null : (
            <p className="write-warning">
              The database cannot be reached, so this run would be saved only in this browser. Tell whoever is running
              the study before you start.
              <span className="save-reason">{writeBlocked}</span>
            </p>
          )}

          <button className="primary" onClick={() => void start()} disabled={!canStart || busy}>
            Start
          </button>
        </div>
        {saveNotice}
      </>
    );
  }

  if (phase === 'scenario') {
    return (
      <>
        <div className="card">
          {restartBar}
          <p className="ctx-label standalone">Your situation</p>
          {contextParagraphs(scenario).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <button
            className="primary"
            autoFocus
            onClick={() => {
              startPending.current = true;
              setPhase('task');
            }}
          >
            Start the first task
          </button>
        </div>
        {saveNotice}
      </>
    );
  }

  const taskHeading = task ? (
    <div className="task-block">
      <p className="task-label">
        Task {position + 1} of {taskCount}
      </p>
      <h2 className="prompt">{task.prompt}</h2>
    </div>
  ) : null;

  if (phase === 'task' && task) {
    const rows: { node: SchemeNode; path: SchemeNode[]; depth: number; isOpen: boolean }[] = [];
    const walk = (nodes: SchemeNode[], parents: SchemeNode[]) => {
      for (const node of nodes) {
        const path = [...parents, node];
        const isOpen = open.has(pathKey(path));
        rows.push({ node, path, depth: parents.length, isOpen });
        if (isOpen) walk(node.children, path);
      }
    };
    walk(scheme.sections, []);
    const selectedKey = selected ? pathKey(selected.path) : null;

    return (
      <>
        <div className="study">
          {restartBar}
          {progress}
          {taskHeading}
          <p className="muted small">
            Click through the menu to where you&rsquo;d expect to do this, then choose &lsquo;I&rsquo;d find it
            here&rsquo;.
          </p>

          <ul className="tree">
            {rows.map(({ node, path, depth, isOpen }) => {
              const key = pathKey(path);
              const isSection = node.children.length > 0;
              const isPicked = key === selectedKey;
              return (
                <li key={key} className={depth > 0 ? 'nested' : undefined}>
                  <button
                    className={`node${isOpen ? ' open' : ''}${isPicked ? ' picked' : ''}`}
                    style={depth > 0 ? { paddingLeft: `${0.9 + depth * 2}rem` } : undefined}
                    aria-expanded={isSection ? isOpen : undefined}
                    aria-pressed={isSection && !node.destinationId ? undefined : isPicked}
                    disabled={busy}
                    onClick={() => (isSection ? toggle(node, path) : pick(node, path))}
                  >
                    <span>{node.label}</span>
                    <span className="node-end">
                      {isPicked ? (
                        <span className="tick" aria-hidden="true">
                          &#10003;
                        </span>
                      ) : null}
                      {isSection ? (
                        <span className="chev" aria-hidden="true">
                          &rsaquo;
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="actionbar">
            <button className="primary" disabled={selected === null || busy} onClick={() => void submit()}>
              I&rsquo;d find it here
            </button>
            <span className="spacer" />
            <button className="ghost" disabled={busy} onClick={() => void skip()}>
              Skip this task
            </button>
          </div>
        </div>
        {saveNotice}
      </>
    );
  }

  if (phase === 'confidence') {
    return (
      <>
        <div className="card">
          {progress}
          <fieldset className="field scale-field">
            <legend>{CONFIDENCE_PROMPT}</legend>
            <div className="scale" role="radiogroup" aria-label={CONFIDENCE_PROMPT}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={confidence === n}
                  className={confidence === n ? 'scale-btn active' : 'scale-btn'}
                  onClick={() => setConfidence(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="scale-ends">
              <span>1 &middot; Not at all confident</span>
              <span>7 &middot; Very confident</span>
            </div>
          </fieldset>

          {confidence !== null && confidence <= 4 ? (
            <label className="field">
              {UNSURE_PROMPT} <span className="muted">(optional)</span>
              <textarea rows={3} value={unsure} onChange={(e) => setUnsure(e.target.value)} />
            </label>
          ) : null}

          <button className="primary" disabled={confidence === null || busy} onClick={() => void submitConfidence()}>
            {position + 1 >= taskCount ? 'Continue' : 'Next task'}
          </button>
        </div>
        {saveNotice}
      </>
    );
  }

  if (phase === 'survey') {
    const complete = CAPABILITIES.every((c) => survey[c.id] !== undefined);
    return (
      <>
        <div className="card wide">
          <h2>Last questions</h2>
          <p>Can LaunchDarkly do each of these?</p>
          <table className="survey">
            <thead>
              <tr>
                <th />
                {SURVEY_CHOICES.map((c) => (
                  <th key={c.id}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap.id}>
                  <th scope="row">{cap.label}</th>
                  {SURVEY_CHOICES.map((c) => (
                    <td key={c.id}>
                      <input
                        type="radio"
                        name={cap.id}
                        aria-label={`${cap.label}: ${c.label}`}
                        checked={survey[cap.id] === c.id}
                        onChange={() => setSurvey((prev) => ({ ...prev, [cap.id]: c.id }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <label className="field">
            Was anything hard to find or confusing? <span className="muted">(optional)</span>
            <textarea rows={3} value={confusing} onChange={(e) => setConfusing(e.target.value)} />
          </label>

          <button className="primary" disabled={!complete || busy} onClick={() => void finish()}>
            Finish
          </button>
        </div>
        {saveNotice}
      </>
    );
  }

  return (
    <>
      <div className="card">
        <h1>Thank you</h1>
        {saveIssue ? (
          <p>
            That is everything. Please let whoever is running this study know that the message above appeared, because
            some of your answers may not have been saved.
          </p>
        ) : (
          <p>That is everything, and your answers are recorded. There was no wrong way to do this.</p>
        )}
        {saveIssue === null && persistenceMode === 'local' ? (
          <p className="muted small">Database not connected. Results are saved locally.</p>
        ) : null}
        {saveIssue || persistenceMode === 'local' ? (
          <div className="actions">
            <button onClick={downloadLocalResults}>Download my answers</button>
            <button
              className="ghost"
              onClick={() => {
                void copyLocalResults().then(setCopied);
              }}
            >
              {copied ? 'Copied' : 'Copy my answers'}
            </button>
          </div>
        ) : null}
        <div className="actions">
          <button className="ghost" onClick={restart}>
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
