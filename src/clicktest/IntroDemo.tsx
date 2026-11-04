// A looping wireframe of one task, for the intro screen: the pointer opens a
// section, picks a page, and it presses
// "Confirm". The view zooms in on the nav, out, then in on the task card.
// Pure SVG and CSS (IntroDemo.module.css), so there's no video to load.

import styles from './IntroDemo.module.css';

export function IntroDemo() {
  return (
    <svg className={styles.demo} viewBox="0 0 360 240" role="img" aria-label="A pointer opens a section, selects a page, then selects Confirm.">
      <g className={styles.zoom}>
        <rect x="0.5" y="0.5" width="359" height="239" rx="10" className={styles.frame} />

        {/* Nav */}
        <rect x="0.5" y="0.5" width="90" height="239" rx="10" className={styles.nav} />
        <rect x="10" y="12" width="14" height="8" rx="2" className={styles.ink} />
        <rect x="10" y="30" width="70" height="10" rx="3" className={styles.field} />
        <Section y={56} />
        <g className={styles.target}>
          <Section y={72} />
        </g>
        <g className={styles.leaves}>
          <rect x="22" y="82" width="34" height="5" rx="2" className={styles.muted} />
          <rect x="18" y="91" width="64" height="9" rx="3" className={styles.leafHit} />
          <rect x="22" y="93" width="40" height="5" rx="2" className={styles.muted} />
        </g>
        <g className={styles.below}>
          <Section y={88} />
          <Section y={104} />
          <Section y={120} />
        </g>

        {/* Page */}
        <rect x="104" y="12" width="70" height="8" rx="2" className={styles.ink} />
        <rect x="300" y="10" width="46" height="12" rx="3" className={styles.primary} />
        {[32, 54, 76, 98, 120, 142].map((y) => (
          <rect key={y} x="104" y={y} width="244" height="16" rx="3" className={styles.row} />
        ))}

        {/* Task card */}
        <rect x="230" y="160" width="120" height="68" rx="6" className={styles.card} />
        <rect x="238" y="168" width="30" height="4" rx="2" className={styles.muted} />
        <rect x="238" y="178" width="100" height="5" rx="2" className={styles.ink} />
        <rect x="238" y="187" width="76" height="5" rx="2" className={styles.ink} />
        <g className={styles.found}>
          <rect x="238" y="208" width="40" height="12" rx="3" className={styles.primary} />
          <text x="258" y="216.3" textAnchor="middle" className={styles.buttonText}>
            Confirm
          </text>
        </g>
        <rect x="284" y="211" width="30" height="5" rx="2" className={styles.muted} />

        {/* Clicks */}
        <circle cx="40" cy="74" r="7" className={`${styles.ripple} ${styles.ripple1}`} />
        <circle cx="46" cy="95" r="7" className={`${styles.ripple} ${styles.ripple2}`} />
        <circle cx="258" cy="214" r="7" className={`${styles.ripple} ${styles.ripple3}`} />

        {/* Pointer */}
        <g className={styles.pointer}>
          <path d="M0 0 L0 13 L3.5 9.8 L6 15 L8.2 14 L5.8 8.9 L10.5 8.9 Z" className={styles.cursor} />
        </g>
      </g>
    </svg>
  );
}

function Section({ y }: { y: number }) {
  return (
    <>
      <rect x="12" y={y} width="6" height="6" rx="1.5" className={styles.muted} />
      <rect x="22" y={y + 0.5} width="44" height="5" rx="2" className={styles.ink} />
    </>
  );
}
