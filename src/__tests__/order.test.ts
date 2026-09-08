import { describe, expect, it } from 'vitest';
import { parseScenario } from '../parse/scenario';
import { parseScheme } from '../parse/scheme';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mirrors src/data.ts: glob then sort by path.
const dir = join(process.cwd(), 'scenarios');
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
const loaded = files.map((f) => parseScenario(readFileSync(join(dir, f), 'utf8'), f));

describe('menus', () => {
  const schemeDir = join(process.cwd(), 'schemes');
  const menus = readdirSync(schemeDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseScheme(readFileSync(join(schemeDir, f), 'utf8'), f));

  it('has no section that is both bound to a page and has children', () => {
    // The report tells a pick apart from a section opening by whether the click
    // carries a destination id. A section that had both would be ambiguous, and
    // directness would silently start counting the wrong thing.
    for (const menu of menus) {
      const walk = (nodes: typeof menu.sections) => {
        for (const node of nodes) {
          expect(
            node.destinationId !== null && node.children.length > 0,
            `${menu.id}: "${node.label}" is bound and has children`,
          ).toBe(false);
          walk(node.children);
        }
      };
      walk(menu.sections);
    }
  });
});

describe('scenario order', () => {
  it('is the authored order, matching the study doc', () => {
    expect(loaded.map((s) => s.id)).toEqual([
      'first-flag', 'kill-switch', 'agent-cost', 'sdk-events', 'agent-governance',
    ]);
  });
  it('has the task counts from the doc', () => {
    expect(loaded.map((s) => s.tasks.length)).toEqual([3, 3, 3, 1, 2]);
  });
  it('punctuates every question that overrides the default', () => {
    for (const scenario of loaded) {
      for (const task of scenario.tasks) {
        if (task.question) expect(task.question, task.question).toMatch(/[.?!]$/);
      }
    }
  });
  it('punctuates every task prompt', () => {
    // A content review caught eight prompts running on without a full stop.
    // Questions keep their question mark; everything else ends in a period.
    for (const scenario of loaded) {
      for (const task of scenario.tasks) {
        expect(task.prompt, task.prompt).toMatch(/[.?!]$/);
      }
    }
  });
  it('opens each scenario on the doc-order first task', () => {
    expect(loaded.map((s) => s.tasks[0].targets[0])).toEqual([
      'flags', 'flags', 'ai-monitoring', 'live', 'agentrouter.usage',
    ]);
  });
});
