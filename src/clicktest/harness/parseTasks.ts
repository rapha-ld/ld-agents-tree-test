// Parsing and ordering for clicktest/tasks.yaml, with no Vite-only imports, so
// the scoring script can use it under plain Node.

import yaml from 'js-yaml';

import type { Scenario, TaskFile } from './types';

export function parseTasks(text: string): TaskFile {
  const parsed = (yaml.load(text) ?? {}) as Partial<TaskFile> & { scenarios?: Scenario[] };
  const fromScenarios = (parsed.scenarios ?? []).flatMap((s) =>
    s.tasks.map((t) => ({ ...t, scenario: { id: s.id, text: s.text } })),
  );
  return {
    tasks: [...(parsed.tasks ?? []), ...fromScenarios],
    sample_tasks: parsed.sample_tasks ?? [],
    first_impression: parsed.first_impression,
    follow_up: parsed.follow_up,
    wrap_up: parsed.wrap_up ?? [],
  };
}
