import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const persistenceMode = url && anonKey ? 'supabase' : 'local';

const client = url && anonKey ? createClient(url, anonKey) : null;

export type EventKind = 'start' | 'click' | 'back' | 'submit' | 'giveup';

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

function writeLocal(data: { sessions: StudySession[]; events: StudyEvent[] }) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota or private-mode failures.
  }
}

/** Always keep a local copy, then try the remote table if one is configured. */
export async function saveSession(session: StudySession) {
  const local = readLocal();
  const existing = local.sessions.findIndex((s) => s.id === session.id);
  if (existing === -1) local.sessions.push(session);
  else local.sessions[existing] = session;
  writeLocal(local);

  if (!client) return;
  const { error } = await client.from('sessions').upsert(session);
  if (error) console.warn('sessions insert failed, local copy kept', error.message);
}

export async function saveEvents(events: StudyEvent[]) {
  if (events.length === 0) return;
  const local = readLocal();
  local.events.push(...events);
  writeLocal(local);

  if (!client) return;
  const { error } = await client.from('events').insert(events);
  if (error) console.warn('events insert failed, local copy kept', error.message);
}

export function exportLocalResults() {
  return JSON.stringify(readLocal(), null, 2);
}

export function localResultCount() {
  const local = readLocal();
  return { sessions: local.sessions.length, events: local.events.length };
}

export function clearLocalResults() {
  localStorage.removeItem(LOCAL_KEY);
}
