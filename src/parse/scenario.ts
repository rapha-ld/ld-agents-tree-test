import type { Scenario, Task } from './types';
import { splitFrontmatter } from './frontmatter';

function parseIdList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseScenario(src: string, filename = '<scenario>'): Scenario {
  const { data, body } = splitFrontmatter(src);
  const id = typeof data.id === 'string' ? data.id : undefined;
  const persona = typeof data.persona === 'string' ? data.persona : undefined;
  if (!id) throw new Error(`${filename}: scenario frontmatter is missing \`id\``);
  if (!persona) throw new Error(`${filename}: scenario frontmatter is missing \`persona\``);
  const weight = typeof data.weight === 'number' ? data.weight : 1;

  const lines = body.split('\n');
  const contextLines: string[] = [];
  const tasks: Task[] = [];
  let current: Task | null = null;

  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = { prompt: heading[1].trim(), targets: [], accept: [] };
      tasks.push(current);
      continue;
    }

    const targets = /^targets:\s*(.*)$/.exec(line);
    if (targets) {
      if (!current) throw new Error(`${filename}: \`targets:\` appears before any \`##\` task heading`);
      current.targets = parseIdList(targets[1]);
      continue;
    }

    const question = /^question:\s*(.*)$/.exec(line);
    if (question) {
      if (!current) throw new Error(`${filename}: \`question:\` appears before any \`##\` task heading`);
      const text = question[1].trim();
      if (text !== '') current.question = text;
      continue;
    }

    const accept = /^accept:\s*(.*)$/.exec(line);
    if (accept) {
      if (!current) throw new Error(`${filename}: \`accept:\` appears before any \`##\` task heading`);
      current.accept = parseIdList(accept[1]);
      continue;
    }

    if (!current) contextLines.push(line);
  }

  if (tasks.length === 0) throw new Error(`${filename}: scenario has no \`##\` task headings`);
  for (const task of tasks) {
    if (task.targets.length === 0) {
      throw new Error(`${filename}: task "${task.prompt}" has no \`targets:\` line`);
    }
  }

  return { id, persona, weight, context: contextLines.join('\n').trim(), tasks };
}
