import { useMemo, useState } from 'react';
import { destinations, scenarios, schemes, snapshotDate, weights } from '../data';
import { DEFAULT_PARAMS, scoreScheme, type CostParams } from '../score/cost';
import { clearLocalResults, exportLocalResults, localResultCount, persistenceMode } from '../session';
import { analyze, type ResultsFile, type SchemeOutcome } from './analyze';

const ALPHA_SWEEP = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];

function pct(v: number | null) {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}
function num(v: number | null, digits = 2) {
  return v === null ? '—' : v.toFixed(digits);
}
function secs(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

export function Report() {
  const [alpha, setAlpha] = useState(DEFAULT_PARAMS.alpha);
  const [overflowPenalty, setOverflowPenalty] = useState(DEFAULT_PARAMS.overflowPenalty);
  const [detail, setDetail] = useState<string | null>(null);
  const [measured, setMeasured] = useState<SchemeOutcome[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const params: CostParams = useMemo(() => ({ ...DEFAULT_PARAMS, alpha, overflowPenalty }), [alpha, overflowPenalty]);

  const results = useMemo(
    () => schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, params)),
    [params],
  );

  const sweep = useMemo(
    () =>
      ALPHA_SWEEP.map((a) => ({
        alpha: a,
        scores: schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, { ...params, alpha: a })),
      })),
    [params],
  );

  const best = results.reduce((a, b) =>
    (b.scenarioWeightedTotal ?? Infinity) < (a.scenarioWeightedTotal ?? Infinity) ? b : a,
  );

  const local = localResultCount();

  const loadResults = async (file: File) => {
    setLoadError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ResultsFile;
      if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.events)) {
        throw new Error('Expected an object with `sessions` and `events` arrays');
      }
      setMeasured(analyze(parsed, schemes, scenarios));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setMeasured(null);
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
        <h1>Scheme comparison</h1>
        <p className="muted">
          {destinations.size} destinations (snapshot {snapshotDate}) · {schemes.length} schemes · {scenarios.length}{' '}
          scenarios, {scenarios.reduce((s, x) => s + x.tasks.length, 0)} tasks
        </p>
      </header>

      <section className="callout">
        <h3>Read the predicted numbers with this in mind</h3>
        <p>
          The cost model measures <strong>structural effort to reach a destination once you know where it is</strong>.
          It does not model whether a label tells you where to look. That is what the study measures, and it is the
          larger part of whether a navigation scheme works.
        </p>
        <p>
          A consequence worth knowing: under a pure logarithmic scan term, a completely flat menu always wins, because
          splitting one scan into two stages costs more total scanning than one large scan
          (log&#8322;9 + log&#8322;7 &gt; log&#8322;36) while adding a traversal step. Hick's law assumes every choice is
          visible at once, which stops being true past the fold. The overflow penalty below corrects for that. Set it to
          zero to see the uncorrected model, and watch <code>flat</code> take the lead.
        </p>
      </section>

      <section className="controls">
        <label>
          Scan weight &alpha;: <strong>{alpha.toFixed(2)}</strong>
          <input type="range" min={0} max={2} step={0.05} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
        </label>
        <label>
          Overflow penalty per item past {DEFAULT_PARAMS.overflowBudget}: <strong>{overflowPenalty.toFixed(2)}</strong>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={overflowPenalty}
            onChange={(e) => setOverflowPenalty(Number(e.target.value))}
          />
        </label>
      </section>

      <h2>Predicted</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>metric</th>
              {results.map((r) => (
                <th key={r.schemeId} className={r.schemeId === best.schemeId ? 'best' : undefined}>
                  {r.schemeName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="headline">
              <th>scenario cost (weighted)</th>
              {results.map((r) => (
                <td key={r.schemeId} className={r.schemeId === best.schemeId ? 'best' : undefined}>
                  {num(r.scenarioWeightedTotal, 1)}
                </td>
              ))}
            </tr>
            <tr>
              <th>mean cost per destination</th>
              {results.map((r) => (
                <td key={r.schemeId}>{num(r.meanCost)}</td>
              ))}
            </tr>
            <tr>
              <th>traffic-weighted mean</th>
              {results.map((r) => (
                <td key={r.schemeId}>{num(r.weightedMeanCost)}</td>
              ))}
            </tr>
            <tr>
              <th>worst case</th>
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
            </tr>
            <tr>
              <th>destinations placed</th>
              {results.map((r) => (
                <td key={r.schemeId}>{r.boundDestinations}</td>
              ))}
            </tr>
            <tr>
              <th>duplicated</th>
              {results.map((r) => (
                <td key={r.schemeId}>{r.duplicated.length}</td>
              ))}
            </tr>
            <tr>
              <th>unreachable from nav</th>
              {results.map((r) => (
                <td key={r.schemeId}>{r.unreachable.length}</td>
              ))}
            </tr>
            <tr>
              <th>proposed, not in snapshot</th>
              {results.map((r) => (
                <td key={r.schemeId}>{r.proposed.length}</td>
              ))}
            </tr>
            <tr>
              <th>top-level items</th>
              {results.map((r) => (
                <td key={r.schemeId}>{r.breadth[0]?.max ?? 0}</td>
              ))}
            </tr>
            <tr>
              <th>widest level</th>
              {results.map((r) => (
                <td key={r.schemeId}>{Math.max(...r.breadth.map((b) => b.max))}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Scenario cost</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>scenario</th>
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
                    {scenario.id} <span className="muted small">w={scenario.weight}</span>
                  </th>
                  {cells.map((c, i) => (
                    <td key={results[i].schemeId} className={c?.total !== null && c?.total === min ? 'best' : undefined}>
                      {c?.total === null ? (
                        <span className="warn">unreachable ({c.unreachableTasks.length})</span>
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

      <h2>Ranking stability across &alpha;</h2>
      <p className="muted">
        A winner that survives the whole sweep is a real result. A winner that only leads at one &alpha; is an artefact
        of the parameter.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>&alpha;</th>
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
                  <th>{row.alpha}</th>
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

      <h2>Measured</h2>
      <p className="muted">
        Persistence is currently <strong>{persistenceMode}</strong>.{' '}
        {persistenceMode === 'local'
          ? `This browser holds ${local.sessions} session(s) and ${local.events} event(s).`
          : 'Sessions insert straight into Supabase; export from there and load the JSON here.'}
      </p>
      <div className="actions">
        <button onClick={download} disabled={local.sessions === 0}>
          Download local results
        </button>
        <label className="filebtn">
          Load results JSON
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
          }}
          disabled={local.sessions === 0}
        >
          Clear local results
        </button>
      </div>
      {loadError ? <p className="warn">Could not read that file: {loadError}</p> : null}

      {measured && measured.length > 0 ? (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>metric</th>
                {measured.map((m) => (
                  <th key={m.schemeId}>{schemes.find((s) => s.id === m.schemeId)?.name ?? m.schemeId}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>participants</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{m.sessions}</td>
                ))}
              </tr>
              <tr>
                <th>task attempts</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{m.attempts}</td>
                ))}
              </tr>
              <tr className="headline">
                <th>success rate</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{pct(m.successRate)}</td>
                ))}
              </tr>
              <tr className="headline">
                <th>directness</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{pct(m.directnessRate)}</td>
                ))}
              </tr>
              <tr>
                <th>first click correct</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{pct(m.firstClickRate)}</td>
                ))}
              </tr>
              <tr>
                <th>gave up</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{pct(m.giveupRate)}</td>
                ))}
              </tr>
              <tr>
                <th>median time per task</th>
                {measured.map((m) => (
                  <td key={m.schemeId}>{secs(m.medianMs)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          No measured results loaded. Directness is the metric to compare against predicted cost; regressing one on the
          other is what calibrates &alpha; and the reveal penalties.
        </p>
      )}

      <h2>Shortest paths</h2>
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
                  <p className="warn">
                    Proposed destinations not in the snapshot: {r.proposed.join(', ')}. These carry no weight until one
                    is assigned.
                  </p>
                ) : null}
                {r.duplicated.length > 0 ? (
                  <p className="muted">
                    Duplicated: {r.duplicated.map((d) => `${d.destinationId} (${d.placements}x)`).join(', ')}
                  </p>
                ) : null}
                {r.scenarios.map((s) => (
                  <div key={s.scenarioId} className="scenario-detail">
                    <h4>
                      {s.scenarioId} <span className="muted small">{s.persona}</span>
                    </h4>
                    <ol>
                      {s.tasks.map((t) => (
                        <li key={t.prompt}>
                          {t.cost === null ? (
                            <span className="warn">unreachable: {t.prompt}</span>
                          ) : (
                            <>
                              <strong>{num(t.cost)}</strong>{' '}
                              <span className="muted small">
                                {t.clicks} {t.clicks === 1 ? 'click' : 'clicks'}
                              </span>{' '}
                              {t.prompt}
                              <div className="path">{t.labels?.join('  ›  ')}</div>
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
