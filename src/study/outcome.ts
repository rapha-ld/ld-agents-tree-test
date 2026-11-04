import type { StudyEvent, TaskOutcomeKind } from '../session';

export type Classified = {
  outcome: TaskOutcomeKind;
  answerPath: string | null;
  answerDestination: string | null;
  firstClick: string | null;
  timeMs: number | null;
};

const onPathTo = (answer: string, path: string) => answer === path || answer.startsWith(`${path} / `);

/**
 * Tree-test scoring, from one task's events.
 *
 * - skip: they chose "Skip this task".
 * - direct: right answer, and every node they opened or picked was on the way
 *   to it, with no collapsing on the way.
 * - indirect: right answer after going somewhere else first.
 * - fail: wrong answer.
 *
 * Returns null while the task has no submit or skip yet.
 */
export function classifyTask(events: StudyEvent[], accepted: Set<string>): Classified | null {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const terminal = ordered.find((e) => e.kind === 'submit' || e.kind === 'giveup');
  if (!terminal) return null;

  const start = ordered.find((e) => e.kind === 'start');
  const ms = start ? new Date(terminal.ts).getTime() - new Date(start.ts).getTime() : NaN;
  const timeMs = Number.isFinite(ms) && ms >= 0 ? ms : null;
  const firstClick = ordered.find((e) => e.kind === 'click')?.node_path ?? null;

  if (terminal.kind === 'giveup') {
    return { outcome: 'skip', answerPath: null, answerDestination: null, firstClick, timeMs };
  }

  const answerPath = terminal.node_path;
  const answerDestination = terminal.destination_id;
  const right = answerDestination !== null && accepted.has(answerDestination);
  let outcome: TaskOutcomeKind = 'fail';
  if (right) {
    const strayed = ordered.some(
      (e) => e.seq < terminal.seq && (e.kind === 'back' || (e.kind === 'click' && !onPathTo(answerPath, e.node_path))),
    );
    outcome = strayed ? 'indirect' : 'direct';
  }
  return { outcome, answerPath, answerDestination, firstClick: firstClick ?? answerPath, timeMs };
}
