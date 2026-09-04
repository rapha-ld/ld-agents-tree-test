import type { Scenario } from '../parse/types';
import type { StudyResponse, StudySession } from '../session';

/**
 * What people said they would look for, before they saw any menu.
 *
 * Grouped by task rather than by person, because the useful comparison is
 * between the words different people reach for on the same job. One collapsed
 * block per task keeps the page scannable, and a task is the right grain: a
 * scenario covers several jobs, and the word someone reaches for when turning a
 * flag off is not the word they reach for when checking whether it worked.
 *
 * Answers written before the question moved from per-scenario to per-task carry
 * `task_index: 0`, so they land under the first task of their scenario. They are
 * counted separately in the summary rather than silently mixed in.
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
  const schemeFor = new Map(sessions.map((s) => [s.id, s.scheme_id]));

  const groups = scenarios.flatMap((scenario) =>
    scenario.tasks.map((task, taskIndex) => ({
      key: `${scenario.id}-${taskIndex}`,
      scenario,
      task,
      taskIndex,
      answers: responses
        .filter((r) => r.scenario_id === scenario.id && (r.task_index ?? 0) === taskIndex)
        .map((r) => ({
          who: labelFor.get(r.session_id) ?? 'Anonymous',
          scheme: schemeFor.get(r.session_id) ?? null,
          text: r.response,
        }))
        .sort((a, b) => a.who.localeCompare(b.who)),
    })),
  );

  const withAnswers = groups.filter((g) => g.answers.length > 0);
  const total = withAnswers.reduce((n, g) => n + g.answers.length, 0);

  if (withAnswers.length === 0) {
    return (
      <p className="muted small">
        No answers yet. Everyone who has taken the study so far did so before this question existed.
      </p>
    );
  }

  return (
    <>
      <p className="muted small">
        {total} {total === 1 ? 'answer' : 'answers'} across {withAnswers.length} of {groups.length} tasks. The menu each
        person was on is shown beside their answer, so a word that only appears in one arm is visible as such.
      </p>
      <div className="answers">
        {withAnswers.map(({ key, scenario, task, taskIndex, answers }) => (
          <details key={key}>
            <summary>
              {task.prompt}
              <span className="muted small">
                {' '}
                · {scenario.persona}, task {taskIndex + 1} · {answers.length}
              </span>
            </summary>
            <ul>
              {answers.map((a, i) => (
                <li key={`${a.who}-${i}`}>
                  <span className="answer-who">
                    {a.who}
                    {a.scheme ? <span className="muted small"> ({a.scheme})</span> : null}
                  </span>
                  <span className="answer-text">{a.text}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}
