export const REVEAL_TYPES = ['visible', 'tab', 'collapsed', 'flyout', 'overflow', 'filter', 'switcher'] as const;
export type RevealType = (typeof REVEAL_TYPES)[number];

export type DestinationKind = 'route' | 'tab' | 'drawer' | 'switcher' | 'palette';

export type Destination = {
  id: string;
  label: string;
  routePattern: string | null;
  kind: DestinationKind;
  owner: string | null;
  gated: boolean;
  source: 'generated' | 'overlay';
  navigator?: string;
  reachableFrom?: string;
  note?: string;
};

export type SchemeNode = {
  label: string;
  destinationId: string | null;
  reveal: RevealType;
  isSection: boolean;
  depth: number;
  /**
   * Set on a section that only appears in one mode of a mode switcher. Null means
   * the section is present whichever mode is active.
   */
  mode: string | null;
  children: SchemeNode[];
};

/**
 * A segmented control above the nav that swaps which sections are shown, like
 * gonfalon's Code / Agents switcher. The first mode is the default, so its
 * sections cost nothing extra to reach and the others cost a switch.
 */
export type SchemeMode = {
  id: string;
  label: string;
};

export type Scheme = {
  id: string;
  name: string;
  notes?: string;
  modes?: SchemeMode[];
  sections: SchemeNode[];
};

export type Task = {
  prompt: string;
  targets: string[];
  accept: string[];
};

export type Scenario = {
  id: string;
  persona: string;
  weight: number;
  context: string;
  tasks: Task[];
};
