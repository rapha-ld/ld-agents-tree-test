// Shared shapes for the click test: tasks as written in clicktest/tasks.yaml,
// and the rows written to ct_sessions and ct_events (supabase/clicktest.sql).

export interface TaskStart {
  /** The page the prototype opens on, e.g. "flags". */
  page: string;
  /** Open as the icon rail instead of the full sidebar. */
  collapsed?: boolean;
  /** Section ids open at the start (e.g. ["features"]). Omitted: all open. */
  open_sections?: string[];
}

export interface Task {
  id: string;
  /** What the participant is asked to do. Must make sense on its own. */
  prompt: string;
  start: TaskStart;
  /** Page ids where the task counts as done. */
  target: string[];
  /** Each correct route, as the ordered track ids of its clicks. */
  success_paths: string[][];
  /** The scenario the task belongs to. Set by parseTasks, never written in the YAML. */
  scenario?: { id: string; text: string };
}

/** A story read before its tasks. Its tasks run together, in the order written. */
export interface Scenario {
  id: string;
  text: string;
  tasks: Task[];
}

/** A timed look at the nav before any task, then one open question about it. */
export interface FirstImpression {
  look: string;
  seconds: number;
  question: string;
}

/** The rating asked after every task, on a 1 to 7 scale, with an optional open question for low ratings. */
export interface FollowUp {
  question: string;
  low: string;
  high: string;
  probe?: { at_or_below: number; question: string };
}

/**
 * A question after the last task. With options and columns it's a grid, one
 * choice per row; with options alone, checkboxes; with neither, open text.
 */
export interface WrapUpQuestion {
  id: string;
  question: string;
  options?: string[];
  columns?: string[];
}

export interface TaskFile {
  /** Every task, with scenario tasks flattened in and tagged with their scenario. */
  tasks: Task[];
  /** Used only with ?sample=1, to try the harness before the real tasks exist. */
  sample_tasks?: Task[];
  first_impression?: FirstImpression;
  follow_up?: FollowUp;
  wrap_up?: WrapUpQuestion[];
}

/** Add new kinds to the check in supabase/clicktest.sql at the same time. */
export type CtEventKind =
  | 'task_start'
  | 'click'
  | 'page'
  | 'drawer'
  | 'backtrack'
  | 'found'
  | 'giveup'
  | 'timeout'
  | 'select'
  | 'answer';

export interface CtEvent {
  session_id: string;
  task_id: string | null;
  seq: number;
  kind: CtEventKind;
  track_id: string | null;
  page: string | null;
  meta: Record<string, unknown> | null;
  ts: string;
}

export interface CtSession {
  id: string;
  pid: string | null;
  /** What the participant typed on the intro screen. */
  participant_name: string | null;
  src: string | null;
  task_order: string[];
  build_sha: string | null;
  viewport: string;
  user_agent: string;
  started_at: string;
  finished_at: string | null;
}

export type Outcome = 'success' | 'recovered' | 'failure' | 'giveup' | 'timeout' | 'incomplete';
