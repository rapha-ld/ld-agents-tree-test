// The expanded side nav, top to bottom: masthead (logo + collapse), project
// switcher, search field, pinned icon row, Starred, the sections, footer.
//
// Page treatments are switched with `data-leaf` on the root, so every
// treatment lives in Sidebar.module.css next to the others and the markup
// never changes between them.

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  IconButton,
  InitialsAvatar,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tooltip,
  TooltipTrigger,
} from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';

import { InlineSearch, PalettePopover } from './CommandPalette';
import { useNav } from './config';
import { CreateFlyout } from './CreateFlyout';
import type { NavLeaf } from './data';
import type { NavSection } from './data';
import { PINNED, SECTIONS, STARRED, STARRED_ICONS, sectionIcon } from './data';
import { SectionIcon } from './SectionIcon';

import { useScrollEdges } from './useScrollEdges';

import styles from './Sidebar.module.css';

export function Sidebar({
  paletteOpen,
  setPaletteOpen,
}: {
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
}) {
  const { config, setCollapsed, peeking, closeDrawer } = useNav();
  const { ref: scrollRef, edges } = useScrollEdges<HTMLElement>();

  return (
    // Only the section list is the <nav> landmark, as in gonfalon's Navigation.tsx;
    // the masthead, project switcher, search, and pinned row sit outside it. That
    // also matters for button-experiments.css, which withholds the raised button
    // face from anything inside a <nav>.
    <div
      className={styles.sidebar}
      data-marker="sidebar"
      data-leaf={config.leaf}
      data-header-size={config.headerSize}
      data-guide-scope={config.guideScope}
      data-icon-color={config.iconColor}
    >
      <div className={styles.masthead}>
        <Icon name="osmo" size="medium" className={styles.logo} aria-hidden />
        {peeking ? (
          // As a drawer over the rail: expand pins the nav open, × closes the drawer.
          <div className={styles.mastheadActions}>
            <TooltipTrigger>
              <IconButton
                aria-label="Expand navigation"
                icon="sidebar-left-expand"
                className={styles.collapse}
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
                  className={styles.collapse}
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
        ) : (
          <TooltipTrigger>
            <IconButton
              aria-label="Collapse navigation"
              icon="sidebar-left-collapse"
              className={styles.collapse}
              data-nav-toggle
              data-marker="collapse"
              data-track="nav:collapse"
              variant="minimal"
              size="small"
              onPress={() => setCollapsed(true)}
            />
            <Tooltip placement="bottom">Collapse to icon rail</Tooltip>
          </TooltipTrigger>
        )}
      </div>

      <div className={styles.top}>
        <ProjectSwitcher />
        <SearchTrigger paletteOpen={paletteOpen} setPaletteOpen={setPaletteOpen} />
        <PinnedRow />
      </div>

      {/* Shadows sit on the wrapper, not the scroller, so they stay pinned to
          the edges instead of scrolling away with the content. */}
      <div
        className={styles.scrollArea}
        data-overflow-top={edges.top || undefined}
        data-overflow-bottom={edges.bottom || undefined}
      >
        <nav ref={scrollRef} aria-label="Main" className={styles.scroll}>
          <Section id="shortcuts" label="Shortcuts" icons={STARRED_ICONS} leaves={STARRED} />
          {SECTIONS.map((s) => (
            <Section key={s.id} id={s.id} label={s.label} icons={s} leaves={s.leaves} />
          ))}
        </nav>
      </div>

      <NavFooter />
    </div>
  );
}

export function ProjectSwitcher() {
  return (
    <MenuTrigger>
      <Button variant="default" className={styles.project} data-drawer-target="project">
        <Icon name="folders" size="small" variant="subtle" />
        <span className={styles.projectName}>Default project</span>
        <Icon name="chevron-down" size="small" variant="subtle" />
      </Button>
      <Popover placement="bottom start">
        <Menu aria-label="Switch project">
          <MenuItem id="default">Default project</MenuItem>
          <MenuItem id="test">Test project</MenuItem>
          <MenuItem id="personal">Personal project</MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

/**
 * Looks like a field and opens the palette. It's a <button>, not an <input>:
 * nothing is typed here — typing happens in the palette, which either opens
 * over the page (`modal`) or lands exactly on top of this field (`anchored`).
 * LaunchPad has no "field-shaped button", so it's built from tokens.
 */
export function SearchTrigger({
  paletteOpen,
  setPaletteOpen,
}: {
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
}) {
  const { config, collapsed } = useNav();
  const ref = useRef<HTMLButtonElement>(null);
  const anchored = config.search === 'anchored';

  // A real text input with inline results (#161), while the nav is expanded.
  // Collapsed (the drawers), search stays this button and the modal palette.
  if (config.search === 'input' && !collapsed) {
    return <InlineSearch isOpen={paletteOpen} onOpenChange={setPaletteOpen} />;
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={styles.searchField}
        data-drawer-target="search"
        data-marker="search"
        onClick={() => setPaletteOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={paletteOpen}
      >
        <Icon name="search" size="small" variant="subtle" />
        <span className={styles.searchPlaceholder}>Search or jump to</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>
      {anchored && <PalettePopover isOpen={paletteOpen} onOpenChange={setPaletteOpen} triggerRef={ref} />}
    </>
  );
}

export function PinnedRow() {
  const { config, page, go } = useNav();
  const items = PINNED.filter((p) => config.showHome || p.id !== 'home');

  return (
    <div className={styles.pinned} data-variant={config.pinned} role="group" aria-label="Pinned" data-marker="pinned">
      {items.map((item) => {
        // `data-current`, not `data-selected`: React Aria's ToggleButton sets
        // `data-selected`, so LaunchPad (and button-experiments.css) would style
        // these as pressed toggles. They're links to the current page.
        const current = page === item.id;
        const ariaLabel = item.hasPending ? `${item.label}, requests pending` : item.label;
        const button =
          config.pinned === 'captioned' ? (
            <Button
              variant="minimal"
              aria-label={ariaLabel}
              className={styles.pinnedCaptioned}
              data-current={current || undefined}
              data-track={`pinned:${item.id}`}
              data-marker={item.id === 'create' ? 'create' : undefined}
              onPress={item.id === 'create' ? undefined : () => go(item.id)}
            >
              <Icon name={item.icon} size="small" />
              <span className={styles.pinnedCaption}>{item.label}</span>
            </Button>
          ) : (
            <IconButton
              aria-label={ariaLabel}
              icon={item.icon}
              variant={config.pinned === 'outlined' ? 'default' : 'minimal'}
              className={styles.pinnedButton}
              data-current={current || undefined}
              data-track={`pinned:${item.id}`}
              data-marker={item.id === 'create' ? 'create' : undefined}
              onPress={item.id === 'create' ? undefined : () => go(item.id)}
            />
          );

        const trigger = item.id === 'create' ? <CreateFlyout variant={config.create}>{button}</CreateFlyout> : button;

        return (
          <span key={item.id} className={styles.pinnedItem}>
            {/* Captioned buttons already say what they are; icon-only ones need the tooltip. */}
            {config.pinned === 'captioned' ? (
              trigger
            ) : (
              <TooltipTrigger>
                {trigger}
                <Tooltip placement="bottom">{item.label}</Tooltip>
              </TooltipTrigger>
            )}
            {item.hasPending && <span className={styles.dot} aria-hidden />}
          </span>
        );
      })}
    </div>
  );
}

interface SectionProps {
  id: string;
  label: string;
  /** Outline/filled icons for both icon sets; `sectionIcon` picks one. */
  icons: Pick<NavSection, 'icon' | 'iconCurrent' | 'lp'>;
  leaves: NavLeaf[];
}

function Section({ id, label, icons, leaves }: SectionProps) {
  const { config, page, go, drawerTarget, initialOpen } = useNav();
  const [open, setOpen] = useState(() => !initialOpen || initialOpen.includes(id));
  const contentId = `nav-section-${id}`;
  // Opened from this section's rail button: make sure its pages show.
  useEffect(() => {
    if (drawerTarget === id) setOpen(true);
  }, [drawerTarget, id]);
  // The section holding the current page swaps to its filled icon (same subtle fill).
  const hasCurrent = leaves.some((l) => l.id === page);

  return (
    <div className={styles.section} data-open={open || undefined} data-current={hasCurrent || undefined}>
      {/* A group header, not a destination: pressing it only collapses the
          section. Still a <button> so it's reachable and announces
          expanded/collapsed. The icon and the chevron share one slot — the
          chevron replaces the icon on hover or keyboard focus. */}
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        aria-controls={contentId}
        data-drawer-target={id}
        data-marker={hasCurrent ? 'section-header' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.sectionIcon} aria-hidden>
          <SectionIcon
            name={sectionIcon(icons, config.iconSet, hasCurrent)}
            size="small"
            variant="subtle"
            className={styles.glyph}
          />
          <Icon name="chevron-down" size="small" variant="subtle" className={styles.chevron} />
        </span>
        <span className={styles.sectionLabel}>{label}</span>
      </button>
      {/* #148: the wrapper animates open/closed (a 0fr ↔ 1fr grid row, so the
          height needs no measuring). Collapsed pages are `inert` rather than
          `hidden`, so they stay in the layout long enough to animate out but
          can't be focused or read. */}
      <div className={styles.leavesWrap} inert={!open}>
        <ul id={contentId} className={styles.leaves}>
          {leaves.map((leaf) => (
            <li key={leaf.id}>
              <button
                type="button"
                className={styles.leaf}
                aria-current={leaf.id === page ? 'page' : undefined}
                data-marker={leaf.id === page ? 'current-page' : undefined}
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

function NavFooter() {
  return (
    <div className={styles.footer}>
      <InitialsAvatar size="small" aria-label="Your profile" className={styles.avatar} data-track="footer:profile">
        AK
      </InitialsAvatar>
      <span className={styles.footerSpacer} />
      <TooltipTrigger>
        <IconButton aria-label="Settings" icon="gear-outline" variant="minimal" size="small" data-track="footer:settings" />
        <Tooltip>Settings</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger>
        <IconButton aria-label="Connections" icon="plug-connect-outline" variant="minimal" size="small" data-track="footer:connections" />
        <Tooltip>Connections</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger>
        <IconButton aria-label="Help and support" icon="help-circle-outline" variant="minimal" size="small" data-track="footer:help" />
        <Tooltip>Help and support</Tooltip>
      </TooltipTrigger>
      {/* Same unread dot as Approvals: something new, no count. */}
      <span className={styles.footerItem}>
        <TooltipTrigger>
          <IconButton aria-label="What's new, unread updates" icon="bullhorn" variant="minimal" size="small" data-track="footer:whats-new" />
          <Tooltip>What's new</Tooltip>
        </TooltipTrigger>
        <span className={styles.dot} aria-hidden />
      </span>
    </div>
  );
}
