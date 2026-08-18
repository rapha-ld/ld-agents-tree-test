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
  children: SchemeNode[];
};

export type Scheme = {
  id: string;
  name: string;
  notes?: string;
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
