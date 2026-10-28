// How an exploration renders, and which frame owns ⌘K. The pages don't know
// about either: the gallery provides both, and a page opened on its own gets
// the defaults (full viewport, its frame owns ⌘K).

import { createContext, useContext } from 'react';

/** The click test has no gallery; kept so PagesContext's type still reads. */
type ExplorationEntry = { slug: string; title: string };

export type ExplorationLayout =
  /** On its own route: the frame fills the viewport, with the footer strip. */
  | { kind: 'page' }
  /** One of the gallery's stages; `href` is the page on its own. */
  | { kind: 'stage'; href: string; number: number };

export const LayoutContext = createContext<ExplorationLayout>({ kind: 'page' });

export const useLayout = () => useContext(LayoutContext);

/**
 * The gallery mounts every frame at once, and each listens for ⌘K. Only the
 * frame last clicked or focused into answers it, as in Sruthy's idea bank.
 * Null outside the gallery, where the one frame always answers.
 */
export interface ActiveFrame {
  activeId: string;
  setActive: (id: string) => void;
}

export const ActiveFrameContext = createContext<ActiveFrame | null>(null);

/**
 * Sruthy's "continuous top bar and side nav": the nav and a top bar (empty for
 * now) share one grey surface, and the page, header and all, sits in a white
 * card inside it. Every exploration
 * page has the switch (ExplorationPage owns it); NavShell reads it.
 */
export const ContinuousShellContext = createContext(false);

/**
 * The pages the gallery stacks, provided by index.tsx. A context rather than
 * an import of pages.ts, which globs pages/ — including the gallery's own page —
 * so importing it from Gallery would be an import cycle.
 */
export const PagesContext = createContext<ExplorationEntry[]>([]);
