import { describe, expect, it } from 'vitest';
import { parseScheme } from '../parse/scheme';
import { parseScenario } from '../parse/scenario';
import type { Destination } from '../parse/types';
import { DEFAULT_PARAMS, collectPlacements, destinationCosts, scoreScheme, scoreScenario } from '../score/cost';

function dest(id: string, gated = false): Destination {
  return { id, label: id, routePattern: null, kind: 'route', owner: null, gated, source: 'generated' };
}

function index(...ds: Destination[]) {
  return new Map(ds.map((d) => [d.id, d]));
}

// alpha 0.5, so a scan across n peers costs 0.5 * log2(n + 1).
const scan = (n: number) => 0.5 * Math.log2(n + 1);

describe('cost model', () => {
  const src = ['---', 'id: t', 'name: T', '---', '# A', '- X -> x', '- Y -> y', '# B -> b', '- Z -> z'].join('\n');
  const scheme = parseScheme(src);

  it('charges no click for an unbound visible container but still charges the scan', () => {
    const costs = destinationCosts(scheme, index(dest('x'), dest('y'), dest('b'), dest('z')));
    // Section A is an unbound visible container: scan over 2 sections, no click.
    // X: one click plus a scan over A's 2 children.
    expect(costs.get('x')!.cost).toBeCloseTo(scan(2) + 1 + scan(2), 10);
    expect(costs.get('x')!.clicks).toBe(1);
  });

  it('charges a click for a bound section heading', () => {
    const costs = destinationCosts(scheme, index(dest('b')));
    expect(costs.get('b')!.cost).toBeCloseTo(1 + scan(2), 10);
    expect(costs.get('b')!.clicks).toBe(1);
  });

  it('accumulates cost down a nested path', () => {
    const costs = destinationCosts(scheme, index(dest('z')));
    // B costs 1 + scan(2); Z adds 1 + a scan over B's single child.
    expect(costs.get('z')!.cost).toBeCloseTo(1 + scan(2) + 1 + scan(1), 10);
    expect(costs.get('z')!.clicks).toBe(2);
  });

  it('adds the reveal penalty for the node that is hidden', () => {
    const collapsed = parseScheme('---\nid: t\nname: T\n---\n# A [collapsed]\n- X -> x\n');
    const visible = parseScheme('---\nid: t\nname: T\n---\n# A\n- X -> x\n');
    const c = destinationCosts(collapsed, index(dest('x'))).get('x')!.cost;
    const v = destinationCosts(visible, index(dest('x'))).get('x')!.cost;
    // A collapsed section costs its reveal penalty plus the click to open it.
    expect(c - v).toBeCloseTo(DEFAULT_PARAMS.reveal.collapsed + 1, 10);
  });

  it('applies the gate penalty once, at the destination', () => {
    const open = destinationCosts(scheme, index(dest('x', false))).get('x')!.cost;
    const gated = destinationCosts(scheme, index(dest('x', true))).get('x')!.cost;
    expect(gated - open).toBeCloseTo(DEFAULT_PARAMS.gate, 10);
  });

  it('takes the cheapest placement when a destination appears twice, and counts both', () => {
    const dup = parseScheme(
      ['---', 'id: t', 'name: T', '---', '# A', '- X -> x', '# B', '- Deep', '  - Also X -> x'].join('\n'),
    );
    const entry = destinationCosts(dup, index(dest('x'))).get('x')!;
    expect(entry.placements).toBe(2);
    expect(entry.labels).toEqual(['A', 'X']);
    expect(entry.cost).toBeCloseTo(scan(2) + 1 + scan(1), 10);
  });

  it('charges beyond-the-fold peers linearly instead of logarithmically', () => {
    const many = ['---', 'id: t', 'name: T', '---', '# A'];
    for (let i = 0; i < 20; i++) many.push(`- Item${i} -> d${i}`);
    const wide = parseScheme(many.join('\n'));
    const ds = index(...Array.from({ length: 20 }, (_, i) => dest(`d${i}`)));

    const cost = destinationCosts(wide, ds).get('d0')!.cost;
    const overflow = 20 - DEFAULT_PARAMS.overflowBudget;
    const expected = scan(1) + 1 + (scan(20) + overflow * DEFAULT_PARAMS.overflowPenalty);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('recovers the pure log model when the overflow penalty is zero', () => {
    const many = ['---', 'id: t', 'name: T', '---', '# A'];
    for (let i = 0; i < 20; i++) many.push(`- Item${i} -> d${i}`);
    const wide = parseScheme(many.join('\n'));
    const ds = index(...Array.from({ length: 20 }, (_, i) => dest(`d${i}`)));
    const params = { ...DEFAULT_PARAMS, overflowPenalty: 0 };
    const cost = destinationCosts(wide, ds, params).get('d0')!.cost;
    expect(cost).toBeCloseTo(scan(1) + 1 + scan(20), 10);
  });

  it('collects one placement per binding', () => {
    expect(collectPlacements(scheme).map((p) => p.destinationId).sort()).toEqual(['b', 'x', 'y', 'z']);
  });
});

describe('scenario scoring', () => {
  const scheme = parseScheme('---\nid: t\nname: T\n---\n# A\n- X -> x\n- Y -> y\n');
  const costs = destinationCosts(scheme, index(dest('x'), dest('y')));

  it('picks the cheapest of targets and accepts', () => {
    const scenario = parseScenario('---\nid: s\npersona: p\n---\n## Do it\ntargets: y\naccept: x\n');
    const score = scoreScenario(scenario, costs);
    // x and y sit at the same depth here, so either is a valid cheapest answer.
    expect(score.tasks[0].cost).toBeCloseTo(costs.get('x')!.cost, 10);
    expect(score.unreachableTasks).toEqual([]);
  });

  it('reports an unreachable task and refuses to total the scenario', () => {
    const scenario = parseScenario('---\nid: s\npersona: p\n---\n## Do it\ntargets: nowhere\n');
    const score = scoreScenario(scenario, costs);
    expect(score.tasks[0].cost).toBeNull();
    expect(score.unreachableTasks).toEqual(['Do it']);
    expect(score.total).toBeNull();
    expect(score.weightedTotal).toBeNull();
  });

  it('multiplies the total by the scenario weight', () => {
    const scenario = parseScenario('---\nid: s\npersona: p\nweight: 3\n---\n## Do it\ntargets: x\n');
    const score = scoreScenario(scenario, costs);
    expect(score.weightedTotal).toBeCloseTo((score.total ?? 0) * 3, 10);
  });
});

describe('scheme metrics', () => {
  const scheme = parseScheme('---\nid: t\nname: T\n---\n# A\n- X -> x\n- New thing -> proposed.thing\n');
  const destinations = index(dest('x'), dest('unplaced'));
  const scenarios = [parseScenario('---\nid: s\npersona: p\n---\n## Do it\ntargets: x\n')];

  it('separates proposed destinations from unreachable ones', () => {
    const m = scoreScheme(scheme, destinations, scenarios);
    expect(m.proposed).toEqual(['proposed.thing']);
    expect(m.unreachable).toEqual(['unplaced']);
  });

  it('reports breadth per level', () => {
    const m = scoreScheme(scheme, destinations, scenarios);
    expect(m.breadth[0]).toEqual({ depth: 0, mean: 1, max: 1, groups: 1 });
    expect(m.breadth[1]).toEqual({ depth: 1, mean: 2, max: 2, groups: 1 });
  });

  it('omits the weighted mean when no weights are supplied', () => {
    const m = scoreScheme(scheme, destinations, scenarios);
    expect(m.weightedMeanCost).toBeNull();
    expect(m.weightCoverage).toBe(0);
  });

  it('computes the weighted mean over weighted destinations only', () => {
    const m = scoreScheme(scheme, destinations, scenarios, { x: 10, unplaced: 5 });
    const costs = destinationCosts(scheme, destinations);
    // `unplaced` has a weight but no placement, so it cannot contribute.
    expect(m.weightedMeanCost).toBeCloseTo(costs.get('x')!.cost, 10);
    expect(m.weightCoverage).toBeCloseTo(1 / 2, 10);
  });
});
