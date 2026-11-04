// The app frame: nav (expanded sidebar or icon rail) + stand-in page. Owns the
// current page, collapsed state, and the command palette, and hands them to
// the nav through NavContext.
//
// Collapsing animates. Both navs stay mounted, stacked in one slot whose width
// animates between the sidebar's and the rail's; the outgoing nav fades out
// as the incoming one fades in (NavShell.module.css). The inactive one is
// `inert`, so it can't be tabbed into or read out. Staying mounted also means
// the sidebar keeps its open/collapsed sections across a trip to the rail.
//
// Drawer mode (railExpand: 'drawer', GitHub's nav): collapsed, the slot keeps
// the rail's width, and hovering or focusing it slides the sidebar out over
// the page instead of widening the slot, so the page never reflows. Leaving,
// blurring, or Escape slides it back.

import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AlignedDrawer } from './AlignedDrawer';
import { useVelocityIntent } from './hoverIntent';
import { PaletteModal } from './CommandPalette';
import type { NavConfig } from './config';
import { NavContext } from './config';
import { ActiveFrameContext, ContinuousShellContext } from './layout';
import { MainContent } from './MainContent';
import { Rail } from './Rail';
import { Sidebar } from './Sidebar';

import { emit } from '../harness/tracker';

import styles from './NavShell.module.css';

/** Grace period before the drawer closes, so a pointer that slips off its edge can come back. */
const DRAWER_CLOSE_DELAY_MS = 200;

/** With hover intent: a longer grace, so overshooting the drawer's edge doesn't put it away. */
const DRAWER_INTENT_CLOSE_DELAY_MS = 300;

/** How long transitions stay off after pinning open from the drawer: a few frames. */
const INSTANT_MS = 100;

interface NavShellProps {
  config: NavConfig;
  /** Page the frame opens on. */
  initialPage?: string;
  /** Start as the icon rail (the rail page). */
  initialCollapsed?: boolean;
  /** Sections open on first mount (click test). Undefined: all open. */
  initialOpen?: string[];
}

export function NavShell({ config, initialPage = 'flags', initialCollapsed = false, initialOpen }: NavShellProps) {
  const [page, setPage] = useState(initialPage);
  // Selection motion (Loom feedback) plays only after the first navigation, so
  // the current section's icon doesn't animate every time the frame loads.
  const [hasNavigated, setHasNavigated] = useState(false);
  const [collapsed, setCollapsedState] = useState(initialCollapsed);
  // Pinning the nav open from the drawer: the sidebar is already showing at
  // full width, so it snaps into place rather than animating the slot open
  // and the drawer's corners and shadow away.
  const [instant, setInstant] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const prevCollapsed = useRef(collapsed);

  const drawerMode = config.railExpand === 'drawer';
  const [peek, setPeekState] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState<string | null>(null);
  // Bumped each time the drawer comes out, to remount the aligned drawer so it
  // opens on its target's section every time.
  const [drawerKey, setDrawerKey] = useState(0);
  const peekRef = useRef(false);
  const setPeek = (next: boolean, target: string | null = null) => {
    if (next && !peekRef.current) {
      setDrawerKey((k) => k + 1);
      emit('drawer', target, { open: true });
    }
    peekRef.current = next;
    setPeekState(next);
    setDrawerTarget(next ? target : null);
  };
  const aligned = drawerMode && config.drawerLayout === 'aligned';
  const openOnClick = config.drawerOpenOn === 'click';
  const peeking = drawerMode && collapsed && peek;
  const setCollapsed = (next: boolean) => {
    if (!next && peeking) setInstant(true);
    setCollapsedState(next);
  };
  // Transitions back on once the snapped layout has been styled. A timer, not
  // animation frames, which a hidden tab never runs.
  useEffect(() => {
    if (!instant) return;
    const timer = window.setTimeout(() => setInstant(false), INSTANT_MS);
    return () => window.clearTimeout(timer);
  }, [instant]);
  const closeTimer = useRef<number | undefined>(undefined);
  // Set while focus is moved back to the rail on Escape, so that focus
  // doesn't reopen the drawer.
  const returningFocus = useRef(false);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // In the gallery, only the frame last clicked or focused into owns ⌘K.
  // It identifies itself by its stage's section id, so the first stage owns
  // it before anything is clicked.
  const activeFrame = useContext(ActiveFrameContext);
  const continuous = useContext(ContinuousShellContext);
  const fallbackId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameId, setFrameId] = useState(fallbackId);
  useEffect(() => {
    const id = frameRef.current?.closest('section[id]')?.id;
    if (id) setFrameId(id);
  }, []);
  const ownsShortcut = !activeFrame || activeFrame.activeId === frameId;
  const claim = activeFrame ? () => activeFrame.setActive(frameId) : undefined;

  // ⌘K / Ctrl+K opens the palette, as in the product.
  useEffect(() => {
    if (!ownsShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownsShortcut]);

  // The collapse/expand button goes inert along with its nav, which would drop
  // focus on <body>. Hand focus to the other nav's toggle instead — but only if
  // focus was in the nav, so a mouse user's focus isn't moved.
  // Compares against the last value rather than skipping the first run, which
  // StrictMode's double effect would defeat — and in the gallery, the focus
  // move would scroll the page to whichever frame mounted last.
  useEffect(() => {
    if (prevCollapsed.current === collapsed) return;
    prevCollapsed.current = collapsed;
    setPeek(false);
    const slot = slotRef.current;
    const active = document.activeElement;
    if (!slot || (active && active !== document.body && !slot.contains(active))) return;
    slot.querySelector<HTMLElement>('[data-active] [data-nav-toggle]')?.focus();
  }, [collapsed]);

  // The drawer and the rail swap which is inert, so focus inside the outgoing
  // one would be dropped. Before the browser can drop it (a layout effect runs
  // ahead of that), hand it to the incoming one's toggle: on opening, from a
  // focused rail button; on Escape, back to the rail.
  // Going back, focus lands on the rail icon the drawer came out on, or the
  // rail's expand button, or (drawer mode shows the logo there) its first button.
  const prevPeeking = useRef(peeking);
  const lastTarget = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (prevPeeking.current === peeking) return;
    prevPeeking.current = peeking;
    if (peeking) lastTarget.current = drawerTarget;
    const slot = slotRef.current;
    const active = document.activeElement;
    if (slot && active && slot.contains(active) && (peeking || returningFocus.current)) {
      const find = (selector: string) => slot.querySelector<HTMLElement>(`[data-active] ${selector}`);
      const target = peeking ? drawerTarget : lastTarget.current;
      const attr = peeking ? 'data-drawer-target' : 'data-rail-target';
      ((target && find(`[${attr}="${target}"]`)) || find('[data-nav-toggle]') || find('button'))?.focus();
    }
    returningFocus.current = false;
  }, [peeking]);

  // An open menu or popover from inside the drawer (project switcher, Create)
  // lives in a portal, so pointer and focus both "leave" when it opens. Its
  // trigger says aria-expanded meanwhile; keep the drawer out until it closes.
  // aria-haspopup too, since the sidebar's open sections are aria-expanded.
  const hasOpenOverlay = () => !!slotRef.current?.querySelector('[aria-haspopup][aria-expanded="true"]');
  const open = (target: string | null = null) => {
    window.clearTimeout(closeTimer.current);
    if (!peekRef.current) setPeek(true, target);
  };
  // The rail item level with the pointer, by row band (half the 4px gap
  // either side), so entering between two icons still picks one.
  const railTargetAt = (y: number) => {
    for (const el of slotRef.current?.querySelectorAll('[data-layer="rail"] [data-rail-target]') ?? []) {
      const r = el.getBoundingClientRect();
      if (y >= r.top - 2 && y < r.bottom + 2) return el.getAttribute('data-rail-target');
    }
    return null;
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(
      () => {
        if (!hasOpenOverlay()) setPeek(false);
      },
      config.hoverIntent ? DRAWER_INTENT_CLOSE_DELAY_MS : DRAWER_CLOSE_DELAY_MS,
    );
  };
  // Hover intent (hoverIntent.ts): open once the pointer slows on the rail,
  // on the item it slowed on, so a pointer crossing the rail on its way to the
  // window's edge doesn't throw the drawer out over the page.
  const velocity = useVelocityIntent((at) => open(railTargetAt(at.y)));
  // Escape slides the drawer back. A native capture listener, since the nav's
  // tooltips and buttons can stop Escape before React's handlers see it.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || !peeking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    slot.addEventListener('keydown', onKey, true);
    return () => slot.removeEventListener('keydown', onKey, true);
  }, [peeking]);

  // Clicked open, the drawer stays out when the pointer leaves, as GitHub's
  // does; it goes on Escape, ×, tabbing out, or a click on the page. Picking a
  // page closes it in either mode (go, below).
  const closeDrawer = () => {
    returningFocus.current = true;
    setPeek(false);
  };
  const hoverHandlers =
    drawerMode && collapsed && !openOnClick
      ? {
          onPointerEnter: (e: ReactPointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            // Back within the close grace: stay out. Otherwise wait for intent, if on.
            if (!config.hoverIntent || peekRef.current) open(railTargetAt(e.clientY));
            else velocity.start(e);
          },
          onPointerMove: (e: ReactPointerEvent) => config.hoverIntent && velocity.move(e),
          onPointerLeave: (e: ReactPointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            velocity.cancel();
            scheduleClose();
          },
          onFocus: (e: ReactFocusEvent) =>
            !returningFocus.current &&
            open((e.target as Element).closest('[data-rail-target]')?.getAttribute('data-rail-target') ?? null),
        }
      : {};
  const drawerHandlers =
    drawerMode && collapsed
      ? {
          ...hoverHandlers,
          onBlur: (e: ReactFocusEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget) && !hasOpenOverlay()) setPeek(false);
          },
        }
      : {};

  const value = useMemo(
    () => ({
      config,
      page,
      go: (next: string) => {
        emit('page', null, { page: next });
        setPage(next);
        setHasNavigated(true);
        // Picking a page from the drawer puts it away, in either mode.
        if (peekRef.current) closeDrawer();
      },
      collapsed,
      setCollapsed,
      peeking,
      openDrawer: (target: string) => {
        window.clearTimeout(closeTimer.current);
        setPeek(true, target);
      },
      drawerTarget: peeking ? drawerTarget : null,
      closeDrawer,
      openPalette: () => setPaletteOpen(true),
      initialOpen,
    }),
    // setPeek and closeDrawer only touch state setters and refs, so they needn't be deps.
    [config, page, collapsed, peeking, drawerTarget, openOnClick, initialOpen],
  );

  // The anchored palette hangs off the sidebar field, which the rail doesn't
  // have — collapsed always falls back to the modal.
  const useModal = collapsed || config.search === 'modal';

  return (
    <NavContext.Provider value={value}>
      <div
        ref={frameRef}
        className={styles.frame}
        onPointerDownCapture={claim}
        onFocusCapture={claim}
        data-button-face={config.buttonFace}
        data-continuous={continuous || undefined}
        data-icon-size={config.iconSize}
        data-current-icon={config.currentIcon}
        data-current-motion={hasNavigated ? config.currentMotion : undefined}
        data-instant={instant || undefined}
      >
        <div
          ref={slotRef}
          className={styles.navSlot}
          data-collapsed={collapsed || undefined}
          data-peeking={peeking || undefined}
          {...drawerHandlers}
        >
          <div className={styles.panel}>
            <div
              className={styles.layer}
              data-layer="sidebar"
              data-active={!collapsed || (peeking && !aligned) || undefined}
              inert={collapsed && !(peeking && !aligned)}
            >
              <Sidebar paletteOpen={paletteOpen && !collapsed} setPaletteOpen={setPaletteOpen} />
            </div>
            {aligned && (
              <div
                className={styles.layer}
                data-layer="drawer"
                data-active={peeking || undefined}
                inert={!peeking}
              >
                <AlignedDrawer key={drawerKey} />
              </div>
            )}
            <div
              className={styles.layer}
              data-layer="rail"
              data-active={(collapsed && !peeking) || undefined}
              inert={!collapsed || peeking}
            >
              <Rail />
            </div>
          </div>
        </div>
        {drawerMode && (
          // Clicked open, a click on the page closes it. Not a button: Escape
          // and × are the keyboard routes.
          <div
            className={styles.scrim}
            data-visible={peeking || undefined}
            data-dismissable={openOnClick || undefined}
            aria-hidden
            onClick={openOnClick ? () => setPeek(false) : undefined}
          />
        )}
        <MainContent />
      </div>
      {useModal && <PaletteModal isOpen={paletteOpen} onOpenChange={setPaletteOpen} />}
    </NavContext.Provider>
  );
}
