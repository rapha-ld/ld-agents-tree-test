import { describe, expect, it } from 'vitest';
import { parseScenario } from '../parse/scenario';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mirrors src/data.ts: glob then sort by path.
const dir = join(process.cwd(), 'scenarios');
const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
const loaded = files.map((f) => parseScenario(readFileSync(join(dir, f), 'utf8'), f));

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
