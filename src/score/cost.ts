import type { Destination, RevealType, Scenario, Scheme, SchemeNode } from '../parse/types';

export type CostParams = {
  /** Weight on the scan term. The breadth-versus-depth dial. */
  alpha: number;
  /** Extra cost for a node that is not directly visible. */
  reveal: Record<RevealType, number>;
  /** Applied once when the destination is entitlement or flag gated. */
  gate: number;
  /**
   * How many peers can be on screen at once. The scan term is a Hick's-law
   * style log, which assumes every choice is simultaneously visible. Past the
   * fold that assumption is false: the participant scrolls, loses their place,
   * and re-scans. Items beyond this budget are charged linearly to correct for
   * that rather than staying logarithmically cheap.
   *
   * Set overflowPenalty to 0 to recover the pure log model.
   */
  overflowBudget: number;
  overflowPenalty: number;
  /**
   * Cost of moving a mode switcher off its default. The control itself is always
   * on screen, so this is small; the real cost is the click plus the scan.
   */
  modeSwitch: number;
};

export const DEFAULT_PARAMS: CostParams = {
  alpha: 0.5,
  reveal: {
    visible: 0,
    tab: 0.25,
    collapsed: 0.5,
    filter: 0.75,
    switcher: 0.75,
    flyout: 1.0,
    overflow: 1.5,
  },
  gate: 0.5,
  overflowBudget: 12,
  overflowPenalty: 0.15,
  modeSwitch: 0.25,
};

export type Placement = {
  destinationId: string;
  labels: string[];
  /** Cost before the gate penalty, which depends on the destination not the placement. */
  cost: number;
  clicks: number;
  /** Which switcher mode this route goes through, or null when the scheme has no switcher. */
  mode: string | null;
};

/**
 * A node costs nothing to pass through when it is an unbound container whose
 * children are already on screen. Anything else costs a click, because the
 * participant has to act on it.
 */
function clickCost(node: SchemeNode): number {
  return node.reveal === 'visible' && node.destinationId === null ? 0 : 1;
}

function scanCost(siblings: number, params: CostParams): number {
  // Hick's law over the whole peer set, plus a linear surcharge for the peers
  // that cannot be on screen at the same time. Setting overflowPenalty to 0
  // recovers the pure logarithmic model exactly.
  const overflow = Math.max(0, siblings - params.overflowBudget);
  return params.alpha * Math.log2(siblings + 1) + overflow * params.overflowPenalty;
}

function stepCost(node: SchemeNode, siblings: number, params: CostParams): number {
  return clickCost(node) + scanCost(siblings, params) + params.reveal[node.reveal];
}

/** Sections on screen in a given mode. A section with no mode is in every mode. */
export function sectionsForMode(scheme: Scheme, modeId: string | null): SchemeNode[] {
  if (!scheme.modes || modeId === null) return scheme.sections;
  return scheme.sections.filter((s) => s.mode === null || s.mode === modeId);
}

/**
 * Children on screen in a given mode. Items can be mode-scoped too, not just
 * sections: today's Telemetry section drops Sessions, Errors and Logs in agent
 * mode, and a participant looking for them there needs to genuinely not find
 * them.
 */
export function visibleChildren(node: SchemeNode, modeId: string | null): SchemeNode[] {
  if (modeId === null) return node.children;
  return node.children.filter((c) => c.mode === null || c.mode === modeId);
}

export function defaultMode(scheme: Scheme): string | null {
  return scheme.modes?.[0]?.id ?? null;
}

export function collectPlacements(scheme: Scheme, params: CostParams = DEFAULT_PARAMS): Placement[] {
  const out: Placement[] = [];

  const visit = (
    node: SchemeNode,
    inheritedCost: number,
    inheritedClicks: number,
    labels: string[],
    siblings: number,
    mode: string | null,
  ) => {
    const cost = inheritedCost + stepCost(node, siblings, params);
    const clicks = inheritedClicks + clickCost(node);
    const path = [...labels, node.label];

    if (node.destinationId !== null) {
      out.push({ destinationId: node.destinationId, labels: path, cost, clicks, mode });
    }
    // Sibling count is what is actually on screen in this mode, not the whole list.
    const children = visibleChildren(node, mode);
    for (const child of children) {
      visit(child, cost, clicks, path, children.length, mode);
    }
  };

  if (!scheme.modes) {
    for (const section of scheme.sections) {
      visit(section, 0, 0, [], scheme.sections.length, null);
    }
    return out;
  }

  // Each mode is walked separately, because the visible sections and therefore
  // the top-level scan differ per mode. The default mode costs nothing to be in;
  // any other mode costs a switch.
  const fallback = defaultMode(scheme);
  for (const mode of scheme.modes) {
    const visible = sectionsForMode(scheme, mode.id);
    const isDefault = mode.id === fallback;
    const switchCost = isDefault ? 0 : 1 + scanCost(scheme.modes.length, params) + params.modeSwitch;
    const switchClicks = isDefault ? 0 : 1;
    for (const section of visible) {
      visit(section, switchCost, switchClicks, [], visible.length, mode.id);
    }
  }
  return out;
}

export type DestinationCost = {
  destinationId: string;
  cost: number;
  clicks: number;
  labels: string[];
  /** Switcher mode the cheapest route goes through, if the scheme has a switcher. */
  mode: string | null;
  placements: number;
};

/** Best (cheapest) route to each destination the scheme binds, with the gate penalty applied. */
export function destinationCosts(
  scheme: Scheme,
  destinations: Map<string, Destination>,
  params: CostParams = DEFAULT_PARAMS,
): Map<string, DestinationCost> {
  const best = new Map<string, DestinationCost>();
  // A section shared across modes is walked once per mode, which is not the same
  // thing as being placed twice in the tree. Count distinct label paths so the
  // duplication metric stays meaningful.
  const paths = new Map<string, Set<string>>();

  for (const p of collectPlacements(scheme, params)) {
    const gated = destinations.get(p.destinationId)?.gated ?? false;
    const total = p.cost + (gated ? params.gate : 0);

    const seen = paths.get(p.destinationId) ?? new Set<string>();
    seen.add(p.labels.join('\u0000'));
    paths.set(p.destinationId, seen);

    const existing = best.get(p.destinationId);
    if (!existing) {
      best.set(p.destinationId, {
        destinationId: p.destinationId,
        cost: total,
        clicks: p.clicks,
        labels: p.labels,
        mode: p.mode,
        placements: 1,
      });
      continue;
    }

    if (total < existing.cost) {
      existing.cost = total;
      existing.clicks = p.clicks;
      existing.labels = p.labels;
      existing.mode = p.mode;
    }
  }

  for (const [id, entry] of best) {
    entry.placements = paths.get(id)?.size ?? 1;
  }

  return best;
}

export type TaskScore = {
  prompt: string;
  targets: string[];
  cost: number | null;
  clicks: number | null;
  labels: string[] | null;
};

export type ScenarioScore = {
  scenarioId: string;
  persona: string;
  weight: number;
  tasks: TaskScore[];
  /** Sum of task costs. null when any task is unreachable in this scheme. */
  total: number | null;
  weightedTotal: number | null;
  unreachableTasks: string[];
};

export function scoreScenario(
  scenario: Scenario,
  costs: Map<string, DestinationCost>,
): ScenarioScore {
  const tasks: TaskScore[] = [];
  const unreachableTasks: string[] = [];

  for (const task of scenario.tasks) {
    // A task is satisfied by whichever accepted destination is cheapest to reach.
    const candidates = [...task.targets, ...task.accept]
      .map((id) => costs.get(id))
      .filter((c): c is DestinationCost => c !== undefined);

    if (candidates.length === 0) {
      tasks.push({ prompt: task.prompt, targets: task.targets, cost: null, clicks: null, labels: null });
      unreachableTasks.push(task.prompt);
      continue;
    }

    const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
    tasks.push({
      prompt: task.prompt,
      targets: task.targets,
      cost: best.cost,
      clicks: best.clicks,
      labels: best.labels,
    });
  }

  const complete = tasks.every((t) => t.cost !== null);
  const total = complete ? tasks.reduce((sum, t) => sum + (t.cost ?? 0), 0) : null;

  return {
    scenarioId: scenario.id,
    persona: scenario.persona,
    weight: scenario.weight,
    tasks,
    total,
    weightedTotal: total === null ? null : total * scenario.weight,
    unreachableTasks,
  };
}

export type SchemeMetrics = {
  schemeId: string;
  schemeName: string;
  boundDestinations: number;
  totalPlacements: number;
  /** Bound ids that do not exist in the destination database. Expected for candidate schemes. */
  proposed: string[];
  /** Known destinations the scheme never places. */
  unreachable: string[];
  duplicated: Array<{ destinationId: string; placements: number }>;
  worstCase: { destinationId: string; cost: number } | null;
  meanCost: number;
  weightedMeanCost: number | null;
  weightCoverage: number;
  breadth: Array<{ depth: number; mean: number; max: number; groups: number }>;
  scenarios: ScenarioScore[];
  scenarioWeightedTotal: number | null;
  /** Effort averaged over every task, which is the interpretable headline number. */
  meanTaskCost: number | null;
  /** Clicks averaged over every task, for grounding the effort number in something concrete. */
  meanTaskClicks: number | null;
  tasksScored: number;
  tasksUnreachable: number;
};

function breadthProfile(scheme: Scheme) {
  const byDepth = new Map<number, number[]>();
  const push = (depth: number, count: number) => {
    const list = byDepth.get(depth) ?? [];
    list.push(count);
    byDepth.set(depth, list);
  };

  if (scheme.modes) {
    for (const mode of scheme.modes) push(0, sectionsForMode(scheme, mode.id).length);
  } else {
    push(0, scheme.sections.length);
  }
  const visit = (node: SchemeNode, mode: string | null) => {
    const children = visibleChildren(node, mode);
    if (children.length > 0) push(node.depth + 1, children.length);
    for (const child of children) visit(child, mode);
  };
  if (scheme.modes) {
    for (const mode of scheme.modes) {
      for (const section of sectionsForMode(scheme, mode.id)) visit(section, mode.id);
    }
  } else {
    for (const section of scheme.sections) visit(section, null);
  }

  return [...byDepth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([depth, counts]) => ({
      depth,
      mean: counts.reduce((a, b) => a + b, 0) / counts.length,
      max: Math.max(...counts),
      groups: counts.length,
    }));
}

export function scoreScheme(
  scheme: Scheme,
  destinations: Map<string, Destination>,
  scenarios: Scenario[],
  weights: Record<string, number> = {},
  params: CostParams = DEFAULT_PARAMS,
): SchemeMetrics {
  const costs = destinationCosts(scheme, destinations, params);
  // Distinct routes through the tree. A mode scheme is walked once per mode, so
  // raw placements would overstate it.
  const placements = new Set(
    collectPlacements(scheme, params).map((p) => `${p.destinationId}\u0000${p.labels.join('\u0000')}`),
  );

  const proposed = [...costs.keys()].filter((id) => !destinations.has(id)).sort();
  const unreachable = [...destinations.keys()].filter((id) => !costs.has(id)).sort();
  const duplicated = [...costs.values()]
    .filter((c) => c.placements > 1)
    .map((c) => ({ destinationId: c.destinationId, placements: c.placements }))
    .sort((a, b) => b.placements - a.placements || a.destinationId.localeCompare(b.destinationId));

  const all = [...costs.values()];
  const worstCase = all.length
    ? all.reduce((a, b) => (b.cost > a.cost ? b : a))
    : null;
  const meanCost = all.length ? all.reduce((s, c) => s + c.cost, 0) / all.length : 0;

  const weightedIds = Object.keys(weights).filter((id) => costs.has(id));
  const weightSum = weightedIds.reduce((s, id) => s + weights[id], 0);
  const weightedMeanCost =
    weightSum > 0 ? weightedIds.reduce((s, id) => s + weights[id] * costs.get(id)!.cost, 0) / weightSum : null;
  const weightCoverage = destinations.size === 0 ? 0 : weightedIds.length / destinations.size;

  const scenarioScores = scenarios.map((s) => scoreScenario(s, costs));
  const scenarioComplete = scenarioScores.every((s) => s.weightedTotal !== null);
  const scenarioWeightedTotal = scenarioComplete
    ? scenarioScores.reduce((sum, s) => sum + (s.weightedTotal ?? 0), 0)
    : null;

  const allTasks = scenarioScores.flatMap((s) => s.tasks);
  const reached = allTasks.filter((t) => t.cost !== null);
  const meanTaskCost = reached.length ? reached.reduce((sum, t) => sum + (t.cost ?? 0), 0) / reached.length : null;
  const meanTaskClicks = reached.length
    ? reached.reduce((sum, t) => sum + (t.clicks ?? 0), 0) / reached.length
    : null;

  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    boundDestinations: costs.size,
    totalPlacements: placements.size,
    proposed,
    unreachable,
    duplicated,
    worstCase: worstCase ? { destinationId: worstCase.destinationId, cost: worstCase.cost } : null,
    meanCost,
    weightedMeanCost,
    weightCoverage,
    breadth: breadthProfile(scheme),
    scenarios: scenarioScores,
    scenarioWeightedTotal,
    meanTaskCost,
    meanTaskClicks,
    tasksScored: reached.length,
    tasksUnreachable: allTasks.length - reached.length,
  };
}
