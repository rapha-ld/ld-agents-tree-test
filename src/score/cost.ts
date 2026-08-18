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
};

export type Placement = {
  destinationId: string;
  labels: string[];
  /** Cost before the gate penalty, which depends on the destination not the placement. */
  cost: number;
  clicks: number;
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

export function collectPlacements(scheme: Scheme, params: CostParams = DEFAULT_PARAMS): Placement[] {
  const out: Placement[] = [];

  const visit = (node: SchemeNode, inheritedCost: number, inheritedClicks: number, labels: string[], siblings: number) => {
    const cost = inheritedCost + stepCost(node, siblings, params);
    const clicks = inheritedClicks + clickCost(node);
    const path = [...labels, node.label];

    if (node.destinationId !== null) {
      out.push({ destinationId: node.destinationId, labels: path, cost, clicks });
    }
    for (const child of node.children) {
      visit(child, cost, clicks, path, node.children.length);
    }
  };

  for (const section of scheme.sections) {
    visit(section, 0, 0, [], scheme.sections.length);
  }
  return out;
}

export type DestinationCost = {
  destinationId: string;
  cost: number;
  clicks: number;
  labels: string[];
  placements: number;
};

/** Best (cheapest) route to each destination the scheme binds, with the gate penalty applied. */
export function destinationCosts(
  scheme: Scheme,
  destinations: Map<string, Destination>,
  params: CostParams = DEFAULT_PARAMS,
): Map<string, DestinationCost> {
  const best = new Map<string, DestinationCost>();

  for (const p of collectPlacements(scheme, params)) {
    const gated = destinations.get(p.destinationId)?.gated ?? false;
    const total = p.cost + (gated ? params.gate : 0);
    const existing = best.get(p.destinationId);

    if (!existing) {
      best.set(p.destinationId, {
        destinationId: p.destinationId,
        cost: total,
        clicks: p.clicks,
        labels: p.labels,
        placements: 1,
      });
      continue;
    }

    existing.placements += 1;
    if (total < existing.cost) {
      existing.cost = total;
      existing.clicks = p.clicks;
      existing.labels = p.labels;
    }
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
};

function breadthProfile(scheme: Scheme) {
  const byDepth = new Map<number, number[]>();
  const push = (depth: number, count: number) => {
    const list = byDepth.get(depth) ?? [];
    list.push(count);
    byDepth.set(depth, list);
  };

  push(0, scheme.sections.length);
  const visit = (node: SchemeNode) => {
    if (node.children.length > 0) push(node.depth + 1, node.children.length);
    for (const child of node.children) visit(child);
  };
  for (const section of scheme.sections) visit(section);

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
  const placements = collectPlacements(scheme, params);

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

  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    boundDestinations: costs.size,
    totalPlacements: placements.length,
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
  };
}
