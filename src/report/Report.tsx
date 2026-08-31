import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { destinations, scenarios, schemes, snapshotDate, weights } from '../data';
import { DEFAULT_PARAMS, scoreScheme, type CostParams } from '../score/cost';
import { clearLocalResults, exportLocalResults, localResultCount, persistenceMode } from '../session';
import { analyze, type ResultsFile, type SchemeOutcome } from './analyze';

const ASSUMPTION_SWEEP = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];

function pct(v: number | null) {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}
function num(v: number | null, digits = 2) {
  return v === null ? '—' : v.toFixed(digits);
}
function secs(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

/** A table row whose label carries its own one-line explanation. */
function Row({ label, hint, children, strong }: { label: string; hint: string; children: ReactNode; strong?: boolean }) {
  return (
    <tr className={strong ? 'headline' : undefined}>
      <th>
        <span className="rowlabel">{label}</span>
        <span className="rowhint">{hint}</span>
      </th>
      {children}
    </tr>
  );
}

export function Report() {
  const [readCost, setReadCost] = useState(DEFAULT_PARAMS.alpha);
  const [offscreenCost, setOffscreenCost] = useState(DEFAULT_PARAMS.overflowPenalty);
  const [detail, setDetail] = useState<string | null>(null);
  const [measured, setMeasured] = useState<SchemeOutcome[] | null>(null);
  const [measuredFrom, setMeasuredFrom] = useState<'this browser' | 'a file' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const params: CostParams = useMemo(
    () => ({ ...DEFAULT_PARAMS, alpha: readCost, overflowPenalty: offscreenCost }),
    [readCost, offscreenCost],
  );

  const results = useMemo(
    () => schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, params)),
    [params],
  );

  const sweep = useMemo(
    () =>
      ASSUMPTION_SWEEP.map((a) => ({
        alpha: a,
        scores: schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, { ...params, alpha: a })),
      })),
    [params],
  );

  const best = results.reduce((a, b) =>
    (b.scenarioWeightedTotal ?? Infinity) < (a.scenarioWeightedTotal ?? Infinity) ? b : a,
  );

  const local = localResultCount();
  const totalTasks = scenarios.reduce((s, x) => s + x.tasks.length, 0);

  // Anyone who just took the test should see their results without having to
  // export a file and load it back in.
  useEffect(() => {
    if (measuredFrom === 'a file') return;
    try {
      const parsed = JSON.parse(exportLocalResults()) as ResultsFile;
      const outcomes = analyze(parsed, schemes, scenarios);
      setMeasured(outcomes.length > 0 ? outcomes : null);
      setMeasuredFrom(outcomes.length > 0 ? 'this browser' : null);
    } catch {
      setMeasured(null);
      setMeasuredFrom(null);
    }
  }, [measuredFrom]);

  const loadResults = async (file: File) => {
    setLoadError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ResultsFile;
      if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.events)) {
        throw new Error('Expected a file with a list of sessions and a list of events');
      }
      setMeasured(analyze(parsed, schemes, scenarios));
      setMeasuredFrom('a file');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  const download = () => {
    const blob = new Blob([exportLocalResults()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nav-lab-results.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="report">
      <header>
        <h1>Menu comparison</h1>
        <p className="muted">
          {schemes.length} menus, scored against {scenarios.length} scenarios made of {totalTasks} tasks. Page list taken
          from the product on {snapshotDate}: {destinations.size} places you can get to.
        </p>
      </header>

      <section className="explainer">
        <h3>What the numbers mean</h3>
        <p>
          Every number in the top table is an <strong>effort score</strong>. One point is roughly one click. Fractions
          get added for the things that make a click harder than a click: a long menu is more to read than a short one,
          an item tucked inside a collapsed section or a fly-out needs an extra action to reveal, and a feature only some
          accounts can see is invisible to everyone else.
        </p>
        <p>
          So three clicks through short menus scores a little over three. The same three clicks through long menus, with
          a collapsed section on the way, scores five or six. <strong>Lower is better.</strong>
        </p>
        <p>
          <strong>Average effort per task</strong> is the number to look at first, because it is on a scale you can hold
          in your head. <strong>Overall score</strong> adds up all {scenarios.length} scenarios and counts the more
          important ones more heavily, so it is only useful for comparing one column against another. On its own it means
          nothing.
        </p>
      </section>

      <section className="explainer caution">
        <h3>Two things to know before trusting it</h3>
        <p>
          <strong>This score only measures getting there, not finding it.</strong> It assumes you already know which item
          to click. It says nothing about whether the label would lead you to the right place in the first place, which
          is usually the bigger problem. That is what the test measures, further down this page.
        </p>
        <p>
          <strong>A single long list can look deceptively good.</strong> Grouping a list means reading twice, once to
          pick the group and once inside it, plus an extra click. Add that up and one long list of everything can beat a
          tidy set of groups, which is not how people behave once a list runs off the bottom of the screen. So we charge
          extra for each item past the twelfth. Drag the second slider to zero and watch{' '}
          <strong>{schemes.find((s) => s.id === 'flat')?.name ?? 'the flat menu'}</strong> jump to first place. That is
          the assumption doing the work, and it is worth knowing it is there.
        </p>
      </section>

      <section className="controls">
        <label>
          How much reading a menu costs: <strong>{readCost.toFixed(2)}</strong>
          <input type="range" min={0} max={2} step={0.05} value={readCost} onChange={(e) => setReadCost(Number(e.target.value))} />
          <span className="hint">Higher means long menus are punished more.</span>
        </label>
        <label>
          Extra cost per item that does not fit on screen: <strong>{offscreenCost.toFixed(2)}</strong>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={offscreenCost}
            onChange={(e) => setOffscreenCost(Number(e.target.value))}
          />
          <span className="hint">Applies past {DEFAULT_PARAMS.overflowBudget} items in one list. Zero ignores the screen entirely.</span>
        </label>
      </section>

      <h2>Predicted effort</h2>
      <p className="muted">Calculated from the menu structure. No people involved.</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>&nbsp;</th>
              {results.map((r) => (
                <th key={r.schemeId} className={r.schemeId === best.schemeId ? 'best' : undefined}>
                  {r.schemeName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Average effort per task" hint="roughly, how many clicks' worth of work each task takes" strong>
              {results.map((r) => (
                <td key={r.schemeId} className={r.schemeId === best.schemeId ? 'best' : undefined}>
                  {num(r.meanTaskCost)}
                </td>
              ))}
            </Row>
            <Row label="Average clicks per task" hint="just the clicks, ignoring how hard each one is">
              {results.map((r) => (
                <td key={r.schemeId}>{num(r.meanTaskClicks, 1)}</td>
              ))}
            </Row>
            <Row label="Overall score" hint="all scenarios added up, important ones counted more; compare columns only">
              {results.map((r) => (
                <td key={r.schemeId} className={r.schemeId === best.schemeId ? 'best' : undefined}>
                  {num(r.scenarioWeightedTotal, 1)}
                </td>
              ))}
            </Row>
            <Row label="Average effort for any page" hint="across all 169 pages the menu reaches, not just the tested ones">
              {results.map((r) => (
                <td key={r.schemeId}>{num(r.meanCost)}</td>
              ))}
            </Row>
            <Row label="Hardest page to reach" hint="the single worst case, and which page it is">
              {results.map((r) => (
                <td key={r.schemeId}>
                  {r.worstCase ? (
                    <>
                      {num(r.worstCase.cost)} <span className="muted small">{r.worstCase.destinationId}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              ))}
            </Row>
            <Row label="Items in the top level" hint="what you see before clicking anything">
              {results.map((r) => (
                <td key={r.schemeId}>{r.breadth[0]?.max ?? 0}</td>
              ))}
            </Row>
            <Row label="Most choices on one screen" hint="the busiest list anywhere in the menu">
              {results.map((r) => (
                <td key={r.schemeId}>{Math.max(...r.breadth.map((b) => b.max))}</td>
              ))}
            </Row>
            <Row label="Pages the menu reaches" hint="should match across menus, otherwise the comparison is unfair">
              {results.map((r) => (
                <td key={r.schemeId}>{r.boundDestinations}</td>
              ))}
            </Row>
            <Row label="Pages in two places at once" hint="helps people find things, muddies the structure">
              {results.map((r) => (
                <td key={r.schemeId}>{r.duplicated.length}</td>
              ))}
            </Row>
            <Row label="Pages not in the menu" hint="normal: most pages are reached by opening an item, not from the menu">
              {results.map((r) => (
                <td key={r.schemeId}>{r.unreachable.length}</td>
              ))}
            </Row>
            <Row label="Pages that do not exist yet" hint="invented by a proposed menu; nothing to compare them against">
              {results.map((r) => (
                <td key={r.schemeId}>{r.proposed.length}</td>
              ))}
            </Row>
            {Object.keys(weights).length > 0 ? (
              <Row label="Effort weighted by how often pages are used" hint="from real traffic">
                {results.map((r) => (
                  <td key={r.schemeId}>{num(r.weightedMeanCost)}</td>
                ))}
              </Row>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>Effort by scenario</h2>
      <p className="muted">
        Each scenario is one job someone came to do, split into tasks. The lowest number in each row is highlighted.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              {results.map((r) => (
                <th key={r.schemeId}>{r.schemeName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => {
              const cells = results.map((r) => r.scenarios.find((s) => s.scenarioId === scenario.id));
              const finite = cells.map((c) => c?.total).filter((v): v is number => typeof v === 'number');
              const min = finite.length ? Math.min(...finite) : null;
              return (
                <tr key={scenario.id}>
                  <th>
                    <span className="rowlabel">{scenario.persona}</span>
                    <span className="rowhint">
                      {scenario.tasks.length} tasks
                      {scenario.weight !== 1 ? ` · counted ${scenario.weight}× in the overall score` : ''}
                    </span>
                  </th>
                  {cells.map((c, i) => (
                    <td key={results[i].schemeId} className={c?.total !== null && c?.total === min ? 'best' : undefined}>
                      {c?.total === null ? (
                        <span className="warn">can&rsquo;t get there</span>
                      ) : (
                        num(c?.total ?? null)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Does the winner hold up?</h2>
      <p className="muted">
        The same comparison run with the &ldquo;how much reading costs&rdquo; setting turned all the way down and all the
        way up. A menu that leads every row is genuinely ahead. One that only leads in the middle is winning because of
        the setting, not because it is better.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Reading cost</th>
              {schemes.map((s) => (
                <th key={s.id}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sweep.map((row) => {
              const leader = row.scores.reduce((a, b) =>
                (b.scenarioWeightedTotal ?? Infinity) < (a.scenarioWeightedTotal ?? Infinity) ? b : a,
              );
              return (
                <tr key={row.alpha}>
                  <th>{row.alpha === 0 ? 'none (0)' : row.alpha}</th>
                  {row.scores.map((r) => (
                    <td key={r.schemeId} className={r.schemeId === leader.schemeId ? 'best' : undefined}>
                      {num(r.scenarioWeightedTotal, 1)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>What people actually did</h2>
      {persistenceMode === 'local' ? (
        <p className="muted">Database not connected. Results are being saved locally.</p>
      ) : null}

      {measured && measured.length > 0 ? (
        <>
          <p className="muted">
            From {measuredFrom}. Only completed runs feed the rates, so a half-finished run cannot skew them. Runs
            people abandoned are counted separately at the bottom. These numbers matter more than the predicted ones: if
            people find things easily in a menu the score calls hard work, trust the people.
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>&nbsp;</th>
                  {measured.map((m) => (
                    <th key={m.schemeId}>{schemes.find((s) => s.id === m.schemeId)?.name ?? m.schemeId}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="People tested" hint="one menu each, so they are never compared unfairly">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{m.sessions}</td>
                  ))}
                </Row>
                <Row label="Tasks attempted" hint="people multiplied by tasks">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{m.attempts}</td>
                  ))}
                </Row>
                <Row label="Found the right place" hint="ended up somewhere we would accept as correct" strong>
                  {measured.map((m) => (
                    <td key={m.schemeId}>{pct(m.successRate)}</td>
                  ))}
                </Row>
                <Row label="Went straight there" hint="found it without going back to try somewhere else" strong>
                  {measured.map((m) => (
                    <td key={m.schemeId}>{pct(m.directnessRate)}</td>
                  ))}
                </Row>
                <Row label="First choice was on the right track" hint="their very first click could have led to the answer">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{pct(m.firstClickRate)}</td>
                  ))}
                </Row>
                <Row label="Gave up" hint="said they would not know where to look">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{pct(m.giveupRate)}</td>
                  ))}
                </Row>
                <Row label="Typical time per task" hint="the middle of the range, so one slow person cannot skew it" strong>
                  {measured.map((m) => (
                    <td key={m.schemeId}>{secs(m.medianMs)}</td>
                  ))}
                </Row>
                <Row label="Typical time for the whole set" hint="one participant working through every task">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{secs(m.medianRunMs)}</td>
                  ))}
                </Row>
                <Row label="Started" hint="everyone who began, whether or not they got to the end">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{m.startedSessions}</td>
                  ))}
                </Row>
                <Row label="Gave up partway" hint="left before the last task; their answers are excluded above" strong>
                  {measured.map((m) => (
                    <td key={m.schemeId}>
                      {m.abandonedSessions}
                      {m.startedSessions > 0 ? (
                        <span className="muted"> ({pct(m.abandonedSessions / m.startedSessions)})</span>
                      ) : null}
                    </td>
                  ))}
                </Row>
                <Row label="Tasks reached before leaving" hint="typical progress of someone who quit, out of 31">
                  {measured.map((m) => (
                    <td key={m.schemeId}>{num(m.medianTasksBeforeAbandon, 0)}</td>
                  ))}
                </Row>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted">
          Nobody has finished a test yet. <a href="#/study">Take one</a> and the results will appear here.
        </p>
      )}

      {measured && measured.length > 0 ? (
        <>
          <h2>How long it took</h2>
          <p className="muted">
            Time is a separate question from effort. A flat list can score well on effort and still be slower, because a
            long list takes longer to read even when it takes fewer clicks. Times are medians, so someone who wandered off
            mid-task cannot drag a column. The fastest time in each row is highlighted.
          </p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  {measured.map((m) => (
                    <th key={m.schemeId}>{schemes.find((s) => s.id === m.schemeId)?.name ?? m.schemeId}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => {
                  const cells = measured.map((m) => m.scenarioOutcomes.find((o) => o.scenarioId === scenario.id));
                  const times = cells.map((c) => c?.medianMs).filter((v): v is number => typeof v === 'number');
                  const fastest = times.length ? Math.min(...times) : null;
                  if (times.length === 0) return null;
                  return (
                    <tr key={scenario.id}>
                      <th>
                        <span className="rowlabel">{scenario.persona}</span>
                        <span className="rowhint">
                          {cells
                            .map((c) => (c ? `${c.successes}/${c.attempts} found` : null))
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </th>
                      {cells.map((c, i) => (
                        <td
                          key={measured[i].schemeId}
                          className={c?.medianMs !== null && c?.medianMs === fastest ? 'best' : undefined}
                        >
                          {secs(c?.medianMs ?? null)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="actions">
        <button onClick={download} disabled={local.sessions === 0}>
          Download results
        </button>
        <label className="filebtn">
          Load a results file
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadResults(file);
            }}
          />
        </label>
        <button
          className="ghost"
          onClick={() => {
            clearLocalResults();
            setMeasured(null);
            setMeasuredFrom(null);
          }}
          disabled={local.sessions === 0}
        >
          Clear results from this browser
        </button>
      </div>
      {loadError ? <p className="warn">Could not read that file: {loadError}</p> : null}

      <h2>How someone would get there</h2>
      <p className="muted">
        The cheapest route to each task in one menu, so you can sanity-check the numbers above against the actual
        clicks.
      </p>
      <div className="tabs">
        {results.map((r) => (
          <button
            key={r.schemeId}
            className={detail === r.schemeId ? 'tab active' : 'tab'}
            onClick={() => setDetail(detail === r.schemeId ? null : r.schemeId)}
          >
            {r.schemeName}
          </button>
        ))}
      </div>
      {detail
        ? results
            .filter((r) => r.schemeId === detail)
            .map((r) => (
              <div key={r.schemeId} className="detail">
                {r.proposed.length > 0 ? (
                  <p className="warn">Pages this menu invents, which do not exist in the product: {r.proposed.join(', ')}</p>
                ) : null}
                {r.duplicated.length > 0 ? (
                  <p className="muted">
                    Listed in more than one place: {r.duplicated.map((d) => `${d.destinationId} (${d.placements}×)`).join(', ')}
                  </p>
                ) : null}
                {r.scenarios.map((s) => (
                  <div key={s.scenarioId} className="scenario-detail">
                    <h4>{s.persona}</h4>
                    <ol>
                      {s.tasks.map((t) => (
                        <li key={t.prompt}>
                          {t.cost === null ? (
                            <span className="warn">no route to this: {t.prompt}</span>
                          ) : (
                            <>
                              {t.prompt}
                              <div className="path">
                                {t.labels?.join('  ›  ')} &mdash; {t.clicks} {t.clicks === 1 ? 'click' : 'clicks'},
                                effort {num(t.cost)}
                                {(() => {
                                  const outcome = measured
                                    ?.find((m) => m.schemeId === r.schemeId)
                                    ?.tasks.find((x) => x.prompt === t.prompt);
                                  if (!outcome || outcome.medianMs === null) return null;
                                  return `, took ${secs(outcome.medianMs)} (${outcome.successes}/${outcome.attempts} found it)`;
                                })()}
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ))
        : null}
    </div>
  );
}
