import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 'supabase' only when both variables are set. Otherwise results live in the
 * browser that took the study, which is a fallback rather than a design choice,
 * so the UI says so explicitly.
 */
export const persistenceMode: 'supabase' | 'local' = url && anonKey ? 'supabase' : 'local';

const client = url && anonKey ? createClient(url, anonKey) : null;

export type EventKind = 'start' | 'click' | 'back' | 'submit' | 'giveup' | 'mode';

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
};

/**
 * A free-text answer given once per scenario, before the participant sees the
 * menu. `prompt` records the question as it was worded at the time, so
 * rewording it later cannot silently change what old answers mean.
 */
export type StudyResponse = {
  session_id: string;
  scenario_id: string;
  prompt: string;
  response: string;
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

const LOCAL_KEY = 'nav-lab-results';

type LocalStore = { sessions: StudySession[]; events: StudyEvent[]; responses: StudyResponse[] };

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStore>;
      return {
        sessions: parsed.sessions ?? [],
        events: parsed.events ?? [],
        // Absent in anything written before responses existed.
        responses: parsed.responses ?? [],
      };
    }
  } catch {
    // A corrupt or unavailable store should not stop a participant mid-study.
  }
  return { sessions: [], events: [], responses: [] };
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

/** Keep a local copy first, then try the database if one is configured. */
export async function saveSession(session: StudySession): Promise<SaveResult> {
  const store = readLocal();
  const existing = store.sessions.findIndex((s) => s.id === session.id);
  if (existing === -1) store.sessions.push(session);
  else store.sessions[existing] = session;
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  try {
    // Insert at the start, update at the end, rather than upserting both times.
    // An upsert's ON CONFLICT has to read the conflicting row, and the privilege
    // that needs is less obvious than a plain update's. Being explicit about
    // which call is which keeps the grants in schema.sql easy to reason about.
    const { error } =
      session.finished_at === null
        ? await client.from('sessions').insert(session)
        : await client
            .from('sessions')
            .update({ finished_at: session.finished_at, participant_label: session.participant_label })
            .eq('id', session.id);
    if (error) return { local, remote: 'failed', error: error.message };
    return { local, remote: 'ok' };
  } catch (e) {
    return { local, remote: 'failed', error: describe(e) };
  }
}

export async function saveEvents(events: StudyEvent[]): Promise<SaveResult> {
  if (events.length === 0) return { local: true, remote: client ? 'ok' : 'skipped' };

  const store = readLocal();
  store.events.push(...events);
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  try {
    const { error } = await client.from('events').insert(events);
    if (error) return { local, remote: 'failed', error: error.message };
    return { local, remote: 'ok' };
  } catch (e) {
    return { local, remote: 'failed', error: describe(e) };
  }
}

/** Written once per scenario, before the participant sees the menu. */
export async function saveResponse(response: StudyResponse): Promise<SaveResult> {
  const store = readLocal();
  store.responses.push(response);
  const local = writeLocal(store);

  if (!client) return { local, remote: 'skipped' };

  try {
    const { error } = await client.from('responses').insert(response);
    if (error) return { local, remote: 'failed', error: error.message };
    return { local, remote: 'ok' };
  } catch (e) {
    return { local, remote: 'failed', error: describe(e) };
  }
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
