import { describe, expect, it } from 'vitest';
import { parseScheme } from '../parse/scheme';
import { parseScenario } from '../parse/scenario';
import { splitFrontmatter } from '../parse/frontmatter';

describe('splitFrontmatter', () => {
  it('reads yaml frontmatter and returns the remaining body', () => {
    const { data, body } = splitFrontmatter('---\nid: x\nweight: 2\n---\nhello\n');
    expect(data).toEqual({ id: 'x', weight: 2 });
    expect(body).toBe('hello\n');
  });

  it('treats a document with no frontmatter as all body', () => {
    const { data, body } = splitFrontmatter('# just markdown');
    expect(data).toEqual({});
    expect(body).toBe('# just markdown');
  });

  it('handles folded block scalars, which the scheme files use for notes', () => {
    const { data } = splitFrontmatter('---\nid: x\nname: X\nnotes: >\n  line one\n  line two\n---\n');
    expect(data.notes).toBe('line one line two\n');
  });
});

describe('parseScheme', () => {
  const src = [
    '---',
    'id: demo',
    'name: Demo',
    '---',
    '',
    '# Features',
    '- Flags -> flags',
    '  - Targeting [tab] -> flag.targeting',
    '- Segments -> segments',
    '',
    '# Observe [collapsed]',
    '- Errors -> errors',
  ].join('\n');

  it('builds the section and bullet hierarchy', () => {
    const scheme = parseScheme(src);
    expect(scheme.id).toBe('demo');
    expect(scheme.sections.map((s) => s.label)).toEqual(['Features', 'Observe']);
    expect(scheme.sections[0].children.map((c) => c.label)).toEqual(['Flags', 'Segments']);
    expect(scheme.sections[0].children[0].children[0].label).toBe('Targeting');
  });

  it('records reveal modifiers on both sections and bullets', () => {
    const scheme = parseScheme(src);
    expect(scheme.sections[0].reveal).toBe('visible');
    expect(scheme.sections[1].reveal).toBe('collapsed');
    expect(scheme.sections[0].children[0].children[0].reveal).toBe('tab');
  });

  it('binds destinations and leaves unbound containers null', () => {
    const scheme = parseScheme(src);
    expect(scheme.sections[0].destinationId).toBeNull();
    expect(scheme.sections[0].children[0].destinationId).toBe('flags');
  });

  it('allows a bound section heading, which a flat scheme needs', () => {
    const scheme = parseScheme('---\nid: f\nname: F\n---\n# Flags -> flags\n');
    expect(scheme.sections[0].destinationId).toBe('flags');
    expect(scheme.sections[0].isSection).toBe(true);
  });

  it('rejects an unknown reveal modifier rather than silently ignoring it', () => {
    expect(() => parseScheme('---\nid: a\nname: A\n---\n# S\n- X [wiggle] -> x\n')).toThrow(/Unknown reveal modifier/);
  });

  it('rejects odd indentation', () => {
    expect(() => parseScheme('---\nid: a\nname: A\n---\n# S\n- X -> x\n   - Y -> y\n')).toThrow(/multiple of two/);
  });

  it('rejects a bullet indented past its parent', () => {
    expect(() => parseScheme('---\nid: a\nname: A\n---\n# S\n    - Y -> y\n')).toThrow(/indented past its parent/);
  });

  it('requires id and name', () => {
    expect(() => parseScheme('---\nname: A\n---\n# S\n')).toThrow(/missing `id`/);
    expect(() => parseScheme('---\nid: a\n---\n# S\n')).toThrow(/missing `name`/);
  });

  it('requires at least one section', () => {
    expect(() => parseScheme('---\nid: a\nname: A\n---\n')).toThrow(/no `#` sections/);
  });
});

describe('parseScenario', () => {
  const src = [
    '---',
    'id: demo',
    'weight: 3',
    'persona: A new engineer',
    '---',
    '',
    'Some shared context.',
    '',
    '## Create a flag',
    'targets: flags.new',
    'accept: flags',
    '',
    '## Target it',
    'targets: flag.targeting',
  ].join('\n');

  it('reads frontmatter, context, and tasks', () => {
    const scenario = parseScenario(src);
    expect(scenario.id).toBe('demo');
    expect(scenario.weight).toBe(3);
    expect(scenario.persona).toBe('A new engineer');
    expect(scenario.context).toBe('Some shared context.');
    expect(scenario.tasks).toHaveLength(2);
  });

  it('parses target and accept lists', () => {
    const scenario = parseScenario(src);
    expect(scenario.tasks[0]).toEqual({ prompt: 'Create a flag', targets: ['flags.new'], accept: ['flags'] });
    expect(scenario.tasks[1]).toEqual({ prompt: 'Target it', targets: ['flag.targeting'], accept: [] });
  });

  it('defaults weight to 1', () => {
    const scenario = parseScenario('---\nid: a\npersona: p\n---\n## T\ntargets: x\n');
    expect(scenario.weight).toBe(1);
  });

  it('rejects a task with no targets', () => {
    expect(() => parseScenario('---\nid: a\npersona: p\n---\n## T\n')).toThrow(/has no `targets:`/);
  });

  it('rejects targets that appear before any task heading', () => {
    expect(() => parseScenario('---\nid: a\npersona: p\n---\ntargets: x\n')).toThrow(/before any `##`/);
  });
});


describe('a task can override the label question', () => {
  it('reads `question:` and leaves the others on the default', () => {
    const scenario = parseScenario(
      [
        '---', 'id: s', 'persona: P', '---', 'Ctx.', '',
        '## Plain task.', 'targets: a', '',
        '## A situation that reads better with its own question.',
        'question: Where do you go to review it?', 'targets: b',
      ].join('\n'),
      's.md',
    );
    expect(scenario.tasks[0].question).toBeUndefined();
    expect(scenario.tasks[1].question).toBe('Where do you go to review it?');
  });

  it('rejects a `question:` line before any task', () => {
    expect(() =>
      parseScenario(['---', 'id: s', 'persona: P', '---', 'question: Too early?', '## T.', 'targets: a'].join('\n'), 's.md'),
    ).toThrow(/question:/);
  });
});
