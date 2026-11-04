/**
 * Who has taken the click test so far, and how far each person got.
 *
 *   pnpm clicktest:sessions                 every cohort, newest first
 *   pnpm clicktest:sessions --cohort pilot  only pilots (or trial, main)
 *   pnpm clicktest:sessions --file f.json   a downloaded file instead of Supabase
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { cohortOf } from '../src/clicktest/harness/cohort';
import { parseTasks } from '../src/clicktest/harness/parseTasks';
import { cohortArg, loadClicktest } from './clicktest-data';

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const cohort = cohortArg(args, 'all');
const taskCount = parseTasks(readFileSync(join(process.cwd(), 'clicktest/tasks.yaml'), 'utf8')).tasks.length;

const { sessions, events } = await loadClicktest(fileArg);
const ENDS = new Set(['found', 'giveup', 'timeout']);
const time = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });

const rows = sessions
  .filter((s) => cohort === 'all' || cohortOf(s.pid) === cohort)
  .sort((a, b) => b.started_at.localeCompare(a.started_at))
  .map((s) => {
    const own = events.filter((e) => e.session_id === s.id).sort((a, b) => a.seq - b.seq);
    const done = own.filter((e) => ENDS.has(e.kind)).length;
    const last = own[own.length - 1];
    return {
      cohort: cohortOf(s.pid),
      name: s.participant_name ?? '',
      pid: s.pid ?? '',
      started: time(s.started_at),
      finished: s.finished_at ? time(s.finished_at) : '',
      tasks: `${done}/${taskCount}`,
      events: own.length,
      last: last ? `${last.kind}${last.task_id ? ` (${last.task_id})` : ''} ${time(last.ts)}` : 'nothing saved',
    };
  });

console.table(rows);
const counts = ['trial', 'pilot', 'main'].map((c) => `${c} ${rows.filter((r) => r.cohort === c).length}`).join(', ');
console.log(`${rows.length} sessions: ${counts}. Finished: ${rows.filter((r) => r.finished).length}.`);
