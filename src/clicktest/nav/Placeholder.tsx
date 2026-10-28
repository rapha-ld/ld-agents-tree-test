// Lo-fi page content, shaped roughly like each page's real content: a list of
// flags, a dense table of logs, a dashboard of tiles and charts, and so on.
// Still only bars and boxes, so the page reads as a stand-in and the nav stays
// the subject. Widths come from a generator seeded with the page id, so each
// page has its own look but is the same every time you come back to it.

import type { CSSProperties } from 'react';

import styles from './Placeholder.module.css';

type Shape = 'list' | 'table' | 'dashboard' | 'pipeline' | 'graph' | 'split' | 'cards' | 'detail';

const SHAPES: Record<string, Shape> = {
  home: 'dashboard',
  dashboards: 'dashboard',
  insights: 'dashboard',
  optimization: 'dashboard',
  logs: 'table',
  traces: 'table',
  errors: 'table',
  sessions: 'table',
  contexts: 'table',
  debugger: 'table',
  releases: 'pipeline',
  graphs: 'graph',
  playgrounds: 'split',
  evaluations: 'split',
  library: 'cards',
};

/** Column weights for the table pages: a narrow timestamp, a long message, and so on. */
const COLUMNS: Record<string, number[]> = {
  logs: [2, 1, 8, 2],
  traces: [3, 2, 4, 1, 2],
  errors: [6, 2, 1, 2],
  sessions: [3, 2, 2, 1, 2],
  contexts: [3, 3, 2, 2],
  debugger: [2, 3, 5, 2],
};

/** A small seeded generator (mulberry32), so a page's widths don't change between visits. */
function seeded(id: string) {
  let a = [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof seeded>;

/** A bar between `min` and `max` percent of its container's width. */
function Line({ rand, min = 30, max = 80, strong }: { rand: Rand; min?: number; max?: number; strong?: boolean }) {
  const width = `${Math.round(min + rand() * (max - min))}%`;
  return (
    <span className={strong ? `${styles.line} ${styles.strong}` : styles.line} style={{ '--w': width } as CSSProperties} />
  );
}

export function Placeholder({ page }: { page: string }) {
  const rand = seeded(page);
  const shape = SHAPES[page] ?? 'list';
  return (
    <div className={styles.placeholder} data-shape={shape} aria-hidden>
      {shape === 'list' && <ListShape rand={rand} />}
      {shape === 'table' && <TableShape rand={rand} columns={COLUMNS[page] ?? [3, 2, 2, 1]} />}
      {shape === 'dashboard' && <DashboardShape rand={rand} />}
      {shape === 'pipeline' && <PipelineShape rand={rand} />}
      {shape === 'graph' && <GraphShape rand={rand} />}
      {shape === 'split' && <SplitShape rand={rand} />}
      {shape === 'cards' && <CardsShape rand={rand} />}
      {shape === 'detail' && <DetailShape rand={rand} />}
    </div>
  );
}

/** Search and a couple of filter chips, as list and table pages have above their content. */
function Toolbar() {
  return (
    <div className={styles.toolbar}>
      <span className={styles.search} />
      <span className={styles.chip} />
      <span className={styles.chip} />
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// ── Shapes ────────────────────────────────────────────────────────────────

/** Flags, segments, metrics…: a title and key per row, a status pill on the right. */
function ListShape({ rand }: { rand: Rand }) {
  const rows = 6 + Math.floor(rand() * 3);
  return (
    <>
      <Toolbar />
      <div className={styles.list}>
        {range(rows).map((i) => (
          <div key={i} className={styles.listRow}>
            <div className={styles.stack}>
              <Line rand={rand} min={30} max={70} strong />
              <Line rand={rand} min={18} max={45} />
            </div>
            <span className={styles.pill} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Logs, traces, sessions…: a header and many dense rows, in the page's own columns. */
function TableShape({ rand, columns }: { rand: Rand; columns: number[] }) {
  const grid = { '--columns': columns.map((c) => `${c}fr`).join(' ') } as CSSProperties;
  return (
    <>
      <Toolbar />
      <div className={styles.table}>
        <div className={`${styles.tableRow} ${styles.tableHead}`} style={grid}>
          {columns.map((_, c) => (
            <Line key={c} rand={rand} min={35} max={60} />
          ))}
        </div>
        {range(14).map((r) => (
          <div key={r} className={styles.tableRow} style={grid}>
            {columns.map((_, c) => (
              <Line key={c} rand={rand} min={c === 0 ? 50 : 30} max={c === 0 ? 70 : 90} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** A bar chart: bars of seeded heights along a baseline. */
function Bars({ rand, count }: { rand: Rand; count: number }) {
  return (
    <div className={styles.bars}>
      {range(count).map((i) => (
        <span
          key={i}
          className={styles.bar}
          style={{ '--h': `${Math.round(20 + rand() * 80)}%` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Home, dashboards…: a row of stat tiles, then charts, then a short list. */
function DashboardShape({ rand }: { rand: Rand }) {
  return (
    <div className={styles.dashboard}>
      <div className={styles.tiles}>
        {range(4).map((i) => (
          <div key={i} className={styles.card}>
            <Line rand={rand} min={40} max={70} />
            <span className={styles.figure} />
          </div>
        ))}
      </div>
      <div className={styles.charts}>
        <div className={styles.card}>
          <Line rand={rand} min={20} max={35} strong />
          <Bars rand={rand} count={24} />
        </div>
        <div className={styles.card}>
          <Line rand={rand} min={30} max={55} strong />
          <Bars rand={rand} count={8} />
        </div>
      </div>
      <div className={styles.card}>
        <Line rand={rand} min={15} max={30} strong />
        {range(4).map((i) => (
          <div key={i} className={styles.cardRow}>
            <Line rand={rand} min={30} max={60} />
            <Line rand={rand} min={10} max={20} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Releases: phases as columns, each holding a few flag cards. */
function PipelineShape({ rand }: { rand: Rand }) {
  return (
    <>
      <Toolbar />
      <div className={styles.pipeline}>
        {range(4).map((p) => (
          <div key={p} className={styles.phase}>
            <Line rand={rand} min={40} max={70} strong />
            {range(1 + Math.floor(rand() * 3)).map((i) => (
              <div key={i} className={styles.card}>
                <Line rand={rand} min={50} max={90} />
                <Line rand={rand} min={25} max={50} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Agent graphs: rows of nodes joined by connectors. */
function GraphShape({ rand }: { rand: Rand }) {
  return (
    <div className={styles.canvas}>
      {range(3).map((r) => (
        <div key={r} className={styles.graphRow}>
          {range(2 + Math.floor(rand() * 2)).map((n) => (
            <div key={n} className={styles.nodeWrap}>
              {n > 0 && <span className={styles.connector} />}
              <div className={styles.node}>
                <span className={styles.nodeIcon} />
                <Line rand={rand} min={45} max={85} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Playgrounds, evaluations: a list on the left, an editor and its output on the right. */
function SplitShape({ rand }: { rand: Rand }) {
  return (
    <div className={styles.split}>
      <div className={styles.splitList}>
        {range(7).map((i) => (
          <div key={i} className={i === 0 ? `${styles.splitItem} ${styles.selected}` : styles.splitItem}>
            <Line rand={rand} min={45} max={85} />
          </div>
        ))}
      </div>
      <div className={styles.splitMain}>
        <div className={`${styles.card} ${styles.editor}`}>
          {range(9).map((i) => (
            <div key={i} className={styles.codeLine} style={{ '--indent': `${Math.floor(rand() * 3)}` } as CSSProperties}>
              <Line rand={rand} min={20} max={75} />
            </div>
          ))}
        </div>
        <div className={styles.card}>
          <Line rand={rand} min={15} max={30} strong />
          <Line rand={rand} min={60} max={95} />
          <Line rand={rand} min={40} max={80} />
        </div>
      </div>
    </div>
  );
}

/** Library: a grid of cards, each with an icon, a name, a description, and a tag. */
function CardsShape({ rand }: { rand: Rand }) {
  return (
    <>
      <Toolbar />
      <div className={styles.cards}>
        {range(9).map((i) => (
          <div key={i} className={styles.card}>
            <span className={styles.cardIcon} />
            <Line rand={rand} min={45} max={80} strong />
            <Line rand={rand} min={70} max={95} />
            <Line rand={rand} min={40} max={70} />
            <span className={styles.pill} />
          </div>
        ))}
      </div>
    </>
  );
}

/** A single flag or segment: a summary, tabs, then its rules. */
function DetailShape({ rand }: { rand: Rand }) {
  return (
    <div className={styles.detail}>
      <div className={styles.summary}>
        <Line rand={rand} min={60} max={90} />
        <Line rand={rand} min={40} max={70} />
        <div className={styles.pills}>
          <span className={styles.pill} />
          <span className={styles.pill} />
          <span className={styles.pill} />
        </div>
      </div>
      <div className={styles.tabs}>
        {range(4).map((i) => (
          <span key={i} className={i === 0 ? `${styles.tab} ${styles.selectedTab}` : styles.tab} />
        ))}
      </div>
      {range(3).map((i) => (
        <div key={i} className={styles.card}>
          <Line rand={rand} min={15} max={30} strong />
          <div className={styles.cardRow}>
            <span className={styles.chip} />
            <Line rand={rand} min={30} max={60} />
          </div>
          <div className={styles.cardRow}>
            <span className={styles.chip} />
            <Line rand={rand} min={20} max={50} />
          </div>
        </div>
      ))}
    </div>
  );
}
