/**
 * Session ids left out of the analysis.
 *
 * Excluding is not deleting. A run stays in the database and can be put back,
 * so a mis-click costs nothing and you can always show the numbers with and
 * without a given participant. Use `pnpm discard <session-id>` when a run should
 * genuinely be gone.
 *
 * Kept in localStorage keyed by session id so it survives a re-pull. It does not
 * follow you to another machine, which is the accepted cost of not giving the
 * browser write access to the database.
 */
const KEY = 'nav-lab-excluded';

export function readExcluded(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // A corrupt store should not take the report down with it.
  }
  return new Set();
}

export function writeExcluded(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private mode. The in-memory set still applies for this sitting.
  }
}
