/**
 * Score the click test: pull ct_sessions and ct_events, score every task attempt
 * against clicktest/tasks.yaml, and write clicktest-results.json (one row per
 * attempt) and clicktest-report.md (one row per task).
 *
 *   pnpm score:clicktest                      read from Supabase (service role)
 *   pnpm score:clicktest --file answers.json  read a participant's downloaded file instead
 *   pnpm score:clicktest --include-pilots     keep sessions whose pid starts with PILOT-
 *
 * SUPABASE_SERVICE_ROLE_KEY is read from .env.local and is never VITE_-prefixed;
 * see pull-results.ts for why.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreTask } from '../src/clicktest/harness/score';
import type { TaskScore } from '../src/clicktest/harness/score';
import { median } from '../src/report/analyze';
import { parseTasks } from '../src/clicktest/harness/parseTasks';
import type { CtEvent, CtSession, Outcome } from '../src/clicktest/harness/types';
import { fetchAllRows } from '../src/pull/paged';

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const includePilots = args.includes('--include-pilots');

async function load(): Promise<{ sessions: CtSession[]; events: CtEvent[] }> {
  if (fileArg) return JSON.parse(readFileSync(fileArg, 'utf8'));
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

const file = parseTasks(readFileSync(join(process.cwd(), 'clicktest/tasks.yaml'), 'utf8'));
const tasks = [...file.tasks, ...(file.sample_tasks ?? [])];

const { sessions, events } = await load();
const kept = sessions.filter((s) => includePilots || !(s.pid ?? '').startsWith('PILOT-'));

// A retried batch can land twice in data written before the unique index; keep one copy of each.
const seen = new Set<string>();
const unique = events.filter((e) => {
  const key = `${e.session_id}:${e.seq}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const bySession = new Map<string, typeof unique>();
for (const e of unique) {
  const list = bySession.get(e.session_id);
  if (list) list.push(e);
  else bySession.set(e.session_id, [e]);
}
const keptIds = new Set(kept.map((s) => s.id));

const attempts: Array<TaskScore & { session_id: string; pid: string | null; participant_name: string | null }> = [];
for (const s of kept) {
  const own = bySession.get(s.id) ?? [];
  for (const t of tasks) {
    if (!own.some((e) => e.task_id === t.id)) continue;
    attempts.push({ session_id: s.id, pid: s.pid, participant_name: s.participant_name ?? null, ...scoreTask(t, own) });
  }
}

const answers = unique
  .filter((e) => e.kind === 'answer' && keptIds.has(e.session_id))
  .map((e) => ({
    session_id: e.session_id,
    task_id: e.task_id,
    question: String(e.meta?.question ?? ''),
    value: e.meta?.value,
  }));
const confidenceFor = (taskId: string) =>
  answers
    .filter((a) => a.question === 'confidence' && a.task_id === taskId && typeof a.value === 'number')
    .map((a) => a.value as number);

const pct = (n: number, d: number) => (d === 0 ? '–' : `${Math.round((100 * n) / d)}%`);

const OUTCOMES: Outcome[] = ['success', 'recovered', 'failure', 'giveup', 'timeout', 'incomplete'];
const lines: string[] = [];
lines.push('# Click test results', '');
lines.push(
  `${kept.length} sessions (${sessions.length - kept.length} pilot sessions left out). ${attempts.length} task attempts.`,
  '',
);
lines.push(
  '| Task | n | Success | Recovered | Failure | Gave up | Timed out | First click right | Median time | Median confidence (1–7) | Changed answer | Used search | Search first | Backtracks per attempt (section / up / method / revisit) |',
);
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const t of tasks) {
  const a = attempts.filter((x) => x.task_id === t.id);
  const count = (o: Outcome) => a.filter((x) => x.outcome === o).length;
  const first = a.filter((x) => x.first_click_correct !== null);
  const times = a.map((x) => x.duration_ms).filter((x): x is number => x !== null);
  const med = median(times);
  const confidence = median(confidenceFor(t.id));
  const avg = (f: (x: (typeof a)[number]) => number) =>
    a.length ? (a.reduce((sum, x) => sum + f(x), 0) / a.length).toFixed(1) : '–';
  const backtracks = `${avg((x) => x.backtracks)} (${avg((x) => x.backtrack_kinds.section)} / ${avg((x) => x.backtrack_kinds.up)} / ${avg((x) => x.backtrack_kinds.method)} / ${avg((x) => x.backtrack_kinds.revisit)})`;
  lines.push(
    `| ${t.id} | ${a.length} | ${pct(count('success'), a.length)} | ${pct(count('recovered'), a.length)} | ${pct(count('failure'), a.length)} | ${pct(count('giveup'), a.length)} | ${pct(count('timeout'), a.length)} | ${pct(first.filter((x) => x.first_click_correct).length, first.length)} | ${med === null ? '–' : `${Math.round(med / 1000)}s`} | ${confidence ?? '–'} | ${pct(a.filter((x) => x.selections > 1).length, a.length)} | ${pct(a.filter((x) => x.used_search).length, a.length)} | ${pct(a.filter((x) => x.first_click_search).length, a.length)} | ${backtracks} |`,
  );
}
lines.push('');
lines.push(
  `Search: used in ${pct(attempts.filter((x) => x.used_search).length, attempts.length)} of attempts, and the first click in ${pct(attempts.filter((x) => x.first_click_search).length, attempts.length)}.`,
  '',
);
lines.push(
  'Success means every click followed a success path and the participant confirmed a selection on a target page. Changed answer is the share who selected more than one answer before confirming. Used search is the share who opened search or picked a search result at all; search first is the share whose first click was search. Recovered means they reached a target page after leaving the path; it counts as a failure. A backtrack is any abandoned route: switching section, going back up a section, switching between browsing, search and Create, or returning to a page already left.',
  '',
);

lines.push('## Most common click paths', '');
for (const t of tasks) {
  const a = attempts.filter((x) => x.task_id === t.id);
  if (a.length === 0) continue;
  const tally = new Map<string, { n: number; outcomes: Set<Outcome> }>();
  for (const x of a) {
    const key = x.clicks.join(' → ') || '(no clicks)';
    const entry = tally.get(key) ?? { n: 0, outcomes: new Set<Outcome>() };
    entry.n += 1;
    entry.outcomes.add(x.outcome);
    tally.set(key, entry);
  }
  lines.push(`### ${t.id}`, '', t.prompt, '');
  [...tally.entries()]
    .sort((x, y) => y[1].n - x[1].n)
    .slice(0, 5)
    .forEach(([path, { n, outcomes }]) => lines.push(`- ${n}× ${path} (${[...outcomes].join(', ')})`));
  lines.push('');
}

for (const q of file.wrap_up ?? []) {
  if (!q.options) continue;
  const given = answers.filter((a) => a.question === q.id && a.value);
  lines.push(`## ${q.question}`, '', `${given.length} answers.`, '');
  if (q.columns) {
    lines.push(`| Item | ${q.columns.join(' | ')} |`, `|---|${q.columns.map(() => '---').join('|')}|`);
    for (const o of q.options) {
      const picks = given.map((a) => (a.value as Record<string, string>)[o]).filter(Boolean);
      lines.push(
        `| ${o} | ${q.columns.map((c) => pct(picks.filter((p) => p === c).length, picks.length)).join(' | ')} |`,
      );
    }
  } else {
    for (const o of q.options)
      lines.push(`- ${pct(given.filter((a) => (a.value as string[]).includes(o)).length, given.length)} ${o}`);
  }
  lines.push('');
}
const openQuestions = [
  ...(file.first_impression ? [{ id: 'first-impression', question: file.first_impression.question }] : []),
  ...(file.wrap_up ?? []).filter((q) => !q.options),
];
for (const q of openQuestions) {
  const texts = answers.filter((a) => a.question === q.id && typeof a.value === 'string' && a.value);
  if (texts.length === 0) continue;
  lines.push(`## ${q.question}`, '');
  for (const a of texts) lines.push(`- ${a.value as string}`);
  lines.push('');
}
const unsure = answers.filter((a) => a.question === 'unsure-why' && typeof a.value === 'string');
if (unsure.length && file.follow_up?.probe) {
  lines.push(`## ${file.follow_up.probe.question}`, '');
  for (const t of tasks) {
    const texts = unsure.filter((a) => a.task_id === t.id);
    if (texts.length === 0) continue;
    lines.push(`### ${t.id}`, '');
    for (const a of texts) lines.push(`- ${a.value as string}`);
    lines.push('');
  }
}

writeFileSync(
  join(process.cwd(), 'clicktest-results.json'),
  `${JSON.stringify({ sessions: kept, attempts, answers }, null, 2)}\n`,
);
writeFileSync(join(process.cwd(), 'clicktest-report.md'), `${lines.join('\n')}\n`);
console.log(`Scored ${attempts.length} attempts from ${kept.length} sessions.`);
console.log('Wrote clicktest-results.json and clicktest-report.md.');
for (const o of OUTCOMES) {
  const n = attempts.filter((x) => x.outcome === o).length;
  if (n) console.log(`  ${o}: ${n}`);
}
