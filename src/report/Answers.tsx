import type { Scenario } from '../parse/types';
import type { StudyResponse, StudySession } from '../session';

/**
 * What people said they would look for, before they saw any menu.
 *
 * Grouped by scenario rather than by person, because the useful comparison is
 * between the words different people reach for on the same job. One collapsed
 * block per scenario keeps the page scannable: nine scenarios times a couple of
 * dozen participants is a lot of prose to leave open by default.
 */
export function Answers({
  responses,
  sessions,
  scenarios,
}: {
  responses: StudyResponse[];
  sessions: StudySession[];
  scenarios: Scenario[];
}) {
  const labelFor = new Map(sessions.map((s) => [s.id, s.participant_label]));

  const byScenario = scenarios
    .map((scenario) => ({
      scenario,
      answers: responses
        .filter((r) => r.scenario_id === scenario.id)
        .map((r) => ({
          who: labelFor.get(r.session_id) ?? 'Anonymous',
          text: r.response,
          ts: r.ts,
        }))
        .sort((a, b) => a.who.localeCompare(b.who)),
    }))
    .filter((group) => group.answers.length > 0);

  if (byScenario.length === 0) {
    return (
      <p className="muted small">
        No answers yet. Everyone who has taken the study so far did so before this question existed.
      </p>
    );
  }

  return (
    <div className="answers">
      {byScenario.map(({ scenario, answers }) => (
        <details key={scenario.id}>
          <summary>
            {scenario.persona}
            <span className="muted small"> · {answers.length}</span>
          </summary>
          <ul>
            {answers.map((a, i) => (
              <li key={`${a.who}-${i}`}>
                <span className="answer-who">{a.who}</span>
                <span className="answer-text">{a.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
