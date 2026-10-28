// Nav content shared by every page. Section structure follows Sruthy's
// combination 1 (LD-nav-combination-1.html), which is the structure the team
// reviewed — not today's gonfalon sections.

import type { IconProps } from '@launchpad-ui/icons';

import type { IconSet } from './config';
import type { SectionIconName } from './SectionIcon';

type IconName = IconProps['name'];

export interface NavLeaf {
  id: string;
  label: string;
  badge?: 'Beta';
}

export interface NavSection {
  id: string;
  label: string;
  /** Outline icon, shown at rest. A LaunchPad sprite name or a local one (localIcons.ts). */
  icon: SectionIconName;
  /** Filled counterpart, shown while a page in this section is current. */
  iconCurrent?: SectionIconName;
  /**
   * The LaunchPad-sprite-only set (#151), when it differs from the above.
   * Sections LaunchPad has no outline/filled pair for keep one icon, unswapped.
   */
  lp?: { icon: SectionIconName; iconCurrent?: SectionIconName };
  leaves: NavLeaf[];
}

export const SECTIONS: NavSection[] = [
  {
    id: 'features',
    label: 'Feature management',
    icon: 'flag-outline',
    iconCurrent: 'flag',
    leaves: [
      { id: 'flags', label: 'Flags' },
      { id: 'releases', label: 'Releases' },
    ],
  },
  {
    id: 'agents',
    label: 'Agent management',
    // LaunchPad's own robot, with a filled half built from it (localIcons.ts).
    icon: 'robot',
    iconCurrent: 'lp-robot-filled',
    lp: { icon: 'robot' },
    leaves: [
      { id: 'configs', label: 'Configs' },
      { id: 'graphs', label: 'Graphs' },
      { id: 'optimization', label: 'Optimization', badge: 'Beta' },
      { id: 'playgrounds', label: 'Playgrounds' },
      { id: 'evaluations', label: 'Evaluations' },
      { id: 'insights', label: 'Insights' },
      { id: 'library', label: 'Library' },
    ],
  },
  {
    id: 'experimentation',
    label: 'Experimentation',
    icon: 'flask-outline',
    iconCurrent: 'flask-filled',
    lp: { icon: 'flask' },
    leaves: [
      { id: 'experiments', label: 'Experiments' },
      { id: 'bandits', label: 'Multi-armed bandits' },
      { id: 'holdouts', label: 'Holdouts' },
    ],
  },
  {
    id: 'observability',
    label: 'Observability',
    icon: 'graph-outline',
    iconCurrent: 'graph-filled',
    lp: { icon: 'pulse' },
    leaves: [
      { id: 'debugger', label: 'Event debugger' },
      { id: 'sessions', label: 'Sessions' },
      { id: 'errors', label: 'Errors' },
      { id: 'logs', label: 'Logs' },
      { id: 'traces', label: 'Traces' },
      { id: 'dashboards', label: 'Dashboards' },
      { id: 'alerts', label: 'Alerts' },
    ],
  },
  {
    id: 'audiences',
    label: 'Audiences',
    icon: 'group-outline',
    iconCurrent: 'group',
    leaves: [
      { id: 'contexts', label: 'Contexts' },
      { id: 'segments', label: 'Segments' },
    ],
  },
  {
    id: 'measurement',
    label: 'Measurement',
    icon: 'ruler-measure-outline',
    iconCurrent: 'ruler-measure-filled',
    lp: { icon: 'ruler' },
    leaves: [
      { id: 'metrics', label: 'Metrics' },
      { id: 'warehouse', label: 'Warehouse data sources' },
    ],
  },
];

export interface PinnedItem {
  id: 'home' | 'approvals' | 'create';
  label: string;
  icon: IconName;
  /** Something is waiting. Shown as a dot, not a count — the count isn't needed. */
  hasPending?: boolean;
}

export const PINNED: PinnedItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'approvals', label: 'Approvals', icon: 'inbox-outline', hasPending: true },
  { id: 'create', label: 'Create', icon: 'add' },
];

// Shortcuts are saved list filters (Cleanup is the built-in one).
export const STARRED: NavLeaf[] = [
  { id: 'shortcut-cleanup', label: 'Cleanup' },
  { id: 'shortcut-my-flags', label: 'My flags' },
  { id: 'shortcut-guarded', label: 'Guarded rollouts' },
];

export interface CreateType {
  id: string;
  label: string;
  /** LaunchPad sprite or a local icon (localIcons.ts), as the nav's section icons are. */
  icon: SectionIconName;
  description: string;
  section: string;
}

export const CREATE_TYPES: CreateType[] = [
  { id: 'flag', label: 'Flag', icon: 'flag', description: 'Roll out a feature safely.', section: 'Feature management' },
  { id: 'experiment', label: 'Experiment', icon: 'flask', description: 'A/B test against a metric.', section: 'Experimentation' },
  { id: 'ai-config', label: 'Agent config', icon: 'robot', description: 'Configure an agent or model.', section: 'Agent management' },
  { id: 'segment', label: 'Segment', icon: 'chart-venn', description: 'Group contexts for targeting.', section: 'Audiences' },
  { id: 'metric', label: 'Metric', icon: 'ruler-measure-outline', description: 'Track what a change affects.', section: 'Measurement' },
  { id: 'release', label: 'Release plan', icon: 'rocket', description: 'Move flags through each stage.', section: 'Feature management' },
  { id: 'context-kind', label: 'Context kind', icon: 'group-outline', description: 'Define a kind of context, like user or device.', section: 'Audiences' },
  { id: 'view', label: 'View', icon: 'stack', description: 'Organize flags by team.', section: 'Feature management' },
];

/** Where each Create type lands in the mock app once "created". */
export const CREATE_LANDING: Record<string, string> = {
  flag: 'flags',
  experiment: 'experiments',
  'ai-config': 'configs',
  segment: 'segments',
  metric: 'metrics',
  'context-kind': 'contexts',
  release: 'releases',
  view: 'flags',
};

export const FLAGS = [
  'mcp-log-level',
  'enable-chex-mab-aggregation',
  'tui-hyperpod',
  'mcp-rate-limit',
  'enable-new-navigation',
  'flattened-settings',
  'metric-breakdowns',
  'release-guardian-v2',
  'checkout-redesign',
];

export const SEGMENTS = ['Beta testers', 'Gen AI self serve customers', 'Enterprise trial'];

/**
 * Each page's main button, as the product has it. Null: the page has no main
 * action (it's a feed or a report). Click test tasks that end on a button need
 * the button here; edit freely.
 */
export const PAGE_CTA: Record<string, string | null> = {
  home: null,
  approvals: null,
  flags: 'Create flag',
  releases: 'Create release',
  configs: 'Create config',
  graphs: 'Create graph',
  optimization: 'Start optimization',
  playgrounds: 'Create playground',
  evaluations: 'Run evaluation',
  insights: null,
  library: 'Add to library',
  experiments: 'Create experiment',
  bandits: 'Create multi-armed bandit',
  holdouts: 'Create holdout',
  debugger: null,
  sessions: null,
  errors: null,
  logs: null,
  traces: null,
  dashboards: 'Create dashboard',
  alerts: 'Create alert',
  contexts: null,
  segments: 'Create segment',
  metrics: 'Create metric',
  warehouse: 'Add data source',
};

/**
 * One line under each page's header saying what the page is for, written from the LaunchDarkly
 * docs. None of it may reuse a word from a task or scenario (clicktest.test.ts checks), so a
 * participant can't match the task's words to a page.
 */
export const PAGE_SUBTITLE: Record<string, string> = {
  home: 'An overview of recent activity across this project.',
  approvals: "Pending decisions waiting on you, and the status of items you've asked others to approve.",
  'shortcut-cleanup': 'Flags that look stale and are candidates for removal.',
  'shortcut-my-flags': 'Flags you maintain, in one list.',
  'shortcut-guarded': 'Flags with automatic health monitoring enabled.',
  flags: 'Every flag in this project, with its status in each environment.',
  releases: 'Flags moving through staged phases across environments.',
  configs: 'Model and instruction variations, served at runtime and adjustable without a deploy.',
  graphs: 'Multistep workflows that connect several configs into one system.',
  optimization: 'Automated searches for better-performing configurations.',
  playgrounds: 'A sandbox for comparing model responses side by side.',
  evaluations: 'Configs scored against datasets, graded by an LLM.',
  insights: 'Token usage, latency, and quality metrics across your configs.',
  library: 'Reusable building blocks, such as shared instructions and tool definitions.',
  experiments: 'Controlled comparisons that measure how variations perform against metrics.',
  bandits: 'Experiments that shift traffic toward the best-performing variation as results come in.',
  holdouts: 'A slice of traffic excluded from experiments, used to measure their combined impact.',
  debugger: 'A live stream of incoming evaluation and custom events.',
  sessions: 'Recordings of visits, with clicks, navigation, and console output.',
  errors: 'Exceptions with stack traces, ranked by how often each occurs.',
  logs: 'Searchable log lines from your services.',
  traces: 'Timing across services, span by span.',
  dashboards: 'Custom charts of the numbers you care about most.',
  alerts: 'Rules that notify you when a metric crosses a threshold.',
  contexts: 'Every person, device, or organization that has evaluated a flag.',
  segments: 'Saved lists of contexts that rules can reference.',
  metrics: 'Definitions of the measurements behind experiment results and alerts.',
  warehouse: 'Connections to your warehouse tables for analysis.',
};

/** Every nav destination by id, for the page header and the command palette. */
export const DESTINATIONS: Record<string, { label: string; section?: string }> = {
  home: { label: 'Home' },
  approvals: { label: 'Approvals' },
  ...Object.fromEntries(STARRED.map((s) => [s.id, { label: s.label, section: 'Shortcuts' }])),
  ...Object.fromEntries(
    SECTIONS.flatMap((s) => s.leaves.map((l) => [l.id, { label: l.label, section: s.label }])),
  ),
};

export const sectionOf = (pageId: string) =>
  SECTIONS.find((s) => s.leaves.some((l) => l.id === pageId));

/** Every group in the sidebar: Shortcuts, then the sections. */
export const GROUP_IDS = ['shortcuts', ...SECTIONS.map((s) => s.id)];

/** The group a page sits in: Shortcuts for a saved view, else its section. */
export const groupOf = (pageId: string) =>
  STARRED.some((s) => s.id === pageId) ? 'shortcuts' : (sectionOf(pageId)?.id ?? null);

/** A page's main button. Shortcuts are saved views of the Flags list, so they share its button. */
export const ctaFor = (pageId: string) => (pageId.startsWith('shortcut-') ? PAGE_CTA.flags : PAGE_CTA[pageId]) ?? null;

/** The icons at the bottom of the nav. Profile is the avatar beside them. */
export const FOOTER: Array<{ id: string; label: string; icon: IconName; hasPending?: boolean }> = [
  { id: 'settings', label: 'Settings', icon: 'gear-outline' },
  { id: 'connections', label: 'Connections', icon: 'plug-connect-outline' },
  { id: 'help', label: 'Help and support', icon: 'help-circle-outline' },
  { id: 'whats-new', label: "What's new", icon: 'bullhorn', hasPending: true },
];

/** Shortcuts aren't in SECTIONS; the bolt is the shortcut icon in both sets. */
export const STARRED_ICONS = { icon: 'bolt', iconCurrent: 'bolt' } as const;

/** The icon a section shows for the active icon set (#151) and whether it holds the current page. */
export function sectionIcon(
  section: Pick<NavSection, 'icon' | 'iconCurrent' | 'lp'>,
  set: IconSet,
  current: boolean,
): SectionIconName {
  const icons = set === 'launchpad' && section.lp ? section.lp : section;
  return current && icons.iconCurrent ? icons.iconCurrent : icons.icon;
}
