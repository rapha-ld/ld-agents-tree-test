// A cut-down port of the prototype playground's LayoutHeader (itself ported from
// gonfalon packages/chrome/src/internal/LayoutHeader). The click test only needs
// the page title on the left and the page's actions on the right, so the
// breadcrumbs, sidebar toggle and dogfood flag are gone.

import type { ReactNode } from 'react';

import styles from './LayoutHeader.module.css';

export function LayoutHeader({ children, title }: { children?: ReactNode; title?: string }) {
  return (
    <div className={styles.header}>
      <div className={`${styles.location} ${styles.newNavLocation}`}>
        <h1 className={styles.title}>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function LayoutHeaderActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
