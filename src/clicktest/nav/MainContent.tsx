// Stand-in page content so the nav sits next to something real: gonfalon's
// LayoutHeader over lo-fi content shaped like the page's real content
// (Placeholder.tsx). It fades in on every page change, so clicking through the
// nav feels like loading somewhere new. The pages are about the nav, not this.

import { Button, IconButton } from '@launchpad-ui/components';

import { LayoutHeader, LayoutHeaderActions } from '../shared/LayoutHeader';

import { useNav } from './config';
import { ctaFor, DESTINATIONS, PAGE_SUBTITLE } from './data';
import { Placeholder } from './Placeholder';

import styles from './MainContent.module.css';


export function MainContent() {
  const { page } = useNav();
  const dest = DESTINATIONS[page] ?? { label: page };
  const title = page === 'home' ? 'Home' : dest.label;
  const cta = ctaFor(page);

  return (
    <main className={styles.main}>
      {/* The continuous shell's top bar: empty for now. Hidden otherwise. */}
      <div className={styles.topBar} />
      {/* The page, header and content. In the continuous shell, the white card. */}
      <div className={styles.page} data-marker="page">
        <LayoutHeader title={title}>
          <LayoutHeaderActions>
            {cta && (
              <Button variant="primary" data-track={`cta:${page}`}>
                {cta}
              </Button>
            )}
            <IconButton
              variant="minimal"
              size="medium"
              aria-label="Show change history"
              icon="clock-history"
              data-track={`history:${page}`}
            />
          </LayoutHeaderActions>
        </LayoutHeader>
        <div className={styles.body}>
          {PAGE_SUBTITLE[page] && <p className={styles.subtitle}>{PAGE_SUBTITLE[page]}</p>}
          {/* Keyed on the page, so it remounts, and fades in again, each time. */}
          <div key={page} className={styles.content}>
            <Placeholder page={page} />
          </div>
        </div>
      </div>
    </main>
  );
}
