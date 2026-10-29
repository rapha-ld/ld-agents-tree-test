// The unmoderated click test: an intro that asks for the participant's name, a timed first look
// at the nav with one question, then each task as a card over the nav prototype with a 1 to 7
// confidence rating after it, then the wrap-up questions and a thank-you screen. Every
// click in the prototype is recorded against the current task (harness/tracker.ts)
// and scored later against the task's success paths (harness/score.ts).

import {
  Button,
  Checkbox,
  CheckboxGroup,
  Input,
  Label,
  Radio,
  RadioGroup,
  Slider,
  SliderThumb,
  SliderTrack,
  TextArea,
  TextField,
} from '@launchpad-ui/components';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkWrite, exportLocal, persistenceMode, saveEvents, saveSession } from './harness/store';
import type { SaveResult } from './harness/store';
import { TASK_FILE } from './harness/tasks';
import { installClickListener, setSink } from './harness/tracker';
import { TrailTracker } from './harness/trail';
import { selectionFor } from './harness/selection';
import type { Selection } from './harness/selection';
import type { CtEvent, CtEventKind, CtSession, Task } from './harness/types';
import { DEFAULT_CONFIG } from './nav/config';
import type { NavConfig } from './nav/config';
import { IntroDemo } from './IntroDemo';
import { NavShell as NavShellBase } from './nav/NavShell';

import styles from './ClickTest.module.css';

// Ripples and the task card re-render ClickTest on every press; the nav's props don't change, so it skips those.
const NavShell = memo(NavShellBase);

/** The version presented on 10/20: integrated shell, hover drawer, illustrated Create menu. */
const CONFIG: NavConfig = {
  ...DEFAULT_CONFIG,
  search: 'anchored',
  railExpand: 'drawer',
  drawerOpenOn: 'hover',
  drawerLayout: 'aligned',
  hoverIntent: true,
  create: 'tiles-illustrated',
};

const TASK_LIMIT_MS = 3 * 60 * 1000;
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 650;

const params = new URLSearchParams(window.location.search);
const PID = params.get('pid');
const SRC = params.get('src');
const USE_SAMPLE = params.get('sample') === '1';
const DEV = params.get('dev') === '1';

// Participants from User Interviews arrive with src=userinterviews and their tracking id as the pid.
// Sending them to this URL at the end marks them Submitted in User Interviews.
const RETURN_URL =
  SRC === 'userinterviews' && PID
    ? `https://www.userinterviews.com/project-task-events/custom_link_with_redirect/complete?iid=${encodeURIComponent(PID)}`
    : null;
const RETURN_DELAY_MS = 3000;

type Phase =
  | 'blocked'
  | 'closed'
  | 'intro'
  | 'look-brief'
  | 'look'
  | 'impression'
  | 'overview'
  | 'brief'
  | 'active'
  | 'rating'
  | 'wrapup'
  | 'done';

const FIRST_IMPRESSION = TASK_FILE.first_impression;
const FOLLOW_UP = TASK_FILE.follow_up;
const WRAP_UP = TASK_FILE.wrap_up ?? [];
const SCALE = [1, 2, 3, 4, 5, 6, 7];

function tooSmall() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse || window.innerWidth < MIN_WIDTH || window.innerHeight < MIN_HEIGHT;
}

export function ClickTest() {
  const tasks = USE_SAMPLE ? (TASK_FILE.sample_tasks ?? []) : TASK_FILE.tasks;
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const [phase, setPhase] = useState<Phase>(() => {
    if (!DEV && tooSmall()) return 'blocked';
    return tasks.length === 0 ? 'closed' : 'intro';
  });
  const [name, setName] = useState('');
  const trimmedName = name.trim();
  const [index, setIndex] = useState(0);
  const [dbProblem, setDbProblem] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const nextRipple = useRef(0);
  const addRipple = (x: number, y: number) => {
    const ripple = { id: nextRipple.current++, x, y };
    setRipples((r) => [...r, ripple]);
    window.setTimeout(() => setRipples((r) => r.filter((o) => o.id !== ripple.id)), 650);
  };
  const [impression, setImpression] = useState('');
  const [lookLeft, setLookLeft] = useState(FIRST_IMPRESSION?.seconds ?? 0);
  const [rating, setRating] = useState<number | null>(null);
  const [unsure, setUnsure] = useState('');
  // After "I give up" there's nothing to rate, so the follow-up asks why instead.
  const [gaveUp, setGaveUp] = useState(false);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<string, string>>({});
  const trail = useRef<TrailTracker | null>(null);

  const task: Task | undefined = tasks[index];
  const scenarioIds = useMemo(() => [...new Set(tasks.flatMap((t) => (t.scenario ? [t.scenario.id] : [])))], [tasks]);
  const siblings = task?.scenario ? tasks.filter((t) => t.scenario?.id === task.scenario?.id) : [];
  const taskRange = useMemo(() => {
    const counts = scenarioIds.map((id) => tasks.filter((t) => t.scenario?.id === id).length);
    return [Math.min(...counts), Math.max(...counts)];
  }, [scenarioIds, tasks]);
  const seq = useRef(0);
  const buffer = useRef<CtEvent[]>([]);
  const currentPage = useRef<string | null>(null);
  const startedAt = useRef<string>('');

  // Re-check the window if it's resized after load, and pick up where they were once it's big enough again.
  const beforeBlock = useRef<Phase | null>(null);
  useEffect(() => {
    if (DEV) return;
    const onResize = () => {
      setPhase((p) => {
        if (tooSmall() && p !== 'done' && p !== 'blocked') {
          beforeBlock.current = p;
          return 'blocked';
        }
        if (!tooSmall() && p === 'blocked' && beforeBlock.current) return beforeBlock.current;
        return p;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (phase !== 'intro') return;
    checkWrite().then((r) => setDbProblem(r.ok ? null : r.reason));
  }, [phase]);

  const noteSave = (r: SaveResult) => {
    if (r.remote === 'failed') setDbProblem(r.error ?? 'The answers could not be saved.');
  };

  const flush = useCallback(async () => {
    const batch = buffer.current;
    buffer.current = [];
    noteSave(await saveEvents(batch));
  }, []);

  const record = useCallback(
    (kind: CtEventKind, trackId: string | null, meta?: Record<string, unknown>, taskId?: string) => {
      if (kind === 'page' && typeof meta?.page === 'string') currentPage.current = meta.page;
      buffer.current.push({
        session_id: sessionId,
        task_id: taskId ?? null,
        seq: seq.current++,
        kind,
        track_id: trackId,
        page: currentPage.current,
        meta: meta ?? null,
        ts: new Date().toISOString(),
      });
      if (buffer.current.length >= 10) void flush();
    },
    [sessionId, flush],
  );

  // A run abandoned mid-task keeps the clicks it made.
  useEffect(() => {
    const onHide = () => void flush();
    const onVisibility = () => document.visibilityState === 'hidden' && onHide();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flush]);

  // Clicks count only while a task is running. Every pick of a page, Create item, search result or
  // page button becomes the current answer, shown on the card until they confirm or pick again.
  const deadline = useRef(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const lastSelection = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'active' || !task) return;
    setSink((kind, trackId, meta) => {
      record(kind, trackId, meta, task.id);
      // A ripple where each press landed, so people can see it registered. Only pointer presses carry x and y.
      if (kind === 'click' && typeof meta?.x === 'number' && typeof meta.y === 'number') addRipple(meta.x, meta.y);
      const picked = kind === 'click' && trackId ? selectionFor(trackId) : null;
      // A mouse pick in a menu reports twice (press and action); it's one selection.
      if (picked && picked.trackId !== lastSelection.current) {
        lastSelection.current = picked.trackId;
        setSelection(picked);
        record('select', picked.trackId, { page: picked.page }, task.id);
      }
      // Backtracks are logged, never shown.
      const t = trail.current;
      if (!t) return;
      const backtrack =
        kind === 'click' && trackId
          ? t.click(trackId)
          : kind === 'page' && typeof meta?.page === 'string'
            ? t.visit(meta.page)
            : null;
      if (backtrack) record('backtrack', null, { ...backtrack }, task.id);
    });
    const remove = installClickListener();
    const timer = window.setTimeout(() => finish('timeout'), Math.max(0, deadline.current - Date.now()));
    return () => {
      setSink(null);
      remove();
      window.clearTimeout(timer);
    };
    // finish is stable for a given task index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, task, record]);

  // Where the nav ends, so the first look's dark wash covers only the page beside it.
  const [navEdge, setNavEdge] = useState(256);
  useEffect(() => {
    if (phase !== 'look') return;
    const edge = document.querySelector('[data-marker="sidebar"]')?.getBoundingClientRect().right;
    if (edge) setNavEdge(edge);
  }, [phase]);

  // The first look: every section open while the countdown runs, then the question replaces it.
  // Presses are swallowed so nothing opens or closes, but scrolling still works, so the sections
  // below the fold can be seen.
  useEffect(() => {
    if (phase !== 'look') return;
    const tick = window.setInterval(() => setLookLeft((n) => n - 1), 1000);
    const swallow = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target instanceof Element && e.target.closest('[data-harness]')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const kinds = ['pointerdown', 'mousedown', 'pointerup', 'click', 'keydown'] as const;
    kinds.forEach((k) => document.addEventListener(k, swallow, true));
    return () => {
      window.clearInterval(tick);
      kinds.forEach((k) => document.removeEventListener(k, swallow, true));
    };
  }, [phase]);

  // Ring the nav item for the current answer (and the page button, if that was the pick), so they
  // can see what they've selected while they keep exploring.
  useEffect(() => {
    if (phase !== 'active' || !selection) return;
    const selectors = [`[data-track="leaf:${selection.page}"]`, `[data-track="pinned:${selection.page}"]`];
    if (selection.trackId.startsWith('cta:') || selection.trackId.startsWith('footer:')) {
      selectors.push(`[data-track="${selection.trackId}"]`, `[data-rail-target="${selection.page}"]`);
    }
    // Wait a frame so the page a pick navigates to has rendered its button.
    let targets: Element[] = [];
    const frame = requestAnimationFrame(() => {
      targets = [...document.querySelectorAll(selectors.join(', '))];
      targets.forEach((el) => el.setAttribute('data-confirm-target', ''));
    });
    return () => {
      cancelAnimationFrame(frame);
      targets.forEach((el) => el.removeAttribute('data-confirm-target'));
    };
  }, [phase, selection]);

  useEffect(() => {
    if (phase === 'look' && lookLeft <= 0) setPhase('impression');
  }, [phase, lookLeft]);

  const session = (finished: string | null): CtSession => ({
    id: sessionId,
    pid: PID,
    participant_name: trimmedName || null,
    src: SRC,
    task_order: tasks.map((t) => t.id),
    build_sha: (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    user_agent: navigator.userAgent,
    started_at: startedAt.current,
    finished_at: finished,
  });

  const beginStudy = async () => {
    startedAt.current = new Date().toISOString();
    noteSave(await saveSession(session(null)));
    setPhase(FIRST_IMPRESSION ? 'look-brief' : 'brief');
  };

  const answer = (question: string, value: unknown, taskId?: string) =>
    record('answer', null, { question, value }, taskId);

  const submitImpression = () => {
    answer('first-impression', impression.trim());
    void flush();
    // The overview counts scenarios, so it's skipped when there are none (the sample task, for one).
    setPhase(scenarioIds.length ? 'overview' : 'brief');
  };

  const nextTask = () => {
    const next = tasks[index + 1];
    if (next) {
      setIndex(index + 1);
      // The scenario card shows once, before a scenario's first task. Later tasks in it start straight away.
      if (next.scenario && next.scenario.id === task?.scenario?.id) startTask(next);
      else setPhase('brief');
    } else if (WRAP_UP.length) {
      setPhase('wrapup');
    } else {
      endStudy();
    }
  };

  const probing = !!FOLLOW_UP?.probe && rating !== null && rating <= FOLLOW_UP.probe.at_or_below;

  const submitRating = () => {
    if (task && rating && !gaveUp) answer('confidence', rating, task.id);
    if (task && probing && !gaveUp && unsure.trim()) answer('unsure-why', unsure.trim(), task.id);
    if (task && gaveUp && unsure.trim()) answer('giveup-why', unsure.trim(), task.id);
    setRating(null);
    setUnsure('');
    setGaveUp(false);
    setTimedOut(false);
    nextTask();
  };

  const [saved, setSaved] = useState(false);
  // Only a real failed write counts; a build with no database (local runs) keeps answers in the browser by design.
  const saveFailed = !!dbProblem && persistenceMode === 'supabase';
  const endStudy = () => {
    setPhase('done');
    // The last events and the finish time are written before anyone is sent back to User Interviews.
    // A write that throws counts as a failed save, so the screen offers the download and doesn't redirect.
    void Promise.all([flush(), saveSession(session(new Date().toISOString())).then(noteSave)])
      .catch(() => setDbProblem('The answers could not be saved.'))
      .finally(() => setSaved(true));
  };

  // Back to User Interviews a few seconds after the thank-you appears, once everything is saved. Not
  // when a save failed: they need this screen to download their answers.
  useEffect(() => {
    if (phase !== 'done' || !RETURN_URL || !saved || saveFailed) return;
    const timer = window.setTimeout(() => window.location.assign(RETURN_URL), RETURN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, saved, saveFailed]);

  // Every grid row needs an answer; checkboxes and open text can be left empty.
  const wrapUpComplete = WRAP_UP.every((q) => !q.columns || (q.options ?? []).every((o) => grid[q.id]?.[o]));

  const downloadAnswers = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([exportLocal(sessionId)], { type: 'application/json' }));
    link.download = `clicktest-${sessionId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const submitWrapUp = () => {
    for (const q of WRAP_UP) {
      if (q.options && q.columns) answer(q.id, grid[q.id] ?? {});
      else answer(q.id, q.options ? (checked[q.id] ?? []) : (openAnswers[q.id] ?? '').trim());
    }
    endStudy();
  };

  const startTask = (t: Task | undefined = task) => {
    if (!t) return;
    currentPage.current = t.start.page;
    record('task_start', null, { start: t.start }, t.id);
    trail.current = new TrailTracker(t.start.page, t.start.open_sections);
    deadline.current = Date.now() + TASK_LIMIT_MS;
    lastSelection.current = null;
    setSelection(null);
    setTimedOut(false);
    setPhase('active');
  };

  function finish(kind: 'found' | 'giveup' | 'timeout') {
    if (!task) return;
    // The confirmed answer is the last selection, which is what scoring checks against the targets.
    record(
      kind,
      null,
      kind === 'found' && selection ? { page: selection.page, selection: selection.trackId } : undefined,
      task.id,
    );
    void flush();
    if (kind === 'timeout') setTimedOut(true);
    setGaveUp(kind === 'giveup' && !!FOLLOW_UP?.gave_up);
    if (FOLLOW_UP) setPhase('rating');
    else nextTask();
  }

  // Return presses the screen's main button, from a text box too (Shift+Return adds a line there).
  // Keys inside the nav are left alone, so its menus and search still take Return.
  const submitOnReturn = useRef<() => void>(() => {});
  submitOnReturn.current = () => {
    if (phase === 'intro' && trimmedName) void beginStudy();
    else if (phase === 'look-brief') setPhase('look');
    else if (phase === 'impression' && impression.trim()) submitImpression();
    else if (phase === 'overview') setPhase('brief');
    else if (phase === 'brief') startTask();
    else if (phase === 'active' && selection) finish('found');
    else if (phase === 'rating' && (gaveUp || rating !== null)) submitRating();
    else if (phase === 'wrapup' && wrapUpComplete) submitWrapUp();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A held key repeats; only the first press counts, so holding Return can't skip through screens.
      if (e.key !== 'Enter' || e.repeat || e.shiftKey || e.isComposing || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      const inText = !!target?.closest('textarea, input[type="text"], input:not([type])');
      const onControl = !!target?.closest('button, a, [role="button"], [role="menuitem"], [role="radio"], input');
      const inNav = !!target && target !== document.body && !target.closest('[data-harness]');
      if (inNav || (onControl && !inText)) return;
      e.preventDefault();
      submitOnReturn.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (phase === 'blocked') {
    return (
      <Screen>
        <h1>Switch to a laptop or desktop</h1>
        <p>
          This study needs a window at least {MIN_WIDTH.toLocaleString('en-US')} pixels wide, and a mouse or trackpad.
          Open the same link on a computer, or make this window larger.
        </p>
      </Screen>
    );
  }

  if (phase === 'closed') {
    return (
      <Screen>
        <h1>This study isn't open yet</h1>
        <p>Thanks for your interest. We'll be opening the study shortly. Check back again soon.</p>
      </Screen>
    );
  }

  if (phase === 'intro') {
    return (
      <Screen wide>
        <div className={styles.introGrid}>
          <div>
            <h1>Help us test a navigation design</h1>
            <p>It takes about {tasks.length + 4} minutes.</p>
            <ol className={styles.steps}>
              <li>
                Read each scenario, then select <strong>Start</strong>.
              </li>
              <li>Click through the navigation to where you'd go to complete the task.</li>
              <li>
                Your pick shows on the task card. When it's right, select <strong>Confirm</strong>. If you can't find
                it, select <strong>I give up</strong>.
              </li>
            </ol>
            <p>Go with your first instinct. You don't need to know this product.</p>
          </div>
          <IntroDemo />
        </div>
        <p className={styles.consent}>
          We record your name, your clicks, and your time on each task. We don't record your screen, camera, or
          microphone.
        </p>
        <TextField value={name} onChange={setName} isRequired autoFocus className={styles.nameField}>
          <Label>Your name</Label>
          <Input />
        </TextField>
        {saveFailed && (
          <p className={styles.warning}>The connection is unstable. Your answers are saved in this browser for now.</p>
        )}
        <div className={styles.actions}>
          <Button variant="primary" isDisabled={!trimmedName} onPress={beginStudy}>
            Start
          </Button>
        </div>
      </Screen>
    );
  }

  // The question after the first look, as a card over the nav like the others.
  if (phase === 'impression' && FIRST_IMPRESSION) {
    return (
      <div className={styles.stage}>
        <div className={styles.frame} data-locked>
          <NavShell config={CONFIG} initialPage="home" />
        </div>
        <div className={styles.scrim} data-harness />
        <aside className={styles.panel} data-harness>
          <TextField value={impression} onChange={setImpression} isRequired autoFocus className={styles.field}>
            <Label className={styles.question}>{FIRST_IMPRESSION.question}</Label>
            <TextArea rows={4} />
          </TextField>
          <div className={styles.actions}>
            <Button variant="primary" isDisabled={!impression.trim()} onPress={submitImpression}>
              Next
            </Button>
          </div>
        </aside>
      </div>
    );
  }

  if (phase === 'wrapup') {
    return (
      <Screen wide>
        <h1>Wrapping up</h1>
        {WRAP_UP.map((q) =>
          q.options && q.columns ? (
            <fieldset key={q.id} className={styles.gridQuestion}>
              <legend className={styles.question}>{q.question}</legend>
              <div className={styles.gridRow} aria-hidden>
                <span />
                {q.columns.map((c) => (
                  <span key={c} className={styles.gridHeader}>
                    {c}
                  </span>
                ))}
              </div>
              {q.options.map((o) => (
                <RadioGroup
                  key={o}
                  value={grid[q.id]?.[o] ?? null}
                  onChange={(v) => setGrid((g) => ({ ...g, [q.id]: { ...g[q.id], [o]: v } }))}
                  className={styles.gridRow}
                >
                  <Label className={styles.gridItem}>{o}</Label>
                  {q.columns?.map((c) => (
                    <Radio key={c} value={c} aria-label={c} className={styles.gridCell} />
                  ))}
                </RadioGroup>
              ))}
            </fieldset>
          ) : q.options ? (
            <CheckboxGroup
              key={q.id}
              value={checked[q.id] ?? []}
              onChange={(v) => setChecked((c) => ({ ...c, [q.id]: v }))}
              className={styles.field}
            >
              <Label className={styles.question}>{q.question}</Label>
              {q.options.map((o) => (
                <Checkbox key={o} value={o}>
                  {o}
                </Checkbox>
              ))}
            </CheckboxGroup>
          ) : (
            <TextField
              key={q.id}
              value={openAnswers[q.id] ?? ''}
              onChange={(v) => setOpenAnswers((a) => ({ ...a, [q.id]: v }))}
              className={styles.field}
            >
              <Label className={styles.question}>{q.question}</Label>
              <TextArea rows={4} />
            </TextField>
          ),
        )}
        <div className={styles.actions}>
          <Button variant="primary" isDisabled={!wrapUpComplete} onPress={submitWrapUp}>
            Finish
          </Button>
        </div>
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen>
        <h1>Thank you</h1>
        <p>Thanks for participating. Your answers help us improve our designs.</p>
        {RETURN_URL && (
          <>
            {!saveFailed && <p className={styles.consent}>Taking you back to User Interviews to finish up.</p>}
            <div className={styles.actions}>
              <Button variant={saveFailed ? 'default' : 'primary'} onPress={() => window.location.assign(RETURN_URL)}>
                Return to User Interviews
              </Button>
            </div>
          </>
        )}
        {/* A write that failed after the intro would otherwise leave the answers only in this browser. */}
        {saveFailed && (
          <>
            <p className={styles.warning}>
              Some of your answers didn't reach us. Download them and send the file to the person who invited you.
            </p>
            <div className={styles.actions}>
              <Button variant="primary" onPress={downloadAnswers}>
                Download answers
              </Button>
            </div>
          </>
        )}
      </Screen>
    );
  }

  // Before the first scenario: how many scenarios there are and how many tasks each one has.
  if (phase === 'overview') {
    return (
      <div className={styles.stage}>
        <div className={styles.frame} data-locked>
          <NavShell config={CONFIG} initialPage="home" />
        </div>
        <div className={styles.scrim} data-harness />
        <aside className={styles.panel} data-harness aria-live="polite">
          <p className={styles.task}>
            You have {scenarioIds.length} {scenarioIds.length === 1 ? 'scenario' : 'scenarios'} coming up.
          </p>
          <p className={styles.confirm}>
            Each scenario is a short situation, followed by{' '}
            {taskRange[0] === taskRange[1] ? taskRange[0] : `${taskRange[0]} to ${taskRange[1]}`}{' '}
            {taskRange[1] === 1 ? 'task' : 'tasks'}.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" onPress={() => setPhase('brief')}>
              Continue
            </Button>
          </div>
        </aside>
      </div>
    );
  }

  if ((phase === 'look-brief' || phase === 'look') && FIRST_IMPRESSION) {
    return (
      <div className={styles.stage}>
        <div
          className={styles.frame}
          data-locked={phase === 'look-brief' || undefined}
          data-spotlight={phase === 'look' || undefined}
        >
          <NavShell config={CONFIG} initialPage="home" />
        </div>
        {phase === 'look' && (
          <div className={styles.spotlightWash} style={{ left: navEdge }} aria-hidden data-harness />
        )}
        {phase === 'look-brief' && <div className={styles.scrim} data-harness />}
        <aside className={styles.panel} data-harness aria-live="polite">
          <p className={styles.task}>{FIRST_IMPRESSION.look}</p>
          {phase === 'look-brief' ? (
            <div className={styles.actions}>
              <Button variant="primary" onPress={() => setPhase('look')}>
                Start
              </Button>
            </div>
          ) : (
            <p className={styles.countdown}>{lookLeft === 1 ? '1 second left' : `${lookLeft} seconds left`}</p>
          )}
        </aside>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className={styles.stage}>
      <div className={styles.frame} data-locked={phase !== 'active' || undefined}>
        <NavShell
          key={`${index}-${task.id}`}
          config={CONFIG}
          initialPage={task.start.page}
          initialCollapsed={task.start.collapsed ?? false}
          initialOpen={task.start.open_sections}
        />
      </div>

      {phase !== 'active' && <div className={styles.scrim} data-harness />}

      {ripples.map((r) => (
        <span key={r.id} className={styles.ripple} style={{ left: r.x, top: r.y }} aria-hidden />
      ))}

      {phase === 'rating' && FOLLOW_UP ? (
        <aside className={styles.panel} data-harness aria-live="polite">
          {timedOut && <p className={styles.timedOut}>Time ran out on that task.</p>}
          {gaveUp && FOLLOW_UP.gave_up && (
            <TextField value={unsure} onChange={setUnsure} autoFocus className={styles.field}>
              <Label className={styles.question}>{FOLLOW_UP.gave_up}</Label>
              <TextArea rows={3} />
            </TextField>
          )}
          {!gaveUp && (
            <>
              {/* No value until they touch it, so the thumb's resting place can't nudge the answer. */}
              <Slider
                minValue={1}
                maxValue={7}
                step={1}
                value={rating ?? 4}
                onChange={(v) => setRating(v as number)}
                // onChange skips a press on the resting value (4); onChangeEnd still fires for it.
                onChangeEnd={(v) => setRating(v as number)}
                className={styles.rating}
                data-unset={rating === null || undefined}
              >
                <Label className={styles.question}>{FOLLOW_UP.question}</Label>
                <SliderTrack className={styles.ratingTrack}>
                  <SliderThumb className={styles.ratingThumb} />
                </SliderTrack>
                <div className={styles.ratingTicks} aria-hidden>
                  {/* Pointer shortcut: pressing a number picks it. The slider itself handles the keyboard. */}
                  {SCALE.map((n) => (
                    <span key={n} data-picked={rating === n || undefined} onClick={() => setRating(n)}>
                      {n}
                    </span>
                  ))}
                </div>
                <div className={styles.scaleEnds} aria-hidden>
                  <span>{FOLLOW_UP.low}</span>
                  <span>{FOLLOW_UP.high}</span>
                </div>
              </Slider>
              {probing && FOLLOW_UP.probe && (
                <TextField value={unsure} onChange={setUnsure} className={styles.field}>
                  <Label className={styles.question}>{FOLLOW_UP.probe.question}</Label>
                  <TextArea rows={3} />
                </TextField>
              )}
            </>
          )}
          <div className={styles.actions}>
            <Button variant="primary" isDisabled={!gaveUp && !rating} onPress={submitRating}>
              Next
            </Button>
          </div>
        </aside>
      ) : (
        <aside className={styles.panel} data-harness aria-live="polite">
          {phase === 'brief' && task.scenario ? (
            <>
              <p className={styles.counter}>
                Scenario {scenarioIds.indexOf(task.scenario.id) + 1} of {scenarioIds.length}
              </p>
              <p className={styles.scenario}>{task.scenario.text}</p>
            </>
          ) : (
            <>
              {task.scenario && <p className={styles.scenarioReminder}>{task.scenario.text}</p>}
              <p className={styles.taskCounter}>
                Task {task.scenario ? siblings.indexOf(task) + 1 : index + 1} of{' '}
                {task.scenario ? siblings.length : tasks.length}
              </p>
              <p className={styles.task}>{task.prompt}</p>
            </>
          )}
          {phase === 'brief' ? (
            <div className={styles.actions}>
              <Button variant="primary" onPress={() => startTask()}>
                Start
              </Button>
            </div>
          ) : (
            <>
              {selection && (
                <p className={styles.confirm}>
                  You selected <strong>{selection.label}</strong>. Is this your answer?
                </p>
              )}
              <div className={styles.actions}>
                {/* There from the start, so nothing jumps; it turns on with the first pick. */}
                <Button variant="primary" isDisabled={!selection} onPress={() => finish('found')}>
                  Confirm
                </Button>
                <Button variant="minimal" onPress={() => finish('giveup')}>
                  I give up
                </Button>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

function Screen({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={styles.screen} data-harness>
      <div className={styles.card} data-wide={wide || undefined}>
        {children}
      </div>
    </div>
  );
}
