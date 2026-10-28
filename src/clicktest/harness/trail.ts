// The participant's path through the nav during one task, built from track ids
// as they click, so every time they abandon a route it's logged as a backtrack
// with its kind. The labels here name what a click picked, for the task card.
//
// Each click is a node in a small tree. A group is one way in (a section, the
// Create menu, search, a pinned page); level 0 is the group's own button, level
// 1 a page or menu item in it, level 2 a button on that page.

import { DESTINATIONS, FOOTER, GROUP_IDS, groupOf } from '../nav/data';

export type BacktrackKind =
  /** Left one section for another, e.g. Feature management to Agent management. */
  | 'section'
  /** Went back up within a section, e.g. clicked the section header from one of its pages. */
  | 'up'
  /** Changed how they were looking: browsing the nav, search, or the Create menu. */
  | 'method'
  /** Came back to a page they had already left. */
  | 'revisit';

export interface Backtrack {
  kind: BacktrackKind;
  from: string | null;
  to: string;
}

type Method = 'browse' | 'search' | 'create';

interface Node {
  id: string;
  group: string;
  level: number;
  method: Method;
}

export const FOOTER_LABEL: Record<string, string> = {
  profile: 'Your profile',
  ...Object.fromEntries(FOOTER.map((f) => [f.id, f.label])),
};

export const pageLabel = (page: string) => DESTINATIONS[page]?.label ?? page;
const groupOfPage = (page: string) => groupOf(page) ?? `page:${page}`;

export function paletteLabel(id: string): string {
  if (id.startsWith('flag:') || id.startsWith('segment:')) return id.slice(id.indexOf(':') + 1);
  if (id === 'action:create-flag') return 'Create flag';
  if (id === 'action:invite') return 'Invite a member';
  if (id === 'action:settings') return 'Open settings';
  return pageLabel(id);
}

/** What a track id means in the tree. Null: not a step (collapse, expand, history). */
export function toNode(trackId: string): Node | null {
  const i = trackId.indexOf(':');
  const kind = i === -1 ? trackId : trackId.slice(0, i);
  const rest = i === -1 ? '' : trackId.slice(i + 1);
  switch (kind) {
    case 'section':
    case 'rail':
      return { id: trackId, group: rest, level: 0, method: 'browse' };
    case 'leaf':
      return { id: trackId, group: groupOfPage(rest), level: 1, method: 'browse' };
    case 'cta':
      return { id: trackId, group: groupOfPage(rest), level: 2, method: 'browse' };
    case 'pinned':
      return rest === 'create'
        ? { id: trackId, group: 'create', level: 0, method: 'create' }
        : { id: trackId, group: `pinned:${rest}`, level: 0, method: 'browse' };
    case 'create':
      return { id: trackId, group: 'create', level: 1, method: 'create' };
    case 'search':
      return { id: trackId, group: 'search', level: 0, method: 'search' };
    case 'palette':
      return { id: trackId, group: 'search', level: 1, method: 'search' };
    case 'project':
      return { id: trackId, group: 'project', level: 0, method: 'browse' };
    case 'footer':
      return { id: trackId, group: trackId, level: 0, method: 'browse' };
    case 'other':
      return { id: trackId, group: trackId, level: 0, method: 'browse' };
    default:
      // nav:collapse, nav:expand, nav:close, history:<page>: moving the nav, not choosing a route.
      return null;
  }
}

export class TrailTracker {
  private branch: Node[] = [];
  private pagesSeen: Set<string>;
  private page: string;
  readonly backtracks: Backtrack[] = [];

  /** Sections open in the sidebar. A header click on an open one closes it, which isn't a step. */
  private open: Set<string>;

  /** `openSections` as in a task's start; omitted means every section starts open. */
  constructor(startPage: string, openSections?: string[]) {
    this.page = startPage;
    this.pagesSeen = new Set([startPage]);
    this.open = new Set(openSections ?? GROUP_IDS);
  }

  /** Feed one click. Returns the backtrack it caused, if any. */
  click(trackId: string): Backtrack | null {
    const node = toNode(trackId);
    if (!node) return null;
    const last = this.branch[this.branch.length - 1];
    if (trackId.startsWith('section:')) {
      const id = trackId.slice('section:'.length);
      if (!this.open.has(id)) {
        // Opening a closed section is a step into it.
        this.open.add(id);
        if (last && last.id === node.id) return null;
      } else {
        this.open.delete(id);
        // Closing the section they're working in is going back up (handled below); closing any other
        // open section, such as one that started open, is tidying the sidebar, not a step.
        if (!(last && this.branch[0].group === node.group)) return null;
      }
    }
    if (last && last.id === node.id) {
      // A section header, rail button or Create pressed again closes what it
      // opened: they've given up on it, so the trail clears.
      if (node.level === 0 && this.branch.length === 1) {
        const backtrack: Backtrack = { kind: 'up', from: node.id, to: node.id };
        this.backtracks.push(backtrack);
        this.branch = [];
        return backtrack;
      }
      // Otherwise it's one pick seen twice (its press and its menu action).
      return null;
    }

    let backtrack: Backtrack | null = null;
    if (!last) {
      this.branch = [node];
    } else if (node.group === this.branch[0].group) {
      if (node.level < last.level) backtrack = { kind: 'up', from: last.id, to: node.id };
      // Going down extends the branch; a sibling or a step up replaces from that level.
      this.branch = [...this.branch.filter((n) => n.level < node.level), node];
    } else {
      backtrack = {
        kind: node.method === last.method ? 'section' : 'method',
        from: last.id,
        to: node.id,
      };
      this.branch = [node];
    }
    if (backtrack) this.backtracks.push(backtrack);
    return backtrack;
  }

  /** Feed one page change. Returns a revisit backtrack if they came back to a page they'd left. */
  visit(page: string): Backtrack | null {
    if (page === this.page) return null;
    const previous = this.page;
    this.page = page;
    if (this.pagesSeen.has(page)) {
      const backtrack: Backtrack = { kind: 'revisit', from: previous, to: page };
      this.backtracks.push(backtrack);
      return backtrack;
    }
    this.pagesSeen.add(page);
    return null;
  }

  /** The track ids of the route they're on now. */
  route(): string[] {
    return this.branch.map((n) => n.id);
  }
}

/** Replays a task's clicks and page changes in order, for scoring. */
export type Step = { kind: 'click'; trackId: string } | { kind: 'page'; page: string };

export function replay(startPage: string, steps: Step[], openSections?: string[]): Backtrack[] {
  const t = new TrailTracker(startPage, openSections);
  for (const s of steps) {
    if (s.kind === 'click') t.click(s.trackId);
    else t.visit(s.page);
  }
  return t.backtracks;
}
