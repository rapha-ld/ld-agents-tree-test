// Every visual knob the pages expose. Each page fixes most of these and puts
// one or two behind a switcher, so a page compares one decision at a time.

import { createContext, useContext } from 'react';

/**
 * Page (leaf) treatment. Every option shares the same current-page tint
 * (bg-ui-tertiary; hover is bg-ui-secondary); they differ in what marks the
 * section's extent and the current page on top of it.
 */
export type LeafTreatment =
  /** Faint guide line down the section; the tint alone marks the current page. */
  | 'guide'
  /** Guide line, and the current page's segment of it goes solid. */
  | 'line'
  /** As `line`, with the solid segment in brand lime (lime-dark in light mode, lime-base in dark). */
  | 'lime'
  /** No guide line; a brand-blue accent bar on the current page. Sruthy's combination 1. */
  | 'bar';

export type PinnedVariant =
  /** Equal-width bordered buttons filling the row. Sruthy's combination 1. */
  | 'outlined'
  /** Borderless icon buttons, left aligned. */
  | 'minimal'
  /** Equal-width buttons with a caption under each icon. */
  | 'captioned';

export type SearchVariant =
  /** The field opens the command palette as a centred modal. */
  | 'modal'
  /** The field stays put and becomes the palette's input; results drop from it. */
  | 'anchored'
  /**
   * The field is a real text input; focusing or typing drops the palette's
   * results below it like an autocomplete, with focus staying in the field
   * (#161). Expanded nav only: collapsed, search is the rail's button and the
   * modal palette.
   */
  | 'input';

export type CreateVariant =
  /** Two columns of four minimal-button tiles: icon and label, an arrow on hover. Default. */
  | 'tiles'
  /** The same tiles with a line of description under each label. */
  | 'tiles-described'
  /** The described tiles with the spot illustrations (illustrations/) in place of the icon squares. */
  | 'tiles-illustrated'
  /** Three-column tiles, icon over label, no description. */
  | 'compact'
  /** Today: a plain list. */
  | 'list';

export type RailFlyout = 'hover' | 'click';

/** What the collapsed rail does when you reach for it. */
export type RailExpand =
  /** Each section opens its own flyout (railFlyout says how). Today. */
  | 'flyouts'
  /** Hover or focus slides the whole sidebar out over the page as a drawer, as GitHub's nav does; leaving puts it back. */
  | 'drawer';

/** Drawer mode: what brings the drawer out. */
export type DrawerOpenOn =
  /** Hovering or focusing anywhere on the rail; leaving puts it back. */
  | 'hover'
  /** Pressing project, Starred, or one of the DRAWER_SECTIONS on the rail; it stays until dismissed. */
  | 'click';

/** Drawer mode: how the drawer is laid out. */
export type DrawerLayout =
  /** The expanded sidebar, as is. */
  | 'sidebar'
  /** Row for row on the icon rail (AlignedDrawer): icons stay put, the section you came from opens. */
  | 'aligned';

/** In click mode, the rail sections that open the drawer; the rest keep their flyouts. */
export const DRAWER_SECTIONS = ['features', 'agents', 'audiences', 'measurement'];

/** Default-button face in light mode. Dark mode keeps the experiment's own face. */
export type ButtonFace =
  /** mono-gradient's face: bg-ui-primary (white). */
  | 'white'
  /** gray-0, a step off white. */
  | 'gray';

/** #149 — section header label size. Pages are label-1-regular (13px), primary colour. */
export type HeaderSize =
  /** small-1-semibold, 11px. The first pass's size. */
  | 'small'
  /** label-2-medium, 11px: the first pass's size, a step lighter in weight. Default. */
  | 'label-2-medium'
  /** label-1-semibold, 13px: page-sized, set apart by weight and colour. */
  | 'label-semibold'
  /** label-1-medium, 13px: page-sized, a lighter step of weight. */
  | 'label-medium'
  /** label-1-regular, 13px: the pages' own size and weight; only colour sets it apart. */
  | 'label-regular';

/** #150 — which sections draw the guide line (guide / line / lime treatments). */
export type GuideScope =
  /** Every section. Today. */
  | 'all'
  /** Only the section holding the current page — the line itself marks the current section. */
  | 'current';

/** #151 — one colour for every sidebar icon, or today's mix. */
export type IconColor =
  /** Section headers subtle, buttons primary. Today. */
  | 'mixed'
  /** Every sidebar icon fill-ui-primary. */
  | 'primary'
  /** Every sidebar icon fill-ui-secondary. */
  | 'secondary';

/** #151 — where section icons come from. */
export type IconSet =
  /** Outline/filled pairs, four adapted from Tabler (localIcons.ts). */
  | 'adapted'
  /** LaunchPad sprite only; sections without a LaunchPad pair don't swap. */
  | 'launchpad';

/** #151 — icon sizing. */
export type IconSize =
  /** Every icon at LaunchPad's 16px box, as drawn. */
  | 'drawn'
  /** Per-icon scale so glyphs read at the same optical size (opticalSize.css). */
  | 'balanced';

/** Loom feedback — fill for the current section's icon (sidebar header and rail). */
export type CurrentIcon =
  /** Same fill as every other section icon. The first pass's treatment. */
  | 'same'
  /** text-ui-primary-base: the near-black of labels and the current-page accent. Default. */
  | 'ink'
  /** text-ui-secondary: the header label's own colour, a step darker than the icons' fill-ui-secondary. */
  | 'text-secondary';

/** Loom feedback — a small move on the section icon as its section becomes current. */
export type CurrentMotion =
  /** No motion. */
  | 'none'
  /** Swells slightly and settles. */
  | 'pop'
  /** Tips a few degrees and settles, like a nod. Default. */
  | 'tilt';

export interface NavConfig {
  showHome: boolean;
  pinned: PinnedVariant;
  search: SearchVariant;
  leaf: LeafTreatment;
  create: CreateVariant;
  railFlyout: RailFlyout;
  /** Hover intent on the rail's hover flyouts and hover drawer (hoverIntent.ts). Off: today's instant open. */
  hoverIntent: boolean;
  railExpand: RailExpand;
  drawerOpenOn: DrawerOpenOn;
  drawerLayout: DrawerLayout;
  buttonFace: ButtonFace;
  headerSize: HeaderSize;
  guideScope: GuideScope;
  iconColor: IconColor;
  iconSet: IconSet;
  iconSize: IconSize;
  currentIcon: CurrentIcon;
  currentMotion: CurrentMotion;
}

/** Sruthy's combination 1 with the Tier 1 decisions from the review applied. */
export const DEFAULT_CONFIG: NavConfig = {
  showHome: true,
  pinned: 'outlined',
  search: 'modal',
  leaf: 'line',
  create: 'tiles',
  railFlyout: 'hover',
  hoverIntent: false,
  railExpand: 'flyouts',
  drawerOpenOn: 'hover',
  drawerLayout: 'sidebar',
  buttonFace: 'white',
  headerSize: 'label-2-medium',
  guideScope: 'all',
  iconColor: 'mixed',
  iconSet: 'adapted',
  iconSize: 'drawn',
  currentIcon: 'ink',
  currentMotion: 'tilt',
};

export interface NavState {
  config: NavConfig;
  page: string;
  go: (page: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Collapsed, with the sidebar slid out over the page as a drawer (railExpand: 'drawer'). */
  peeking: boolean;
  /**
   * Bring the drawer out on `target` — 'project', 'shortcuts', or a section id —
   * which gets focus (and a collapsed section opens).
   */
  openDrawer: (target: string) => void;
  /** What the drawer was opened on, while it's out. */
  drawerTarget: string | null;
  /** Slide the drawer back to the rail. */
  closeDrawer: () => void;
  openPalette: () => void;
  /** Section ids open when the nav first mounts. Undefined: all open. */
  initialOpen?: string[];
}

export const NavContext = createContext<NavState | null>(null);

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavShell>');
  return ctx;
}
