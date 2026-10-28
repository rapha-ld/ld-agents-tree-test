// Writes for the click test, on the same pattern as src/session.ts: a local copy
// first, then Supabase with retries for network failures. Same project and anon
// key as the tree test; the tables are in supabase/clicktest.sql.

import { createClient } from '@supabase/supabase-js';

import { withRetry } from '../../session';
import type { CtEvent, CtSession } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// keepalive lets the last batch finish when the tab closes mid-task (pagehide flush).
const client =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { fetch: (input, init) => fetch(input, { ...init, keepalive: true }) },
      })
    : null;

export const persistenceMode: 'supabase' | 'local' = client ? 'supabase' : 'local';

// One key per session, so a flush only rewrites this participant's events, and a browser reused
// for several sessions doesn't slow down. The same shape as `score:clicktest --file` reads.
const LOCAL_KEY = 'nav-lab-clicktest';

interface LocalStore {
  sessions: CtSession[];
  events: CtEvent[];
}

const cache = new Map<string, LocalStore>();

function localFor(sessionId: string): LocalStore {
  let store = cache.get(sessionId);
  if (!store) {
    store = readLocal(sessionId);
    cache.set(sessionId, store);
  }
  return store;
}

function readLocal(sessionId: string): LocalStore {
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY}:${sessionId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalStore>;
      return { sessions: parsed.sessions ?? [], events: parsed.events ?? [] };
    }
  } catch {
    // A full or blocked store is not a reason to stop the study.
  }
  return { sessions: [], events: [] };
}

function writeLocal(sessionId: string, data: LocalStore): boolean {
  try {
    localStorage.setItem(`${LOCAL_KEY}:${sessionId}`, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

export type SaveResult = { remote: 'ok' | 'skipped' | 'failed'; error?: string };

export async function checkWrite(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!client) return { ok: false, reason: 'No database is configured for this build.' };
  try {
    const { error } = await client.from('ct_sessions').select('id').limit(1);
    return error ? { ok: false, reason: describe(error) } : { ok: true };
  } catch (e) {
    return { ok: false, reason: describe(e) };
  }
}

export async function saveSession(session: CtSession): Promise<SaveResult> {
  const store = localFor(session.id);
  store.sessions = [session];
  writeLocal(session.id, store);
  if (!client) return { remote: 'skipped' };
  const { error } = await withRetry(() =>
    session.finished_at === null
      ? client.from('ct_sessions').insert(session)
      : client.from('ct_sessions').update({ finished_at: session.finished_at }).eq('id', session.id),
  );
  return error ? { remote: 'failed', error: describe(error) } : { remote: 'ok' };
}

export async function saveEvents(events: CtEvent[]): Promise<SaveResult> {
  if (events.length === 0) return { remote: client ? 'ok' : 'skipped' };
  const sessionId = events[0].session_id;
  const store = localFor(sessionId);
  store.events.push(...events);
  writeLocal(sessionId, store);
  if (!client) return { remote: 'skipped' };
  // A retry after a lost response must not insert the batch twice; (session_id, seq) is unique.
  const { error } = await withRetry(() =>
    client.from('ct_events').upsert(events, { onConflict: 'session_id,seq', ignoreDuplicates: true }),
  );
  return error ? { remote: 'failed', error: describe(error) } : { remote: 'ok' };
}

/** This session's copy, for the download button shown when a write failed. */
export function exportLocal(sessionId: string): string {
  return JSON.stringify(localFor(sessionId), null, 2);
}
