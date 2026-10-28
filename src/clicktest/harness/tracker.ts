// Turns what the participant does in the prototype into track ids. The nav
// components only carry attributes (data-track, or their existing
// data-drawer-target / data-rail-target); this file decides what each one means,
// so the vocabulary lives in one place and matches clicktest/tasks.yaml.

import { GROUP_IDS, PINNED } from '../nav/data';

const SECTION_IDS = new Set(GROUP_IDS);
const PINNED_IDS = new Set<string>(PINNED.map((p) => p.id));

export type Emit = (kind: 'click' | 'page' | 'drawer', trackId: string | null, meta?: Record<string, unknown>) => void;

let sink: Emit | null = null;

/** What's typed in search, so a pick can be logged with the query that found it. */
export const currentQuery = () =>
  (document.querySelector('[role="dialog"] input, [data-marker="search"] input') as HTMLInputElement | null)?.value;

/** The harness points this at the current task while one is running. */
export function setSink(next: Emit | null) {
  sink = next;
}

/**
 * Called by the nav itself: page changes, the hover drawer, and menu picks made
 * with the keyboard (Enter in search), which no pointer listener sees. A pick
 * made with the mouse is recorded twice, once as its press and once here;
 * scoring collapses the repeat.
 */
export function emit(kind: 'click' | 'page' | 'drawer', trackId: string | null, meta?: Record<string, unknown>) {
  sink?.(kind, trackId, meta);
}

function fromTarget(value: string, kind: 'drawer' | 'rail'): string {
  if (SECTION_IDS.has(value)) return kind === 'rail' ? `rail:${value}` : `section:${value}`;
  if (PINNED_IDS.has(value)) return `pinned:${value}`;
  if (value === 'search') return 'search:field';
  if (value === 'project') return 'project';
  return `footer:${value}`;
}

function label(el: Element): string {
  const aria = el.getAttribute('aria-label');
  const text = aria ?? el.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 60) || el.tagName.toLowerCase();
}

/** The track id for a click, or null when it landed on nothing interactive. */
export function describe(target: Element): string | null {
  const tracked = target.closest('[data-track]');
  if (tracked) return tracked.getAttribute('data-track');
  const drawer = target.closest('[data-drawer-target]');
  if (drawer) return fromTarget(drawer.getAttribute('data-drawer-target') as string, 'drawer');
  const rail = target.closest('[data-rail-target]');
  if (rail) return fromTarget(rail.getAttribute('data-rail-target') as string, 'rail');
  const interactive = target.closest('button, a, [role="menuitem"], [role="option"], input, [role="button"]');
  if (interactive) return `other:${label(interactive)}`;
  return null;
}

/** Which part of the screen a click was in, kept as context next to the track id. */
export function region(target: Element): string {
  const layer = target.closest('[data-layer]')?.getAttribute('data-layer');
  if (layer) return layer;
  const menu = target.closest('[role="menu"]')?.getAttribute('aria-label');
  if (menu === 'Create') return 'create';
  if (menu && menu !== 'Results') return 'menu';
  if (target.closest('[role="dialog"]')) return 'palette';
  if (target.closest('main')) return 'page';
  return 'overlay';
}

/**
 * Records every press in the document while a task runs. Pointer down, not
 * click: React Aria opens menus and popovers on press, so by the time the click
 * event fires its target is often the overlay that just opened. Capture phase,
 * so nothing can stop it first.
 */
export function installClickListener(root: Document = document): () => void {
  const onClick = (e: PointerEvent) => {
    if (!sink || !(e.target instanceof Element) || e.button !== 0) return;
    if (e.target.closest('[data-harness]')) return;
    const trackId = describe(e.target);
    const query = currentQuery();
    sink('click', trackId, { region: region(e.target), x: e.clientX, y: e.clientY, ...(query ? { query } : {}) });
  };
  root.addEventListener('pointerdown', onClick, true);
  return () => root.removeEventListener('pointerdown', onClick, true);
}
