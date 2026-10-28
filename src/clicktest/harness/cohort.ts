// Which runs count as what, from the pid in the study link. Trial runs are ours (checking the
// harness), pilots are colleagues giving feedback, and everything else is the main study.
//   TEST-… or DISCARD-…  trial
//   PILOT-…              pilot
//   anything else        main (including a link opened with no pid)

export type Cohort = 'trial' | 'pilot' | 'main';

export const COHORTS: Cohort[] = ['trial', 'pilot', 'main'];

export function cohortOf(pid: string | null): Cohort {
  const p = (pid ?? '').toUpperCase();
  if (p.startsWith('TEST-') || p.startsWith('DISCARD-')) return 'trial';
  if (p.startsWith('PILOT-')) return 'pilot';
  return 'main';
}
