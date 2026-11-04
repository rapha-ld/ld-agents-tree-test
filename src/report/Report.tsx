import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { destinations, scenarios, schemes, snapshotDate, weights } from '../data';
import { DEFAULT_PARAMS, scoreScheme, type CostParams } from '../score/cost';
import { clearLocalResults, exportLocalResults, localResultCount, persistenceMode } from '../session';
import { analyze, summarizeSessions, type ResultsFile, type SchemeOutcome } from './analyze';
import { Heatmap, Lines, RankedBars, Scatter } from './charts';
import { Participants } from './Participants';
import { readExcluded, writeExcluded } from './excluded';

const ASSUMPTION_SWEEP = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];

function num(v: number | null, digits = 2) {
  return v === null ? '—' : v.toFixed(digits);
}
function secs(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

/** A table row whose label carries its own one-line explanation. */
function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <tr>
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
  const [raw, setRaw] = useState<ResultsFile | null>(null);
  const [source, setSource] = useState<'this browser' | 'a file' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(() => readExcluded());

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

  // Anyone who just took the study should see it without exporting a file first.
  useEffect(() => {
    if (source === 'a file') return;
    try {
      const parsed = JSON.parse(exportLocalResults()) as ResultsFile;
      if (parsed.sessions.length > 0) {
        setRaw(parsed);
        setSource('this browser');
      }
    } catch {
      setRaw(null);
      setSource(null);
    }
  }, [source]);

  /** Everyone who started, excluded or not, so a run can always be put back. */
  const everyone = useMemo(() => (raw ? summarizeSessions(raw, scenarios) : []), [raw]);

  /** Analysis runs on the kept runs only. Excluding is not deleting. */
  const kept: ResultsFile | null = useMemo(() => {
    if (!raw) return null;
    if (excluded.size === 0) return raw;
    return {
      sessions: raw.sessions.filter((s) => !excluded.has(s.id)),
      events: raw.events.filter((e) => !excluded.has(e.session_id)),
    };
  }, [raw, excluded]);

  const measured: SchemeOutcome[] | null = useMemo(() => {
    if (!kept) return null;
    const outcomes = analyze(kept, schemes, scenarios);
    return outcomes.length > 0 ? outcomes : null;
  }, [kept]);

  const toggleExcluded = (sessionId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      writeExcluded(next);
      return next;
    });
  };

  const loadResults = async (file: File) => {
    setLoadError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ResultsFile;
      if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.events)) {
        throw new Error('Expected a file with a list of sessions and a list of events');
      }
      setRaw(parsed);
      setSource('a file');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  const download = () => {
    const blob = new Blob([exportLocalResults()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'agents-tree-test-results.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const nameFor = (id: string) => schemes.find((s) => s.id === id)?.name ?? id;
  const withN = (m: SchemeOutcome) => `${nameFor(m.schemeId)} · ${m.finishedSessions}`;

  // The leader on measured success, which is the axis the study actually tests.
  const measuredLeader = measured
    ? measured.reduce((a, b) => ((b.successRate ?? -1) > (a.successRate ?? -1) ? b : a))
    : null;

  return (
    <div className="report">
      <header>
        <h1>Menu comparison</h1>
        <p className="muted">
          {schemes.length} menus · {scenarios.length} scenarios · {totalTasks} tasks · {destinations.size} pages, taken
          from the product on {snapshotDate}
          {measured ? ` · ${everyone.length} people tested` : ''}
        </p>
      </header>

      {measured && measuredLeader ? (
        <>
          <Scatter
            title="Predicted effort against what people managed"
            hint="Up and to the left is better. Where the two disagree, trust the people."
            xLabel="predicted effort per task"
            yLabel="found it"
            formatX={(v) => v.toFixed(1)}
            formatY={(v) => `${Math.round(v * 100)}%`}
            points={measured
              .filter((m) => m.successRate !== null)
              .map((m) => ({
                key: m.schemeId,
                label: nameFor(m.schemeId),
                x: results.find((r) => r.schemeId === m.schemeId)?.meanTaskCost ?? 0,
                y: m.successRate ?? 0,
                leader: m.schemeId === measuredLeader.schemeId,
              }))}
          />

          <h2>What people did</h2>
          <p className="muted small">
            From {source}. The number after each menu is how many people finished it. Only finished runs count here.
          </p>

          <RankedBars
            title="Found the right place"
            hint="ended up somewhere we would accept as correct"
            data={measured.map((m) => ({ key: m.schemeId, label: withN(m), value: m.successRate }))}
            format={(v) => `${Math.round(v * 100)}%`}
            max={1}
          />

          <RankedBars
            title="Went straight there"
            hint="found it without going back to try somewhere else"
            data={measured.map((m) => ({ key: m.schemeId, label: withN(m), value: m.directnessRate }))}
            format={(v) => `${Math.round(v * 100)}%`}
            max={1}
          />

          <RankedBars
            title="First click was on the right track"
            hint="their very first move led somewhere the answer lives"
            data={measured.map((m) => ({
              key: m.schemeId,
              label: withN(m),
              // Null rather than zero when no click path could be read back, so a
              // broken metric stops looking like a finding.
              value: m.firstClickKnown === 0 ? null : m.firstClickRate,
            }))}
            format={(v) => `${Math.round(v * 100)}%`}
            max={1}
          />

          <RankedBars
            title="Gave up"
            hint="said they would not know where to look; lower is better"
            data={measured.map((m) => ({ key: m.schemeId, label: withN(m), value: m.giveupRate }))}
            format={(v) => `${Math.round(v * 100)}%`}
            max={1}
            lowerIsBetter
          />

          <RankedBars
            title="Typical time per task"
            hint="median, so one slow person cannot drag a menu; lower is better"
            data={measured.map((m) => ({ key: m.schemeId, label: withN(m), value: m.medianMs }))}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
            lowerIsBetter
          />

          <Heatmap
            title="Found the right place, by scenario"
            hint="Darker is better. Few people per cell, so read the pattern rather than a single number."
            rows={scenarios.map((s) => ({
              key: s.id,
              label: s.persona,
              note: `${s.tasks.length} tasks${s.weight !== 1 ? ` · weight ${s.weight}×` : ''}`,
            }))}
            columns={measured.map((m) => ({ key: m.schemeId, label: nameFor(m.schemeId) }))}
            cell={(rowKey, colKey) => {
              const outcome = measured
                .find((m) => m.schemeId === colKey)
                ?.scenarioOutcomes.find((o) => o.scenarioId === rowKey);
              if (!outcome || outcome.attempts === 0) return null;
              return outcome.successes / outcome.attempts;
            }}
            format={(v) => `${Math.round(v * 100)}%`}
          />

          <h2>Who took it</h2>
          <p className="muted small">
            Turn <strong>Counted</strong> off to leave someone out; every number above recomputes. Nothing is deleted,
            and the choice is remembered in this browser. To remove a run for good:{' '}
            <code>pnpm discard &lt;session-id&gt;</code>
          </p>
          <Participants
            sessions={everyone}
            schemes={schemes}
            excluded={excluded}
            onToggle={toggleExcluded}
            totalTasks={totalTasks}
          />
          {excluded.size > 0 ? (
            <p className="muted small">
              {excluded.size} {excluded.size === 1 ? 'person' : 'people'} left out.{' '}
              <button
                className="linklike"
                onClick={() => {
                  setExcluded(new Set());
                  writeExcluded(new Set());
                }}
              >
                Put everyone back
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted">
          Nobody has finished a test yet. <a href="#/study">Take one</a>, or load a results file below.
          {persistenceMode === 'local' ? ' Database not connected, so results are only in this browser.' : ''}
        </p>
      )}

      <h2>Predicted effort</h2>
      <p className="muted small">
        From the menu structure, no people involved. One point is roughly one click, plus fractions for reading a long
        menu and for anything that needs revealing. Lower is better.
      </p>

      <RankedBars
        title="Effort per task"
        hint="roughly, how many clicks' worth of work each task takes"
        data={results.map((r) => ({ key: r.schemeId, label: r.schemeName, value: r.meanTaskCost }))}
        format={(v) => v.toFixed(2)}
        lowerIsBetter
      />

      <Heatmap
        title="Effort by scenario"
        hint="Each scenario is one job someone came to do. Darker is worse."
        rows={scenarios.map((s) => ({
          key: s.id,
          label: s.persona,
          note: `${s.tasks.length} tasks${s.weight !== 1 ? ` · weight ${s.weight}×` : ''}`,
        }))}
        columns={results.map((r) => ({ key: r.schemeId, label: r.schemeName }))}
        cell={(rowKey, colKey) =>
          results.find((r) => r.schemeId === colKey)?.scenarios.find((s) => s.scenarioId === rowKey)?.total ?? null
        }
        format={(v) => v.toFixed(1)}
      />

      <Lines
        title="Does the winner hold up?"
        hint="A line that stays lowest is genuinely ahead. One that crosses is winning because of the setting."
        xLabel="how much reading a menu costs"
        xTicks={sweep.map((row) => (row.alpha === 0 ? 'none' : String(row.alpha)))}
        format={(v) => v.toFixed(0)}
        series={schemes.map((s) => ({
          key: s.id,
          label: s.name,
          leader: s.id === best.schemeId,
          points: sweep.map((row) => row.scores.find((r) => r.schemeId === s.id)?.scenarioWeightedTotal ?? 0),
        }))}
      />

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
          <span className="hint">
            Applies past {DEFAULT_PARAMS.overflowBudget} items in one list. Set it to zero and{' '}
            {schemes.find((s) => s.id === 'flat')?.name ?? 'the flat menu'} jumps to first place, which is the
            assumption doing the work.
          </span>
        </label>
      </section>

      <details>
        <summary>Structure checks — mostly identical across menus, which is the point</summary>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>&nbsp;</th>
                {results.map((r) => (
                  <th key={r.schemeId}>{r.schemeName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Average clicks per task" hint="just the clicks, ignoring how hard each one is">
                {results.map((r) => (
                  <td key={r.schemeId}>{num(r.meanTaskClicks, 1)}</td>
                ))}
              </Row>
              <Row label="Overall score" hint="all scenarios added up, important ones counted more; compare columns only">
                {results.map((r) => (
                  <td key={r.schemeId}>{num(r.scenarioWeightedTotal, 1)}</td>
                ))}
              </Row>
              <Row label="Average effort for any page" hint="every page the menu reaches, not just the tested ones">
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
              <Row label="Pages not in the menu" hint="normal: most pages are reached by opening an item, not the menu">
                {results.map((r) => (
                  <td key={r.schemeId}>{r.unreachable.length}</td>
                ))}
              </Row>
              <Row label="Pages that do not exist yet" hint="invented by a proposed menu; nothing to compare against">
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
      </details>

      <details>
        <summary>What the effort score does and does not tell you</summary>
        <p className="muted small">
          It measures getting there, not finding it. It assumes you already know which item to click, and says nothing
          about whether the label would lead you to the right place. That is what the study measures, and why those
          charts sit at the top of this page.
        </p>
        <p className="muted small">
          A single long list can look deceptively good. Grouping means reading twice, once to pick the group and once
          inside it, plus a click. So one long list of everything can beat a tidy set of groups, which is not how people
          behave once a list runs off the screen. The off-screen penalty is what stops that, and the slider shows how
          much work it is doing.
        </p>
      </details>

      <details>
        <summary>How someone would get there — the cheapest route to every task</summary>
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
                      Pages this menu invents, which do not exist in the product: {r.proposed.join(', ')}
                    </p>
                  ) : null}
                  {r.duplicated.length > 0 ? (
                    <p className="muted">
                      Listed in more than one place:{' '}
                      {r.duplicated.map((d) => `${d.destinationId} (${d.placements}×)`).join(', ')}
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
                                      ?.tasks.find((x) => x.scenarioId === s.scenarioId && x.prompt === t.prompt);
                                    if (!outcome || outcome.attempts === 0) return null;
                                    return (
                                      <span className="muted">
                                        {' '}
                                        · {outcome.successes}/{outcome.attempts} found it, {secs(outcome.medianMs)}
                                      </span>
                                    );
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
      </details>

      <h2>Results data</h2>
      <div className="actions">
        <button onClick={download} disabled={local.sessions === 0}>
          Download from this browser
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
            setRaw(null);
            setSource(null);
          }}
          disabled={local.sessions === 0}
        >
          Clear this browser
        </button>
      </div>
      <p className="muted small">
        <code>pnpm pull</code> writes every run from the database to <code>nav-lab-results.json</code>. Load that file
        here.
      </p>
      {loadError ? <p className="warn">Could not read that file: {loadError}</p> : null}
    </div>
  );
}
