import { describe, expect, it } from 'vitest';
import { parseScheme } from '../parse/scheme';
import { parseScenario } from '../parse/scenario';
import type { Destination } from '../parse/types';
import {
  DEFAULT_PARAMS,
  defaultMode,
  destinationCosts,
  scoreScheme,
  sectionsForMode,
  visibleChildren,
} from '../score/cost';
import type { StudyEvent, StudySession } from '../session';
import { analyze, type ResultsFile } from '../report/analyze';

const HEAD = ['---', 'id: m', 'name: M', 'modes:', '  - id: code', '    label: Code', '  - id: agent', '    label: Agents', '---'];

const scheme = parseScheme(
  [
    ...HEAD,
    '# Features [mode=code]',
    '- Flags -> flags',
    '# Agents [mode=agent]',
    '- Configs -> configs',
    '# Telemetry',
    '- Errors -> errors',
  ].join('\n'),
);

function dest(id: string): Destination {
  return { id, label: id, routePattern: null, kind: 'route', owner: null, gated: false, source: 'generated' };
}
const ds = new Map([dest('flags'), dest('configs'), dest('errors')].map((d) => [d.id, d]));
const scan = (n: number) => 0.5 * Math.log2(n + 1);

describe('mode switcher parsing', () => {
  it('reads the mode list and tags sections', () => {
    expect(scheme.modes).toEqual([
      { id: 'code', label: 'Code' },
      { id: 'agent', label: 'Agents' },
    ]);
    expect(scheme.sections.map((s) => [s.label, s.mode])).toEqual([
      ['Features', 'code'],
      ['Agents', 'agent'],
      ['Telemetry', null],
    ]);
  });

  it('combines a reveal modifier with a mode on the same section', () => {
    const s = parseScheme([...HEAD, '# Features [collapsed] [mode=code]', '- Flags -> flags', '# A [mode=agent]', '- C -> c'].join('\n'));
    expect(s.sections[0].reveal).toBe('collapsed');
    expect(s.sections[0].mode).toBe('code');
  });

  it('treats the first declared mode as the default', () => {
    expect(defaultMode(scheme)).toBe('code');
  });

  it('shows shared sections in every mode and exclusive ones only in theirs', () => {
    expect(sectionsForMode(scheme, 'code').map((s) => s.label)).toEqual(['Features', 'Telemetry']);
    expect(sectionsForMode(scheme, 'agent').map((s) => s.label)).toEqual(['Agents', 'Telemetry']);
  });

  it('rejects a mode that no section uses, which is usually a typo', () => {
    expect(() => parseScheme([...HEAD, '# Features [mode=code]', '- Flags -> flags'].join('\n'))).toThrow(
      /mode\(s\) agent have no sections/,
    );
  });

  it('rejects an undeclared mode', () => {
    expect(() => parseScheme([...HEAD, '# X [mode=nope]', '- A -> a'].join('\n'))).toThrow(/Unknown mode "nope"/);
  });

  it('rejects an item whose mode contradicts its section, since it could never be seen', () => {
    expect(() => parseScheme([...HEAD, '# F [mode=code]', '- Flags [mode=agent] -> flags', '# A [mode=agent]', '- C -> c'].join('\n'))).toThrow(
      /can never be seen/,
    );
  });

  it('counts an item-level mode when checking that every mode is used', () => {
    const s = parseScheme(
      [...HEAD, '# Features [mode=code]', '- Flags -> flags', '# Telemetry', '- Insights [mode=agent] -> ai'].join('\n'),
    );
    expect(s.sections[1].children[0].mode).toBe('agent');
  });

  it('rejects a switcher with fewer than two modes', () => {
    const one = ['---', 'id: m', 'name: M', 'modes:', '  - id: code', '    label: Code', '---', '# F [mode=code]', '- A -> a'];
    expect(() => parseScheme(one.join('\n'))).toThrow(/at least two modes/);
  });
});

describe('mode switcher cost', () => {
  const costs = destinationCosts(scheme, ds);

  it('charges nothing extra for the default mode', () => {
    // Code mode shows Features and Telemetry, so the top-level scan is over two.
    expect(costs.get('flags')!.cost).toBeCloseTo(scan(2) + 1 + scan(1), 10);
    expect(costs.get('flags')!.clicks).toBe(1);
    expect(costs.get('flags')!.mode).toBe('code');
  });

  it('charges a click, a scan of the switcher, and a small penalty for a non-default mode', () => {
    const switchCost = 1 + scan(2) + DEFAULT_PARAMS.modeSwitch;
    expect(costs.get('configs')!.cost).toBeCloseTo(switchCost + scan(2) + 1 + scan(1), 10);
    // The switch itself is a click, on top of the two to reach the destination.
    expect(costs.get('configs')!.clicks).toBe(2);
    expect(costs.get('configs')!.mode).toBe('agent');
  });

  it('reaches a shared section via the default mode, so it pays no switch', () => {
    expect(costs.get('errors')!.cost).toBeCloseTo(scan(2) + 1 + scan(1), 10);
    expect(costs.get('errors')!.mode).toBe('code');
  });

  it('does not count a shared section as a duplicate placement', () => {
    // Telemetry is walked once per mode but sits in exactly one place in the tree.
    expect(costs.get('errors')!.placements).toBe(1);
    const metrics = scoreScheme(scheme, ds, []);
    expect(metrics.duplicated).toEqual([]);
    expect(metrics.totalPlacements).toBe(3);
  });

  it('still counts a genuine duplicate across modes', () => {
    const dup = parseScheme(
      [...HEAD, '# Features [mode=code]', '- Errors -> errors', '# Agents [mode=agent]', '- Errors -> errors'].join('\n'),
    );
    expect(destinationCosts(dup, ds).get('errors')!.placements).toBe(2);
  });
});

describe('mode switcher in the results analysis', () => {
  const scenario = parseScenario('---\nid: s1\npersona: p\n---\n## Find configs\ntargets: configs\n');
  const shared = parseScenario('---\nid: s2\npersona: p\n---\n## Find errors\ntargets: errors\n');

  function session(id: string): StudySession {
    return {
      id,
      participant_label: null,
      scheme_id: 'm',
      started_at: '2026-08-18T00:00:00.000Z',
      finished_at: '2026-08-18T00:05:00.000Z',
      user_agent: 'test', ld_usage: null, task_order: [], survey: null, survey_confusing: null,
    };
  }
  let seq = 0;
  function ev(kind: StudyEvent['kind'], nodePath: string, destId: string | null, scenarioId: string): StudyEvent {
    seq += 1;
    return {
      session_id: 's1',
      scenario_id: scenarioId,
      task_index: 0,
      seq,
      kind,
      node_path: nodePath,
      destination_id: destId,
      depth: 1,
      ts: new Date(Date.UTC(2026, 7, 18, 0, 0, seq)).toISOString(),
    };
  }

  it('credits reaching for the switcher when the answer is exclusive to that mode', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [
        ev('start', '', null, 's1'),
        ev('mode', 'Agents', null, 's1'),
        ev('click', 'Agents', null, 's1'),
        ev('submit', 'Agents / Configs', 'configs', 's1'),
      ],
    };
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.firstClickRate).toBe(1);
  });

  it('does not credit a switch when the answer was in a shared section all along', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [
        ev('start', '', null, 's2'),
        ev('mode', 'Agents', null, 's2'),
        ev('click', 'Telemetry', null, 's2'),
        ev('submit', 'Telemetry / Errors', 'errors', 's2'),
      ],
    };
    const [outcome] = analyze(results, [scheme], [shared]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.firstClickRate).toBe(0);
  });
});


describe('mode-scoped items', () => {
  // Mirrors today's Telemetry: the section is in both modes, but Sessions,
  // Errors and Logs disappear in agent mode.
  const scheme = parseScheme(
    [
      ...HEAD,
      '# Features [mode=code]',
      '- Flags -> flags',
      '# Agents [mode=agent]',
      '- Configs -> configs',
      '# Telemetry',
      '- Sessions [mode=code] -> sessions',
      '- Errors [mode=code] -> errors',
      '- Alerts -> alerts',
    ].join('\n'),
  );
  const telemetry = scheme.sections[2];
  const ds = new Map(
    ['sessions', 'errors', 'alerts', 'flags', 'configs'].map((id) => [
      id,
      { id, label: id, routePattern: null, kind: 'route' as const, owner: null, gated: false, source: 'generated' as const },
    ]),
  );

  it('hides code-only items when the agent mode is active', () => {
    expect(visibleChildren(telemetry, 'code').map((c) => c.label)).toEqual(['Sessions', 'Errors', 'Alerts']);
    expect(visibleChildren(telemetry, 'agent').map((c) => c.label)).toEqual(['Alerts']);
  });

  it('returns every child when the scheme has no switcher at all', () => {
    expect(visibleChildren(telemetry, null).map((c) => c.label)).toHaveLength(3);
  });

  it('scans only what is on screen, so the shared item is cheaper in agent mode', () => {
    const costs = destinationCosts(scheme, ds);
    // Alerts is reachable in both modes. Agent mode shows one item in Telemetry
    // rather than three, but costs a switch, so code mode still wins overall.
    expect(costs.get('alerts')!.mode).toBe('code');
    expect(costs.get('alerts')!.cost).toBeCloseTo(scan(2) + 1 + scan(3), 10);
  });

  it('reaches a code-only item without a switch', () => {
    const costs = destinationCosts(scheme, ds);
    expect(costs.get('sessions')!.mode).toBe('code');
    expect(costs.get('sessions')!.clicks).toBe(1);
  });

  it('reports the narrower agent-mode list in the breadth profile', () => {
    const metrics = scoreScheme(scheme, ds, []);
    const level1 = metrics.breadth.find((b) => b.depth === 1)!;
    // Telemetry contributes 3 in code mode and 1 in agent mode.
    expect(level1.max).toBe(3);
  });
});
