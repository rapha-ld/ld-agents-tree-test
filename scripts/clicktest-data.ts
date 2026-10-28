// Shared by the click test scripts: read sessions and events from Supabase (service role, from
// .env.local) or a downloaded file, drop duplicate events, and read the --cohort flag.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import { COHORTS } from '../src/clicktest/harness/cohort';
import type { Cohort } from '../src/clicktest/harness/cohort';
import type { CtEvent, CtSession } from '../src/clicktest/harness/types';
import { fetchAllRows } from '../src/pull/paged';

export function cohortArg(args: string[], fallback: Cohort | 'all' = 'main'): Cohort | 'all' {
  const value = args.includes('--cohort') ? args[args.indexOf('--cohort') + 1] : fallback;
  if (value === 'all' || COHORTS.includes(value as Cohort)) return value as Cohort | 'all';
  console.error(`--cohort must be one of ${[...COHORTS, 'all'].join(', ')}.`);
  process.exit(1);
}

export async function loadClicktest(file: string | null): Promise<{ sessions: CtSession[]; events: CtEvent[] }> {
  const raw = file
    ? (JSON.parse(readFileSync(file, 'utf8')) as { sessions: CtSession[]; events: CtEvent[] })
    : await fetchAll();
  // A retried batch could land twice before the unique index existed; keep one copy of each.
  const seen = new Set<string>();
  const events = raw.events.filter((e) => {
    const key = `${e.session_id}:${e.seq}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { sessions: raw.sessions, events };
}

async function fetchAll(): Promise<{ sessions: CtSession[]; events: CtEvent[] }> {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // The variables may already be in the environment.
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, or pass --file.');
    process.exit(1);
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const [sessions, events] = await Promise.all([
    fetchAllRows<CtSession>(async (from, to) => {
      const { data, error } = await client.from('ct_sessions').select('*').order('started_at').range(from, to);
      return { data: data as CtSession[] | null, error };
    }),
    fetchAllRows<CtEvent>(async (from, to) => {
      const { data, error } = await client.from('ct_events').select('*').order('id').range(from, to);
      return { data: data as CtEvent[] | null, error };
    }),
  ]);
  return { sessions, events };
}
