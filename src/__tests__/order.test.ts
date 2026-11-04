import { describe, expect, it } from 'vitest';
import { parseScenario } from '../parse/scenario';
import { parseScheme } from '../parse/scheme';
import type { SchemeNode } from '../parse/types';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const load = <T>(dir: string, parse: (src: string, f: string) => T) =>
  readdirSync(join(process.cwd(), dir))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parse(readFileSync(join(process.cwd(), dir, f), 'utf8'), f));

const scenarios = load('scenarios', parseScenario);
const menus = load('schemes', parseScheme);

function ids(nodes: SchemeNode[], out = new Set<string>()) {
  for (const node of nodes) {
    if (node.destinationId) out.add(node.destinationId);
    ids(node.children, out);
  }
  return out;
}

describe('agents study content', () => {
  it('has one scenario with all 11 tasks', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['online-store']);
    expect(scenarios[0].tasks).toHaveLength(11);
  });

  it('has Tree A and Tree B', () => {
    expect(menus.map((m) => m.id)).toEqual(['tree-a', 'tree-b']);
  });

  it('gives every task a correct answer in both trees', () => {
    for (const menu of menus) {
      const placed = ids(menu.sections);
      for (const task of scenarios[0].tasks) {
        expect(
          task.targets.some((t) => placed.has(t)),
          `${menu.id} has no target for "${task.prompt}"`,
        ).toBe(true);
      }
    }
  });

  it('keeps the shared sections identical across trees', () => {
    const [a, b] = menus;
    for (const label of ['Feature management', 'Experimentation', 'Observability', 'Audiences', 'Measurement']) {
      expect(a.sections.find((s) => s.label === label)).toEqual(b.sections.find((s) => s.label === label));
    }
  });

  it('keeps answer labels out of task wording', () => {
    const banned =
      /\b(configure|test|release|monitor|optimi[sz]e|variations?|targeting|monitoring|playgrounds?|optimization|graphs?|judges?|evaluations?|insights?|library|agents?|errors?)\b/i;
    for (const task of scenarios[0].tasks) {
      expect(task.prompt.replace(/Select the page you.d try first\./, ''), task.prompt).not.toMatch(banned);
    }
  });

  it('punctuates every task prompt', () => {
    for (const task of scenarios[0].tasks) expect(task.prompt, task.prompt).toMatch(/[.?!]$/);
  });
});
