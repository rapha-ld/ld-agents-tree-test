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

function readLocal(): { sessions: StudySession[]; events: StudyEvent[] } {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as { sessions: StudySession[]; events: StudyEvent[] };
  } catch {
    // A corrupt or unavailable store should not stop a participant mid-study.
  }
  return { sessions: [], events: [] };
}

function writeLocal(data: { sessions: StudySession[]; events: StudyEvent[] }): boolean {
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
    const { error } = await client.from('sessions').upsert(session);
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
