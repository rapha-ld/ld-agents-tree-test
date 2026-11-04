import { createClient } from '@supabase/supabase-js';
import { TABLES } from './tables';

export { TABLES };

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 'supabase' only when both variables are set. Otherwise results live in the
 * browser that took the study, which is a fallback rather than a design choice,
 * so the UI says so explicitly.
 */
export const persistenceMode: 'supabase' | 'local' = url && anonKey ? 'supabase' : 'local';

const client = url && anonKey ? createClient(url, anonKey) : null;


/**
 * `back` is moving up a level inside the menu. `stepback` is leaving a card
 * entirely, which is a different act: it means the participant wanted to change
 * something they had already answered.
 */
export type EventKind = 'start' | 'click' | 'back' | 'submit' | 'giveup' | 'mode' | 'stepback';

export type StudyEvent = {
  session_id: string;
  scenario_id: string;
  task_index: number;
  seq: number;
  kind: EventKind;
  node_path: string;
  destination_id: string | null;
  depth: number;
  ts: string;
};

export type StudySession = {
  id: string;
  participant_label: string | null;
  scheme_id: string;
  started_at: string;
  finished_at: string | null;
  user_agent: string;
  /** Answer to the intro question about LaunchDarkly, so groups can be balanced. */
  ld_usage: string | null;
  /** Authored task indexes in the order this participant saw them. */
  task_order: number[];
  /** Post-test grid: one answer ('yes' | 'not-sure' | 'no') per capability id. */
  survey: Record<string, string> | null;
  survey_confusing: string | null;
};

export type TaskOutcomeKind = 'direct' | 'indirect' | 'fail' | 'skip';

/**
 * One row per task a participant finished or skipped. Outcome is worked out in
 * the browser from that task's events so it can be read straight from the
 * table; the events stay as the source of truth if the rules change.
 */
export type StudyTaskResult = {
  session_id: string;
  scenario_id: string;
  /** The task's position in the scenario file, which is its identity. */
  task_index: number;
  /** Where it came in this participant's shuffled order, from 0. */
  position: number;
  prompt: string;
  outcome: TaskOutcomeKind;
  answer_path: string | null;
  answer_destination: string | null;
  first_click: string | null;
  time_on_task_ms: number | null;
  /** 1 (not at all confident) to 7 (very confident). Null when skipped. */
  confidence: number | null;
  unsure_reason: string | null;
  ts: string;
};

/**
 * Every write reports what actually happened, so a participant is never told
 * their answers were recorded when the write failed.
 */
export type SaveResult = {
  /** Whether the browser-local copy was written. */
  local: boolean;
  /** 'skipped' when no database is configured at all. */
  remote: 'skipped' | 'ok' | 'failed';
  error?: string;
};

const LOCAL_KEY = 'agents-tree-test-results';

type LocalStore = { sessions: StudySession[]; events: StudyEvent[]; tasks: StudyTaskResult[] };

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStore>;
      return {
        sessions: parsed.sessions ?? [],
        events: parsed.events ?? [],
        tasks: parsed.tasks ?? [],
      };
    }
  } catch {
    // A corrupt or unavailable store should not stop a participant mid-study.
  }
  return { sessions: [], events: [], tasks: [] };
}

function writeLocal(data: LocalStore): boolean {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Quota exhausted, or private mode with storage disabled.
    return false;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Whether a failure is worth trying again. A dropped connection, a sleeping
 * project, or a proxy that ate one request will succeed on the next attempt. A
 * constraint violation or a missing privilege will fail identically every time,
 * and retrying it delays the notice the participant needs to see.
 *
 * PostgREST answers with a SQLSTATE in `code`, so anything carrying one came
 * from the database and has already been decided. A thrown fetch, or an error
 * with no code, is the network.
 */
export function isTransient(error: unknown): boolean {
  if (error instanceof Error) return true;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    // PostgREST's own transport codes, as opposed to SQLSTATEs from Postgres.
    return code === '' || code === 'FetchError' || code.startsWith('5');
  }
  return true;
}

/** How long to wait before each retry. Two retries, both inside a few seconds. */
export const RETRY_DELAYS_MS = [400, 1200];

/**
 * Run a write, retrying while the failure still looks like the network. `sleep`
 * is injectable so a test does not have to wait out the backoff.
 */
export async function withRetry(
  attempt: () => PromiseLike<{ error: unknown }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ error: unknown; attempts: number }> {
  let last: unknown = null;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i += 1) {
    try {
      const { error } = await attempt();
      if (!error) return { error: null, attempts: i + 1 };
      last = error;
    } catch (thrown) {
      last = thrown;
    }
    if (!isTransient(last)) return { error: last, attempts: i + 1 };
    const delay = RETRY_DELAYS_MS[i];
    if (delay !== undefined) await sleep(delay);
  }
  return { error: last, attempts: RETRY_DELAYS_MS.length + 1 };
}

/** Whether the database can be reached, and what went wrong when it cannot. */
export type WriteCheck = { ok: true } | { ok: false; reason: string };

/**
 * Confirm the database is reachable before a participant starts, so a broken
 * write path is found on the intro screen and not on task eleven.
 *
 * Reads instead of writing: `select id` is the one column `anon` is granted, and
 * row level security returns no rows for it, so a healthy project answers with
 * an empty array and no row is created. A sleeping project, a blocked request,
 * or a missing grant each fail here with a reason worth showing.
 */
export async function checkWrite(): Promise<WriteCheck> {
  if (!client) return { ok: false, reason: 'No database is configured for this build.' };
  try {
    const { error } = await client.from(TABLES.sessions).select('id').limit(1);
    return error ? { ok: false, reason: describe(error) } : { ok: true };
  } catch (e) {
    return { ok: false, reason: describe(e) };
  }
}

/** Keep a local copy first, then try the database if one is configured. */
export async function saveSession(session: StudySession): Promise<SaveResult> {
  const store = readLocal();
  const existing = store.sessions.findIndex((s) => s.id === session.id);
  if (existing === -1) store.sessions.push(session);
  else store.sessions[existing] = session;
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  // Insert at the start, update at the end, rather than upserting both times.
  // An upsert's ON CONFLICT has to read the conflicting row, and the privilege
  // that needs is less obvious than a plain update's. Being explicit about
  // which call is which keeps the grants in schema.sql easy to reason about.
  // Finishing goes through a database function rather than a plain update.
  // anon has no select policy, so row level security hides every row from an
  // update's where clause: the update matches nothing and still reports
  // success. The function returns whether it found the session.
  const { error } = await withRetry(async () => {
    if (session.finished_at === null) return client.from(TABLES.sessions).insert(session);
    const { data, error: rpcError } = await client.rpc('agents_finish_session', {
      p_id: session.id,
      p_finished_at: session.finished_at,
      p_label: session.participant_label,
      p_survey: session.survey,
      p_confusing: session.survey_confusing,
    });
    if (rpcError) return { error: rpcError };
    return { error: data === true ? null : { code: 'P0002', message: 'The session to finish was not found.' } };
  });
  if (error) return { local, remote: 'failed', error: describe(error) };
  return { local, remote: 'ok' };
}

export async function saveEvents(events: StudyEvent[]): Promise<SaveResult> {
  if (events.length === 0) return { local: true, remote: client ? 'ok' : 'skipped' };

  const store = readLocal();
  store.events.push(...events);
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  const { error } = await withRetry(() => client.from(TABLES.events).insert(events));
  if (error) return { local, remote: 'failed', error: describe(error) };
  return { local, remote: 'ok' };
}

/** Written once per task, after the confidence question or a skip. */
export async function saveTaskResult(result: StudyTaskResult): Promise<SaveResult> {
  const store = readLocal();
  store.tasks.push(result);
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  const { error } = await withRetry(() => client.from(TABLES.tasks).insert(result));
  if (error) return { local, remote: 'failed', error: describe(error) };
  return { local, remote: 'ok' };
}

export function exportLocalResults() {
  return JSON.stringify(readLocal(), null, 2);
}

export function localResultCount() {
  const store = readLocal();
  return { sessions: store.sessions.length, events: store.events.length };
}

export function clearLocalResults() {
  localStorage.removeItem(LOCAL_KEY);
}
