import type { Scheme } from '../parse/types';
import type { SessionSummary } from './analyze';

/**
 * Who took the study, and the control for leaving one out.
 *
 * Excluding is reversible and touches nothing in the database. The session id
 * is shown because `pnpm discard <session-id>` is the way to remove a run for
 * real, and copying it from here beats going to the Supabase dashboard.
 */
export function Participants({
  sessions,
  schemes,
  excluded,
  onToggle,
  totalTasks,
}: {
  sessions: SessionSummary[];
  schemes: Scheme[];
  excluded: Set<string>;
  onToggle: (sessionId: string) => void;
  totalTasks: number;
}) {
  const nameFor = (id: string) => schemes.find((s) => s.id === id)?.name ?? id;

  // Most recent first: a study is usually read from the run you just took.
  const ordered = [...sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const anonIndex = new Map<string, number>();
  let n = 0;
  for (const s of [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))) {
    if (!s.label) anonIndex.set(s.sessionId, ++n);
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const took = (ms: number | null) => {
    if (ms === null) return '—';
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  if (sessions.length === 0) {
    return <p className="muted">Nobody has taken the study yet.</p>;
  }

  return (
    <div className="scroll">
      <table className="participants">
        <thead>
          <tr>
            <th>Person</th>
            <th>Menu</th>
            <th>Taken</th>
            <th>Took</th>
            <th>Tasks</th>
            <th>Right</th>
            <th>Gave up</th>
            <th>Counted</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => {
            const out = excluded.has(s.sessionId);
            return (
              <tr key={s.sessionId} className={out ? 'excluded' : undefined}>
                <th>
                  <span className="pname">{s.label ?? `Anonymous ${anonIndex.get(s.sessionId)}`}</span>
                  <code className="psid" title={s.sessionId}>
                    {s.sessionId.slice(0, 8)}
                  </code>
                </th>
                <td>{nameFor(s.schemeId)}</td>
                <td>{when(s.startedAt)}</td>
                <td>{took(s.durationMs)}</td>
                <td>
                  {s.tasksCompleted} of {totalTasks}
                  {s.finished ? null : <span className="tag">left early</span>}
                </td>
                <td>{s.successes}</td>
                <td>{s.giveups}</td>
                <td>
                  <label className="switch">
                    <input type="checkbox" checked={!out} onChange={() => onToggle(s.sessionId)} />
                    <span>{out ? 'No' : 'Yes'}</span>
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
