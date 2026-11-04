// Collapsed nav: an icon rail with section flyouts. The project icon is a
// folder (`folders`) rather than the copy icon, per the review. Every icon
// takes fill-ui-primary; the footer matches the expanded nav's footer.
//
// Section flyouts are non-modal popovers anchored to their icon. In `hover`
// mode they open on pointer enter and close a beat after the pointer leaves
// both the icon and the flyout, so the pointer can cross the gap between them.
// In `click` mode they behave like a menu: press to open, click outside to
// close.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, SetStateAction } from 'react';
import {
  Button,
  Header,
  IconButton,
  InitialsAvatar,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Tooltip,
  TooltipTrigger,
  iconButtonStyles,
} from '@launchpad-ui/components';

import { Icon } from '@launchpad-ui/icons';

import { DRAWER_SECTIONS, useNav } from './config';
import { CreateFlyout } from './CreateFlyout';
import type { NavLeaf, NavSection } from './data';
import { PINNED, SECTIONS, STARRED, STARRED_ICONS, sectionIcon, sectionOf } from './data';
import { SectionIcon } from './SectionIcon';
import { AIM_DELAY_MS, useAimTracker, useVelocityIntent } from './hoverIntent';

import { emit } from '../harness/tracker';

import styles from './Rail.module.css';

const CLOSE_DELAY_MS = 150;

/**
 * With hover intent on (config.hoverIntent), the hover flyouts share one open
 * state, so moving between icons hands off from one to the next (a menu bar's
 * "warm" behaviour), and they share the pointer's aim (hoverIntent.ts). Null
 * with intent off: each flyout keeps its own state, as before.
 */
interface FlyoutGroup {
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  isAimingAt: (panel: Element | null) => boolean;
}

const FlyoutGroupContext = createContext<FlyoutGroup | null>(null);

const panelOf = (id: string | null) => (id ? document.querySelector(`[data-flyout-panel="${id}"]`) : null);

function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipTrigger>
      {children}
      <Tooltip placement="end">{label}</Tooltip>
    </TooltipTrigger>
  );
}

export function Rail() {
  const { config, page, go, setCollapsed, openPalette, openDrawer } = useNav();
  // Click-open drawer: project, Starred, and DRAWER_SECTIONS bring the whole
  // sidebar out instead of their menu or flyout. Everything else is as usual.
  const drawerOnPress = config.railExpand === 'drawer' && config.drawerOpenOn === 'click';
  // Hover intent applies to the hover flyouts; in drawer mode the drawer has its own (NavShell).
  const intent = config.hoverIntent && config.railExpand !== 'drawer' && config.railFlyout === 'hover';
  const [openId, setOpenId] = useState<string | null>(null);
  const isAimingAt = useAimTracker(intent);
  const group = useMemo(() => (intent ? { openId, setOpenId, isAimingAt } : null), [intent, openId, isAimingAt]);
  const pinned = PINNED.filter((p) => config.showHome || p.id !== 'home');
  const currentSection = sectionOf(page)?.id;

  return (
    <FlyoutGroupContext value={group}>
      <nav aria-label="Main" className={styles.rail}>
        {/* Drawer mode: the logo, in the same 32px box as the drawer's own, so
          it stays put when the drawer slides out. The drawer's expand button
          pins the nav open instead. */}
        {config.railExpand === 'drawer' ? (
          <span className={styles.logoBox}>
            <Icon name="osmo" size="medium" className={styles.logo} aria-hidden />
          </span>
        ) : (
          <RailTooltip label="Expand navigation">
            <IconButton
              aria-label="Expand navigation"
              icon="sidebar-left-expand"
              variant="minimal"
              data-nav-toggle
              data-track="nav:expand"
              onPress={() => setCollapsed(false)}
            />
          </RailTooltip>
        )}

        <div className={styles.separator} />

        {drawerOnPress ? (
          <RailTooltip label="Project: Default project">
            <IconButton
              aria-label="Project: Default project"
              icon="folders"
              variant="minimal"
              data-rail-target="project"
              onPress={() => openDrawer('project')}
            />
          </RailTooltip>
        ) : (
          <MenuTrigger>
            <RailTooltip label="Project: Default project">
              <IconButton
                aria-label="Project: Default project"
                icon="folders"
                variant="minimal"
                data-rail-target="project"
              />
            </RailTooltip>
            <Popover placement="end top">
              <Menu aria-label="Switch project">
                <MenuItem id="default">Default project</MenuItem>
                <MenuItem id="test">Test project</MenuItem>
                <MenuItem id="personal">Personal project</MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        )}

        <RailTooltip label="Search ⌘K">
          <IconButton
            aria-label="Search"
            icon="search"
            variant="minimal"
            data-rail-target="search"
            onPress={openPalette}
          />
        </RailTooltip>

        {pinned.map((item) => {
          const ariaLabel = item.hasPending ? `${item.label}, requests pending` : item.label;
          const button = (
            <IconButton
              aria-label={ariaLabel}
              icon={item.icon}
              variant="minimal"
              className={styles.button}
              data-rail-target={item.id}
              data-current={page === item.id || undefined}
              onPress={item.id === 'create' ? undefined : () => go(item.id)}
            />
          );
          return (
            <span key={item.id} className={styles.item}>
              <RailTooltip label={item.label}>
                {item.id === 'create' ? <CreateFlyout variant={config.create}>{button}</CreateFlyout> : button}
              </RailTooltip>
              {item.hasPending && <span className={styles.dot} aria-hidden />}
            </span>
          );
        })}

        <div className={styles.separator} />

        <SectionFlyout
          id="shortcuts"
          label="Shortcuts"
          icons={STARRED_ICONS}
          leaves={STARRED}
          // Same as the sections' flyouts (hover or click, per the page).
          mode={config.railExpand === 'drawer' ? 'click' : config.railFlyout}
          selected={STARRED.some((s) => s.id === page)}
          onPress={drawerOnPress ? () => openDrawer('shortcuts') : undefined}
        />

        {SECTIONS.map((s) => (
          <SectionFlyout
            key={s.id}
            id={s.id}
            label={s.label}
            icons={s}
            leaves={s.leaves}
            // In drawer mode hovering the rail opens the whole sidebar, so the
            // section flyouts only open on press.
            mode={config.railExpand === 'drawer' ? 'click' : config.railFlyout}
            selected={currentSection === s.id}
            onPress={drawerOnPress && DRAWER_SECTIONS.includes(s.id) ? () => openDrawer(s.id) : undefined}
          />
        ))}

        <div className={styles.spacer} />

        {/* Same buttons, in the same order, as the expanded nav's footer. */}
        <RailTooltip label="Settings">
          <IconButton aria-label="Settings" icon="gear-outline" variant="minimal" data-rail-target="settings" />
        </RailTooltip>
        <RailTooltip label="Connections">
          <IconButton
            aria-label="Connections"
            icon="plug-connect-outline"
            variant="minimal"
            data-rail-target="connections"
          />
        </RailTooltip>
        <RailTooltip label="Help and support">
          <IconButton
            aria-label="Help and support"
            icon="help-circle-outline"
            variant="minimal"
            data-rail-target="help"
          />
        </RailTooltip>
        <span className={styles.item}>
          <RailTooltip label="What's new">
            <IconButton
              aria-label="What's new, unread updates"
              icon="bullhorn"
              variant="minimal"
              data-rail-target="whats-new"
            />
          </RailTooltip>
          <span className={styles.dot} aria-hidden />
        </span>
        <InitialsAvatar size="small" aria-label="Alex Kim" className={styles.avatar} data-rail-target="profile">
          AK
        </InitialsAvatar>
      </nav>
    </FlyoutGroupContext>
  );
}

interface SectionFlyoutProps {
  /** Section id; also the drawer row it lines up with (data-rail-target). */
  id: string;
  label: string;
  /** Outline/filled icons for both icon sets, as in the sidebar. */
  icons: Pick<NavSection, 'icon' | 'iconCurrent' | 'lp'>;
  leaves: NavLeaf[];
  mode: 'hover' | 'click';
  selected: boolean;
  /** Replaces the flyout: the button just does this (the click-open drawer). */
  onPress?: () => void;
}

function SectionFlyout({ id, label, icons, leaves, mode, selected, onPress }: SectionFlyoutProps) {
  const { config, page, go } = useNav();
  const hover = mode === 'hover';
  // With hover intent, open state lives in the rail's group (one flyout at a
  // time); otherwise here, as before.
  const group = useContext(FlyoutGroupContext);
  const intent = hover && group !== null;
  const groupRef = useRef(group);
  groupRef.current = group;
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = intent ? group.openId === id : localOpen;
  const setOpen = (next: boolean | ((open: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(isOpen) : next;
    if (groupRef.current && hover) groupRef.current.setOpenId((cur) => (value ? id : cur === id ? null : cur));
    else setLocalOpen(value);
  };
  // Opened by a press (click, Enter, Space) rather than the pointer passing
  // over: focus goes into the menu. Its popover is portaled, so without this a
  // keyboard user couldn't reach it.
  const [pressed, setPressed] = useState(false);
  const [menuKey, setMenuKey] = useState(0);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const open = () => {
    window.clearTimeout(closeTimer.current);
    if (!isOpen) setPressed(false);
    setOpen(true);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // ── Hover intent (hoverIntent.ts) ──
  const hovered = useRef(false);
  const aimTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(aimTimer.current), []);
  // Open once the pointer has slowed here, unless it's on its way to another
  // flyout that's already open; then look again in a moment.
  const tryOpen = () => {
    const g = groupRef.current;
    if (!hovered.current || !g) return;
    if (g.openId && g.openId !== id && g.isAimingAt(panelOf(g.openId))) {
      window.clearTimeout(aimTimer.current);
      aimTimer.current = window.setTimeout(tryOpen, AIM_DELAY_MS);
      return;
    }
    open();
  };
  const velocity = useVelocityIntent(() => tryOpen());
  // Close a beat after leaving, but not while the pointer is heading for this
  // flyout's panel.
  const scheduleIntentClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(function check() {
      if (groupRef.current?.isAimingAt(panelOf(id))) {
        closeTimer.current = window.setTimeout(check, AIM_DELAY_MS);
        return;
      }
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };
  const intentHandlers = intent
    ? {
        onPointerEnter: (e: ReactPointerEvent) => {
          if (e.pointerType !== 'mouse') return;
          hovered.current = true;
          window.clearTimeout(closeTimer.current);
          const g = groupRef.current;
          // Warm: another flyout is out, so hand over now (aim permitting).
          if (g?.openId && g.openId !== id) tryOpen();
          else if (!isOpen) velocity.start(e);
        },
        onPointerMove: (e: ReactPointerEvent) => velocity.move(e),
        onPointerLeave: (e: ReactPointerEvent) => {
          if (e.pointerType !== 'mouse') return;
          hovered.current = false;
          velocity.cancel();
          window.clearTimeout(aimTimer.current);
          scheduleIntentClose();
        },
      }
    : {
        onMouseEnter: hover ? open : undefined,
        onMouseLeave: hover ? scheduleClose : undefined,
      };

  if (onPress) {
    return (
      <span className={styles.item}>
        <Button
          aria-label={label}
          variant="minimal"
          className={`${iconButtonStyles({ size: 'medium' })} ${styles.button}`}
          data-rail-target={id}
          data-current={selected || undefined}
          data-marker={selected ? 'rail-section' : undefined}
          onPress={onPress}
        >
          <SectionIcon name={sectionIcon(icons, config.iconSet, selected)} size="small" aria-hidden />
        </Button>
      </span>
    );
  }

  return (
    <>
      <span ref={triggerRef} className={styles.item} {...intentHandlers}>
        {/* IconButton only takes a sprite name, so this is LaunchPad's Button
            wearing IconButton's own classes, with a SectionIcon inside —
            identical to an IconButton, but able to show local icons too. */}
        <Button
          aria-label={label}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          variant="minimal"
          className={`${iconButtonStyles({ size: 'medium' })} ${styles.button}`}
          data-rail-target={id}
          data-current={selected || undefined}
          data-marker={selected ? 'rail-section' : undefined}
          data-flyout-open={isOpen || undefined}
          // Hover mode: the flyout is the pointer's way in, so a click goes
          // straight to the section's top page (Feature management → Flags).
          // Touch has no hover, so a tap still opens the flyout; the keyboard
          // opens it with the arrow keys (onKeyDown, below). Click mode: a
          // press toggles the flyout.
          onPress={(e) => {
            if (hover && e.pointerType !== 'touch') {
              window.clearTimeout(closeTimer.current);
              setOpen(false);
              go(leaves[0].id);
              return;
            }
            if (!isOpen) setPressed(true);
            if (hover) {
              window.clearTimeout(closeTimer.current);
              setOpen(true);
            } else {
              setOpen((o) => !o);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            window.clearTimeout(closeTimer.current);
            setPressed(true);
            // Already open from a hover: remount the menu so it takes focus.
            if (isOpen) setMenuKey((k) => k + 1);
            setOpen(true);
          }}
        >
          <SectionIcon name={sectionIcon(icons, config.iconSet, selected)} size="small" aria-hidden />
        </Button>
      </span>
      <Popover
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={setOpen}
        isNonModal={hover}
        placement="end top"
        offset={8}
        className={styles.flyout}
        data-flyout-panel={id}
      >
        {/* LaunchPad's Menu, with the overrides from Caleb's Figma frame
            (Rail.module.css, "Flyout"). The wrapper keeps hover mode's
            pointer handling, since the Menu has no slot for it. */}
        <div
          onMouseEnter={hover ? open : undefined}
          onMouseLeave={hover ? (intent ? scheduleIntentClose : scheduleClose) : undefined}
        >
          <Menu
            key={menuKey}
            aria-label={label}
            className={styles.flyoutMenu}
            // Pressed open, focus goes into the menu; hovered open, it stays put.
            autoFocus={pressed ? 'first' : undefined}
            onAction={(key) => {
              emit('click', `leaf:${String(key)}`, { region: 'rail-flyout', via: 'action' });
              go(String(key));
              setOpen(false);
            }}
          >
            <MenuSection className={styles.flyoutSection}>
              <Header className={styles.flyoutHeader}>{label}</Header>
              {leaves.map((leaf) => (
                <MenuItem
                  key={leaf.id}
                  id={leaf.id}
                  textValue={leaf.label}
                  data-track={`leaf:${leaf.id}`}
                  className={leaf.id === page ? `${styles.flyoutItem} ${styles.flyoutCurrent}` : styles.flyoutItem}
                >
                  <span className={styles.flyoutLeafLabel}>{leaf.label}</span>
                  {leaf.badge && <span className={styles.beta}>{leaf.badge}</span>}
                </MenuItem>
              ))}
            </MenuSection>
          </Menu>
        </div>
      </Popover>
    </>
  );
}
