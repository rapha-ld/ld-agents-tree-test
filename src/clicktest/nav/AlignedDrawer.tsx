// The drawer laid out row for row on the icon rail (drawerLayout: 'aligned').
// Every rail icon has a row here at the same height, with its icon in the same
// spot, so when the drawer slides out over the rail nothing under the pointer
// moves: the icon just gains its label. The section you came from opens and the
// rest stay closed, so the pointer can carry straight on into its pages.
//
// Geometry mirrors Rail.module.css: same block padding, 4px gap, 32px rows,
// separators and spacer. Rows sit 12px in with 8px padding, so each 16px icon
// lands at x = 20, the rail's own icon column.

import { useState } from 'react';
import { IconButton, InitialsAvatar, Tooltip, TooltipTrigger } from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';
import { Button as AriaButton } from 'react-aria-components';

import { useNav } from './config';
import { CreateFlyout } from './CreateFlyout';
import type { NavLeaf, NavSection } from './data';
import { FOOTER, GROUP_IDS, groupOf, PINNED, SECTIONS, STARRED, STARRED_ICONS, sectionIcon } from './data';
import { SectionIcon } from './SectionIcon';
import { ProjectSwitcher, SearchTrigger } from './Sidebar';

import styles from './AlignedDrawer.module.css';

const SECTION_IDS = new Set(GROUP_IDS);

/** Which section opens: the one the drawer came out on, else the current page's. */
function initialSection(target: string | null, page: string): string | null {
  if (target && SECTION_IDS.has(target)) return target;
  return groupOf(page);
}

export function AlignedDrawer() {
  const { config, page, go, setCollapsed, closeDrawer, openPalette, drawerTarget } = useNav();
  // Mounted fresh each time the drawer comes out (NavShell keys it), so this
  // starts from where it came out every time. One section open at a time.
  const [open, setOpen] = useState(() => initialSection(drawerTarget, page));
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const pinned = PINNED.filter((p) => config.showHome || p.id !== 'home');

  return (
    <div className={styles.drawer} data-header-size={config.headerSize}>
      <div className={styles.masthead}>
        <span className={styles.logoBox}>
          <Icon name="osmo" size="medium" className={styles.logo} aria-hidden />
        </span>
        <div className={styles.mastheadActions}>
          <TooltipTrigger>
            <IconButton
              aria-label="Expand navigation"
              icon="sidebar-left-expand"
              className={styles.subtleIcon}
              data-nav-toggle={config.drawerOpenOn === 'hover' || undefined}
              data-track="nav:expand"
              variant="minimal"
              size="small"
              onPress={() => setCollapsed(false)}
            />
            <Tooltip placement="bottom">Keep the navigation open</Tooltip>
          </TooltipTrigger>
          {/* Hover mode: leaving the drawer already closes it, so no × (#160). */}
          {config.drawerOpenOn === 'click' && (
            <TooltipTrigger>
              <IconButton
                aria-label="Close navigation"
                icon="cancel"
                className={styles.subtleIcon}
                data-nav-toggle
                data-track="nav:close"
                variant="minimal"
                size="small"
                onPress={closeDrawer}
              />
              <Tooltip placement="bottom">Close</Tooltip>
            </TooltipTrigger>
          )}
        </div>
      </div>

      <div className={styles.separator} />

      {/* The main nav's own project switcher and search field. The slots only
          nudge their padding so the icons stay on the rail's column. */}
      <div className={styles.projectSlot}>
        <ProjectSwitcher />
      </div>

      <div className={styles.searchSlot}>
        {/* The palette opens as a modal while the nav is collapsed (NavShell). */}
        <SearchTrigger paletteOpen={false} setPaletteOpen={(o) => o && openPalette()} />
      </div>

      {pinned.map((item) => {
        const content = (
          <>
            <Icon name={item.icon} size="small" />
            <span className={styles.label}>{item.label}</span>
            {item.hasPending && <span className={styles.dot} aria-label="Requests pending" />}
          </>
        );
        // Create opens its flyout, which needs a react-aria pressable as its
        // trigger; react-aria's unstyled Button takes the row's own styles.
        return item.id === 'create' ? (
          <CreateFlyout key={item.id} variant={config.create}>
            <AriaButton className={styles.row} data-drawer-target={item.id}>
              {content}
            </AriaButton>
          </CreateFlyout>
        ) : (
          <span key={item.id} className={styles.rowWrap}>
            <button
              type="button"
              className={styles.row}
              data-drawer-target={item.id}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
            >
              {content}
            </button>
          </span>
        );
      })}

      <div className={styles.separator} />

      <Section
        id="shortcuts"
        label="Shortcuts"
        icons={STARRED_ICONS}
        leaves={STARRED}
        open={open === 'shortcuts'}
        onToggle={toggle}
      />

      {SECTIONS.map((s) => (
        <Section
          key={s.id}
          id={s.id}
          label={s.label}
          icons={s}
          leaves={s.leaves}
          open={open === s.id}
          onToggle={toggle}
        />
      ))}

      <div className={styles.spacer} />

      {FOOTER.map((item) => (
        <span key={item.id} className={styles.rowWrap}>
          <button type="button" className={styles.row} data-drawer-target={item.id}>
            <Icon name={item.icon} size="small" />
            <span className={styles.label}>{item.label}</span>
            {item.hasPending && <span className={styles.dot} aria-label="Unread updates" />}
          </button>
        </span>
      ))}
      <div className={styles.profile} data-drawer-target="profile">
        <InitialsAvatar size="small" aria-hidden className={styles.avatar}>
          AK
        </InitialsAvatar>
        <span className={styles.label}>Alex Kim</span>
      </div>
    </div>
  );
}

interface SectionProps {
  id: string;
  label: string;
  icons: Pick<NavSection, 'icon' | 'iconCurrent' | 'lp'>;
  leaves: NavLeaf[];
  open: boolean;
  onToggle: (id: string) => void;
}

function Section({ id, label, icons, leaves, open, onToggle }: SectionProps) {
  const { config, page, go } = useNav();
  const hasCurrent = leaves.some((l) => l.id === page);
  const contentId = `drawer-section-${id}`;

  return (
    <div className={styles.section} data-open={open || undefined}>
      {/* The main nav's section header: no hover fill; the label steps up to
          primary text and the chevron takes the icon's place. */}
      <button
        type="button"
        className={styles.header}
        data-drawer-target={id}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => onToggle(id)}
      >
        <span className={styles.headerIcon} aria-hidden>
          <SectionIcon
            name={sectionIcon(icons, config.iconSet, hasCurrent)}
            size="small"
            variant="subtle"
            className={styles.glyph}
            data-current={hasCurrent || undefined}
          />
          <Icon name="chevron-down" size="small" variant="subtle" className={styles.chevron} />
        </span>
        <span className={styles.label}>{label}</span>
      </button>
      <div className={styles.leavesWrap} inert={!open}>
        <ul id={contentId} className={styles.leaves}>
          {leaves.map((leaf) => (
            <li key={leaf.id}>
              <button
                type="button"
                className={styles.leaf}
                aria-current={leaf.id === page ? 'page' : undefined}
                data-track={`leaf:${leaf.id}`}
                onClick={() => go(leaf.id)}
              >
                <span className={styles.leafLabel}>{leaf.label}</span>
                {leaf.badge && <span className={styles.beta}>{leaf.badge}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
