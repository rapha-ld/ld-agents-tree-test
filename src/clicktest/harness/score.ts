// Scores one participant's attempt at one task from its events. Pure, so the
// browser, the scoring script and the tests all agree on what counts.

import type { BacktrackKind, Step } from './trail';
import { replay } from './trail';
import type { CtEvent, Outcome, Task } from './types';

export interface TaskScore {
  task_id: string;
  outcome: Outcome;
  /** The click path, with a repeated click on the same element collapsed to one. */
  clicks: string[];
  /** The page the participant was on when the task ended. */
  final_page: string | null;
  first_click_correct: boolean | null;
  /** Every time the participant abandoned a route (trail.ts has the kinds). */
  backtracks: number;
  backtrack_kinds: Record<BacktrackKind, number>;
  /** How many answers they selected before confirming; more than one means they changed their answer. */
  selections: number;
  /** They opened search or picked a search result at least once. */
  used_search: boolean;
  first_click_search: boolean;
  duration_ms: number | null;
}

/** A double click on one element is one step, not two. */
export function collapseRepeats(ids: string[]): string[] {
  return ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
}

export function matchesPath(clicks: string[], paths: string[][]): boolean {
  return paths.some((p) => p.length === clicks.length && p.every((step, i) => step === clicks[i]));
}

const isSearch = (id: string) => id === 'search:field' || id.startsWith('palette:');

export function scoreTask(task: Task, events: CtEvent[]): TaskScore {
  const own = events.filter((e) => e.task_id === task.id).sort((a, b) => a.seq - b.seq);
  const start = own.find((e) => e.kind === 'task_start');
  const end = own.find((e) => e.kind === 'found' || e.kind === 'giveup' || e.kind === 'timeout');

  const clicks = collapseRepeats(
    own.filter((e) => e.kind === 'click' && e.track_id !== null).map((e) => e.track_id as string),
  );

  const pages = own.filter((e) => e.kind === 'page').map((e) => e.page as string);
  // Recomputed from the clicks rather than read from the logged backtrack
  // events, so a change to the rules in trail.ts re-scores old sessions too.
  const backtracks = replay(
    task.start.page,
    own.flatMap((e): Step[] => {
      if (e.kind === 'click' && e.track_id) return [{ kind: 'click', trackId: e.track_id }];
      if (e.kind === 'page' && e.page) return [{ kind: 'page', page: e.page }];
      return [];
    }),
    task.start.open_sections,
  );
  const backtrackKinds: Record<BacktrackKind, number> = { section: 0, up: 0, method: 0, revisit: 0 };
  for (const b of backtracks) backtrackKinds[b.kind] += 1;
  // A confirmed answer carries the page that was selected; the event's own page column is just the
  // page on screen, which can differ (a rail button navigates without making a selection).
  const confirmed = end?.kind === 'found' && typeof end.meta?.page === 'string' ? end.meta.page : null;
  const finalPage = confirmed ?? end?.page ?? (pages.length ? pages[pages.length - 1] : task.start.page);

  const firstClickCorrect =
    clicks.length === 0 ? null : task.success_paths.some((p) => p.length > 0 && p[0] === clicks[0]);

  const duration = start && end ? new Date(end.ts).getTime() - new Date(start.ts).getTime() : null;

  let outcome: Outcome;
  if (!end) outcome = 'incomplete';
  else if (end.kind === 'giveup') outcome = 'giveup';
  else if (end.kind === 'timeout') outcome = 'timeout';
  else {
    const onTarget = finalPage !== null && task.target.includes(finalPage);
    // Pressing the target page's main button is how a participant answers, so it never breaks a path.
    const last = clicks[clicks.length - 1];
    const route = last?.startsWith('cta:') && task.target.includes(last.slice(4)) ? clicks.slice(0, -1) : clicks;
    if (onTarget && (matchesPath(clicks, task.success_paths) || matchesPath(route, task.success_paths)))
      outcome = 'success';
    else if (onTarget) outcome = 'recovered';
    else outcome = 'failure';
  }

  return {
    task_id: task.id,
    outcome,
    clicks,
    final_page: finalPage,
    first_click_correct: firstClickCorrect,
    backtracks: backtracks.length,
    backtrack_kinds: backtrackKinds,
    selections: own.filter((e) => e.kind === 'select').length,
    used_search: clicks.some(isSearch),
    first_click_search: clicks.length > 0 && isSearch(clicks[0]),
    duration_ms: duration,
  };
}
