/**
 * Pull every study result into nav-lab-results.json, which the report loads
 * through its "Load results" control.
 *
 * This script is the only thing that reads the study tables. The browser never
 * does: the anon key shipped in the public bundle can insert and nothing else,
 * so no visitor to the study can read anyone's answers. That is why there is no
 * login wall on the report and no select policy in the schema.
 *
 * SUPABASE_SERVICE_ROLE_KEY is deliberately not VITE_-prefixed. Vite inlines
 * every VITE_ variable into the bundle it builds, and this key bypasses row
 * level security completely, so the prefix would turn a local convenience into
 * a public read of the whole database.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllRows } from '../src/pull/paged';
import type { StudyEvent, StudyResponse, StudySession } from '../src/session';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Fine: the variables may already be in the environment.
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, in .env.local or in the environment.\n' +
      'Both are under Settings, then API, in the Supabase dashboard.',
  );
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });

// The query builder is thenable but not a Promise, so each page is awaited here
// rather than handed straight to fetchAllRows.
async function pull() {
  const sessions = await fetchAllRows<StudySession>(async (from, to) => {
    const { data, error } = await client.from('sessions').select('*').order('started_at').range(from, to);
    return { data: data as StudySession[] | null, error };
  });

  const events = await fetchAllRows<StudyEvent>(async (from, to) => {
    const { data, error } = await client.from('events').select('*').order('id').range(from, to);
    return { data: data as StudyEvent[] | null, error };
  });

  const responses = await fetchAllRows<StudyResponse>(async (from, to) => {
    const { data, error } = await client.from('responses').select('*').order('id').range(from, to);
    return { data: data as StudyResponse[] | null, error };
  });

  return { sessions, events, responses };
}

let sessions: StudySession[];
let events: StudyEvent[];
let responses: StudyResponse[];
try {
  ({ sessions, events, responses } = await pull());
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`Could not read the study tables: ${message}`);
  // The trap worth naming, because the API reports it as a 401 and it reads
  // like a bad key: a policy narrows a privilege, it does not create one.
  if (/permission denied/i.test(message)) {
    console.error('\nThe role is missing a table grant. Re-run supabase/schema.sql in the SQL editor;');
    console.error('it is idempotent, and it now includes the grants the policies depend on.');
  }
  process.exit(1);
}

const outPath = join(process.cwd(), 'nav-lab-results.json');
writeFileSync(outPath, `${JSON.stringify({ sessions, events, responses }, null, 2)}\n`);

const finished = sessions.filter((s) => s.finished_at).length;

console.log(`sessions:  ${sessions.length} (${finished} finished, ${sessions.length - finished} abandoned)`);
console.log(`events:    ${events.length}`);
console.log(`answers:   ${responses.length} (what people said they would look for)`);
console.log(`written:   ${outPath}`);
