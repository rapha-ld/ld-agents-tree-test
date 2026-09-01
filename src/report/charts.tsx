import { useId, useState, type ReactNode } from 'react';

/**
 * Hand-rolled SVG charts. No chart library, because four fixed forms is less
 * code than configuring a general one, and it keeps the bundle honest.
 *
 * Encoding choices worth not re-litigating:
 *
 * - Bars over menus use ONE hue. Menus are nominal, so shading them by value
 *   would double-encode bar length as colour and burn the only free channel on
 *   information the length already carries. Rank comes from sorting.
 *
 * - The scatter and the line chart use emphasis: the leader in the accent, the
 *   rest in a recessive grey, everything direct-labelled. Five categorical hues
 *   cannot clear colourblind separation on an all-pairs form like a scatter, and
 *   the label carries identity anyway, so hue is spent on "which one is ahead".
 *
 * - The heatmap is the only sequential encoding here: one hue, light to dark,
 *   because a grid of magnitudes is exactly what sequential is for.
 *
 * Every chart pairs with a table behind "Show numbers", so nothing is reachable
 * only by looking at a picture.
 */

/** Sequential blue, light to dark. Only for magnitude, never for identity. */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export type Datum = { key: string; label: string; value: number | null; note?: string };

/**
 * Round tick values to something a person would choose. An axis reading
 * 0 / 22 / 45 / 67 / 90 makes the reader do arithmetic the chart should have
 * done for them.
 */
function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min, max];
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Nudge the bound so floating point cannot drop the last tick.
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function Figure({
  title,
  hint,
  children,
  table,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  table: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="viz">
      <figcaption>
        <span className="viz-title">{title}</span>
        {hint ? <span className="viz-hint">{hint}</span> : null}
        <button className="viz-toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide numbers' : 'Show numbers'}
        </button>
      </figcaption>
      {children}
      {showTable ? <div className="scroll">{table}</div> : null}
    </figure>
  );
}

function Tip({ text }: { text: string }) {
  // A native title is the cheap accessible tooltip. Hover highlighting on the
  // mark itself carries the rest, and the table behind the toggle is the
  // guaranteed path to a value.
  return <title>{text}</title>;
}

/**
 * Horizontal bars, sorted, one hue. `format` renders the tip label so a rate and
 * a duration can share the component.
 */
export function RankedBars({
  title,
  hint,
  data,
  format,
  max,
  lowerIsBetter = false,
}: {
  title: string;
  hint?: string;
  data: Datum[];
  format: (v: number) => string;
  max?: number;
  lowerIsBetter?: boolean;
}) {
  const present = data.filter((d): d is Datum & { value: number } => d.value !== null);
  const sorted = [...present].sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  const missing = data.filter((d) => d.value === null);

  const ceiling = max ?? (Math.max(...sorted.map((d) => d.value), 0) * 1.15 || 1);
  const rowH = 30;
  const barH = 18; // Under the 24px cap, so the band keeps some air.
  const labelW = 190;
  const valueW = 62;
  const width = 640;
  const plotW = width - labelW - valueW;
  const height = sorted.length * rowH + 8;

  return (
    <Figure
      title={title}
      hint={hint}
      table={
        <table>
          <thead>
            <tr>
              <th>Menu</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.key}>
                <th>{d.label}</th>
                <td>{format(d.value)}</td>
              </tr>
            ))}
            {missing.map((d) => (
              <tr key={d.key}>
                <th>{d.label}</th>
                <td className="muted">no data</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={title}>
        {sorted.map((d, i) => {
          const y = i * rowH;
          const w = Math.max((d.value / ceiling) * plotW, 2);
          const leader = i === 0;
          return (
            <g key={d.key}>
              <Tip text={`${d.label}: ${format(d.value)}${d.note ? ` (${d.note})` : ''}`} />
              <text x={labelW - 10} y={y + barH / 2 + 1} className="viz-cat" textAnchor="end" dominantBaseline="middle">
                {d.label}
              </text>
              <rect
                x={labelW}
                y={y}
                width={w}
                height={barH}
                rx={4}
                fill={leader ? 'var(--viz-accent)' : 'var(--viz-bar)'}
              />
              {/* Square off the baseline end so the bar grows from the axis. */}
              <rect x={labelW} y={y} width={Math.min(4, w)} height={barH} fill={leader ? 'var(--viz-accent)' : 'var(--viz-bar)'} />
              <text x={labelW + w + 8} y={y + barH / 2 + 1} className="viz-val" dominantBaseline="middle">
                {format(d.value)}
              </text>
            </g>
          );
        })}
        <line x1={labelW} y1={0} x2={labelW} y2={sorted.length * rowH - (rowH - barH)} className="viz-axis" />
      </svg>
      {missing.length > 0 ? (
        <p className="viz-nodata">No data for {missing.map((d) => d.label).join(', ')}.</p>
      ) : null}
    </Figure>
  );
}

export type Point = { key: string; label: string; x: number; y: number; leader?: boolean };

/**
 * Two measures against each other. Emphasis rather than five hues: the point
 * that leads both axes gets the accent, everything else recedes, and every
 * point is labelled so identity never depends on colour.
 */
export function Scatter({
  title,
  hint,
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
}: {
  title: string;
  hint?: string;
  points: Point[];
  xLabel: string;
  yLabel: string;
  formatX: (v: number) => string;
  formatY: (v: number) => string;
}) {
  const width = 640;
  const height = 300;
  const pad = { top: 14, right: 120, bottom: 42, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs), 4);
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const xMin = xTicks[0];
  const xMax = xTicks[xTicks.length - 1];
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];

  const sx = (v: number) => pad.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  return (
    <Figure
      title={title}
      hint={hint}
      table={
        <table>
          <thead>
            <tr>
              <th>Menu</th>
              <th>{xLabel}</th>
              <th>{yLabel}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <th>{p.label}</th>
                <td>{formatX(p.x)}</td>
                <td>{formatY(p.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={title}>
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={pad.left} y1={sy(v)} x2={pad.left + plotW} y2={sy(v)} className="viz-grid" />
            <text x={pad.left - 8} y={sy(v)} className="viz-tick" textAnchor="end" dominantBaseline="middle">
              {formatY(v)}
            </text>
          </g>
        ))}
        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} className="viz-axis" />
        {xTicks.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={pad.top + plotH + 15} className="viz-tick" textAnchor="middle">
            {formatX(v)}
          </text>
        ))}

        {points.map((p) => (
          <g key={p.key}>
            <Tip text={`${p.label}: ${formatY(p.y)} ${yLabel}, ${formatX(p.x)} ${xLabel}`} />
            {/* 2px surface ring so overlapping points stay legible. */}
            <circle cx={sx(p.x)} cy={sy(p.y)} r={7} fill="var(--panel)" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill={p.leader ? 'var(--viz-accent)' : 'var(--viz-bar)'} />
            <text x={sx(p.x) + 11} y={sy(p.y)} className="viz-cat" dominantBaseline="middle">
              {p.label}
            </text>
          </g>
        ))}

        <text x={pad.left + plotW / 2} y={height - 6} className="viz-tick" textAnchor="middle">
          {xLabel}
        </text>
      </svg>
    </Figure>
  );
}

/**
 * A grid of magnitudes. Sequential, one hue, with a scale legend and the value
 * in every cell, because a colour alone is not a number.
 */
export function Heatmap({
  title,
  hint,
  rows,
  columns,
  cell,
  format,
  lowerIsBetter = false,
}: {
  title: string;
  hint?: string;
  rows: { key: string; label: string; note?: string }[];
  columns: { key: string; label: string }[];
  cell: (rowKey: string, colKey: string) => number | null;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const values: number[] = [];
  for (const r of rows) for (const c of columns) {
    const v = cell(r.key, c.key);
    if (v !== null) values.push(v);
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  const shade = (v: number) => {
    const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    // Darker always means "more of the thing being measured". When lower is
    // better the caption says so; the ramp direction stays constant so the eye
    // learns one rule.
    const idx = Math.round((lowerIsBetter ? 1 - t : t) * (RAMP.length - 1));
    return RAMP[idx];
  };
  const inkFor = (v: number) => {
    const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    const idx = Math.round((lowerIsBetter ? 1 - t : t) * (RAMP.length - 1));
    return idx >= 4 ? '#ffffff' : 'var(--ink)';
  };

  return (
    <Figure
      title={title}
      hint={hint}
      table={
        <table>
          <thead>
            <tr>
              <th>&nbsp;</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th>{r.label}</th>
                {columns.map((c) => {
                  const v = cell(r.key, c.key);
                  return <td key={c.key}>{v === null ? '—' : format(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="heatmap-wrap">
        <table className="heatmap">
          <thead>
            <tr>
              <th />
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">
                  {r.label}
                  {r.note ? <span className="viz-rownote">{r.note}</span> : null}
                </th>
                {columns.map((c) => {
                  const v = cell(r.key, c.key);
                  if (v === null) return <td key={c.key} className="cell empty">—</td>;
                  return (
                    <td
                      key={c.key}
                      className="cell"
                      style={{ background: shade(v), color: inkFor(v) }}
                      title={`${r.label} · ${c.label}: ${format(v)}`}
                    >
                      {format(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-scale" aria-hidden="true">
        <span>{lowerIsBetter ? 'better' : format(lo)}</span>
        {RAMP.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
        <span>{lowerIsBetter ? 'worse' : format(hi)}</span>
      </div>
    </Figure>
  );
}

export type Series = { key: string; label: string; points: number[]; leader?: boolean };

/**
 * Lines over an ordered setting. Emphasis again: the leader at the default
 * setting is the accent, so "does it stay ahead" is a question about one line
 * crossing others rather than about telling five hues apart.
 */
export function Lines({
  title,
  hint,
  xTicks,
  series,
  xLabel,
  format,
}: {
  title: string;
  hint?: string;
  xTicks: string[];
  series: Series[];
  xLabel: string;
  format: (v: number) => string;
}) {
  const clip = useId();
  const width = 640;
  const height = 290;
  const pad = { top: 14, right: 148, bottom: 44, left: 60 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.points);
  const ticks = niceTicks(0, Math.max(...all), 3);
  const lo = 0;
  const hi = ticks[ticks.length - 1] || 1;
  const sx = (i: number) => pad.left + (i / Math.max(xTicks.length - 1, 1)) * plotW;
  const sy = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  return (
    <Figure
      title={title}
      hint={hint}
      table={
        <table>
          <thead>
            <tr>
              <th>{xLabel}</th>
              {series.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {xTicks.map((tick, i) => (
              <tr key={tick}>
                <th>{tick}</th>
                {series.map((s) => (
                  <td key={s.key}>{format(s.points[i])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={title}>
        <clipPath id={clip}>
          <rect x={pad.left} y={pad.top - 4} width={plotW} height={plotH + 8} />
        </clipPath>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.left} y1={sy(v)} x2={pad.left + plotW} y2={sy(v)} className="viz-grid" />
            <text x={pad.left - 8} y={sy(v)} className="viz-tick" textAnchor="end" dominantBaseline="middle">
              {format(v)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clip})`}>
          {series.map((s) => (
            <g key={s.key}>
              <Tip text={s.label} />
              <path
                d={s.points.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i)},${sy(v)}`).join(' ')}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                stroke={s.leader ? 'var(--viz-accent)' : 'var(--viz-bar)'}
              />
            </g>
          ))}
        </g>

        {series.map((s) => (
          <text
            key={s.key}
            x={pad.left + plotW + 8}
            y={sy(s.points[s.points.length - 1])}
            className={s.leader ? 'viz-cat leader' : 'viz-cat'}
            dominantBaseline="middle"
          >
            {s.label}
          </text>
        ))}

        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} className="viz-axis" />
        {xTicks.map((tick, i) => (
          <text key={tick} x={sx(i)} y={pad.top + plotH + 16} className="viz-tick" textAnchor="middle">
            {tick}
          </text>
        ))}
        <text x={pad.left + plotW / 2} y={height - 6} className="viz-tick" textAnchor="middle">
          {xLabel}
        </text>
      </svg>
    </Figure>
  );
}
