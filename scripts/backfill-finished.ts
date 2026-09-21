/**
 * Set finished_at on runs that reached the end but never recorded it.
 *
 *   pnpm backfill          show what would change, write nothing
 *   pnpm backfill --write  apply it
 *
 * Why this exists: the update in src/session.ts that marks a run finished was
 * failing against the database, so every row has finished_at null even for
 * people who answered every task. The events survived, because those are plain
 * inserts, so the completion is still recoverable from them.
 *
 * The criterion matches Study.tsx exactly: a run is finished when it recorded a
 * submit or giveup on the last task of the last scenario. Giving up on the final
 * task still ends the study, so it still counts. Anything weaker would promote
 * the many runs where someone answered one question and closed the tab, and
 * those rows are the reason finished_at is the filter the report trusts.
 *
 * The timestamp used is that terminal event's ts. Study.tsx stamps finished_at
 * immediately after recording the event and flushing it, so the two are the
 * same moment to within the round trip.
 *
 * This only ever fills in a null. A row that already has finished_at is left
 * alone, which makes the script safe to re-run and keeps it from overwriting a
 * real timestamp with a reconstructed one.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllRows } from '../src/pull/paged';
import { parseScenario } from '../src/parse/scenario';
import type { StudyEvent, StudySession } from '../src/session';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Fine: the variables may already be in the environment.
}

const write = process.argv.includes('--write');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, in .env.local or in the environment.');
  process.exit(1);
}

const root = process.cwd();

// Sorted by filename, which is how src/data.ts orders them and therefore the
// order participants saw. The last file's last task is the end of the study.
const scenarios = readdirSync(join(root, 'scenarios'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => parseScenario(readFileSync(join(root, 'scenarios', f), 'utf8'), f));

const lastScenario = scenarios.at(-1);

if (!lastScenario || lastScenario.tasks.length === 0) {
  console.error('Could not work out where the study ends: no scenarios, or the last one has no tasks.');
  process.exit(1);
}

const lastTaskIndex = lastScenario.tasks.length - 1;

const client = createClient(url, key, { auth: { persistSession: false } });

const sessions = await fetchAllRows<StudySession>(async (from, to) => {
  const { data, error } = await client.from('sessions').select('*').order('started_at').range(from, to);
  return { data: data as StudySession[] | null, error };
});

const events = await fetchAllRows<StudyEvent>(async (from, to) => {
  const { data, error } = await client.from('events').select('*').order('id').range(from, to);
  return { data: data as StudyEvent[] | null, error };
});

// The terminal event per session, if it has one. Events arrive ordered by id, so
// a later match overwrites an earlier one and the last write wins.
const terminal = new Map<string, StudyEvent>();
for (const e of events) {
  if (e.scenario_id !== lastScenario.id) continue;
  if (e.task_index !== lastTaskIndex) continue;
  if (e.kind !== 'submit' && e.kind !== 'giveup') continue;
  terminal.set(e.session_id, e);
}

const fillable = sessions
  .filter((s) => s.finished_at === null)
  .map((s) => ({ session: s, event: terminal.get(s.id) }))
  .filter((row): row is { session: StudySession; event: StudyEvent } => row.event !== undefined);

const alreadySet = sessions.filter((s) => s.finished_at !== null).length;

console.log(`study ends at: ${lastScenario.id}, task ${lastTaskIndex}`);
console.log(`sessions:      ${sessions.length} (${alreadySet} already have finished_at)`);
console.log(`to fill:       ${fillable.length}\n`);

if (fillable.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

for (const { session, event } of fillable) {
  const who = session.participant_label ?? '(unnamed)';
  console.log(`  ${session.id.slice(0, 8)}  ${session.scheme_id.padEnd(20)} ${event.ts}  ${event.kind.padEnd(7)} ${who}`);
}

if (!write) {
  console.log('\nDry run. Nothing written. Re-run with --write to apply.');
  process.exit(0);
}

console.log('');

let updated = 0;
for (const { session, event } of fillable) {
  // Guarded on finished_at being null as well as on the id, so a run that
  // finished for real between the read above and this write is not overwritten.
  const { error } = await client
    .from('sessions')
    .update({ finished_at: event.ts })
    .eq('id', session.id)
    .is('finished_at', null);

  if (error) {
    console.error(`Could not update ${session.id}: ${error.message}`);
    if (/permission denied/i.test(error.message)) {
      console.error('\nThe service role is missing update on sessions.');
      console.error('Re-run supabase/schema.sql in the SQL editor; it is idempotent.');
    }
    console.error(`\nStopped after ${updated} of ${fillable.length}. Re-running picks up where this left off.`);
    process.exit(1);
  }
  updated += 1;
}

console.log(`Filled finished_at on ${updated} of ${fillable.length} runs.`);
console.log('Run pnpm pull to refresh nav-lab-results.json.');
