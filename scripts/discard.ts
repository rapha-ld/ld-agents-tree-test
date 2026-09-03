/**
 * Delete one participant's run from the database, for good.
 *
 *   pnpm discard <session-id>
 *
 * This is the destructive sibling of the report's Counted toggle. The toggle
 * leaves a run in place and merely stops counting it, which is what you want
 * almost always. Use this when a run should not exist: a pilot, a colleague
 * clicking around, a duplicate.
 *
 * Children go before the parent. If the session is deleted first and a child
 * delete then fails, the children are orphaned and every later read has to know
 * to ignore them; this order leaves at worst a session with no answers, which
 * the report already handles.
 */
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../src/pull/paged';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Fine: the variables may already be in the environment.
}

const id = process.argv[2];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!id) {
  console.error('Usage: pnpm discard <session-id>');
  console.error('The report shows the first 8 characters of each id; hover the row for the whole thing.');
  process.exit(1);
}

// A prefix would be friendlier and is deliberately not accepted: matching a
// prefix against the wrong row deletes someone else's answers.
if (!UUID.test(id)) {
  console.error(`Not a session id: ${id}`);
  console.error('Pass the full id, not the shortened form shown in the table.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, in .env.local or in the environment.');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });

const existing = await fetchAllRows<{ id: string; participant_label: string | null; scheme_id: string }>(
  async (from, to) => {
    const { data, error } = await client
      .from('sessions')
      .select('id,participant_label,scheme_id')
      .eq('id', id)
      .range(from, to);
    return { data, error };
  },
);

if (existing.length === 0) {
  console.error(`No session with id ${id}. Nothing deleted.`);
  process.exit(1);
}

const who = existing[0].participant_label ?? 'an unnamed participant';

const events = await client.from('events').delete({ count: 'exact' }).eq('session_id', id);
if (events.error) {
  console.error(`Could not delete the events: ${events.error.message}`);
  if (/permission denied/i.test(events.error.message)) {
    console.error('\nRe-run supabase/schema.sql in the SQL editor; it now grants delete to the service role.');
  }
  process.exit(1);
}

const responses = await client.from('responses').delete({ count: 'exact' }).eq('session_id', id);
if (responses.error) {
  console.error(`Deleted ${events.count ?? 0} events, but could not delete the answers: ${responses.error.message}`);
  process.exit(1);
}

const session = await client.from('sessions').delete({ count: 'exact' }).eq('id', id);
if (session.error) {
  console.error(`Deleted ${events.count ?? 0} events, but could not delete the session: ${session.error.message}`);
  process.exit(1);
}

console.log(
  `Deleted ${who}'s run of ${existing[0].scheme_id}: ` +
    `${events.count ?? 0} events, ${responses.count ?? 0} answers, ${session.count ?? 0} session.`,
);
console.log('Run pnpm pull to refresh nav-lab-results.json.');
