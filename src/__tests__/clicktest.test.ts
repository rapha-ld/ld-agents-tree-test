import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { collapseRepeats, scoreTask } from '../clicktest/harness/score';
import { parseTasks } from '../clicktest/harness/parseTasks';
import { cohortOf } from '../clicktest/harness/cohort';
import { TrailTracker } from '../clicktest/harness/trail';
import type { CtEvent, Task } from '../clicktest/harness/types';
import { DESTINATIONS, PAGE_SUBTITLE, SECTIONS } from '../clicktest/nav/data';
import { selectionFor } from '../clicktest/harness/selection';

const task: Task = {
  id: 't1',
  prompt: 'Find configs',
  start: { page: 'flags', open_sections: [] },
  target: ['configs'],
  success_paths: [
    ['section:agents', 'leaf:configs'],
    ['search:field', 'palette:configs'],
  ],
};

let seq = 0;
const ev = (kind: CtEvent['kind'], extra: Partial<CtEvent> = {}, ms = 0): CtEvent => ({
  session_id: 's',
  task_id: 't1',
  seq: seq++,
  kind,
  track_id: null,
  page: null,
  meta: null,
  ts: new Date(Date.UTC(2026, 9, 21, 0, 0, 0, ms)).toISOString(),
  ...extra,
});
const click = (id: string) => ev('click', { track_id: id });
const page = (p: string) => ev('page', { page: p });

describe('scoreTask', () => {
  it('scores an exact success path as success', () => {
    const events = [ev('task_start', { page: 'flags' }), click('section:agents'), click('leaf:configs'), page('configs'), ev('found', { page: 'configs' }, 4000)];
    const s = scoreTask(task, events);
    expect(s.outcome).toBe('success');
    expect(s.first_click_correct).toBe(true);
    expect(s.duration_ms).toBe(4000);
  });

  it('scores the confirmed selection, not the page left on screen', () => {
    const events = [
      ev('task_start'),
      click('section:agents'),
      click('leaf:configs'),
      page('configs'),
      click('rail:features'),
      page('flags'),
      ev('found', { page: 'flags', meta: { page: 'configs', selection: 'leaf:configs' } }),
    ];
    expect(scoreTask(task, events).final_page).toBe('configs');
  });

  it("counts a press on the target page's main button as part of a success", () => {
    const events = [ev('task_start'), click('section:agents'), click('leaf:configs'), page('configs'), click('cta:configs'), ev('found', { page: 'configs' })];
    expect(scoreTask(task, events).outcome).toBe('success');
  });

  it('scores the confirmed page after a changed answer, and counts the selections and search use', () => {
    const events = [
      ev('task_start'),
      click('search:field'),
      click('palette:graphs'),
      ev('select', { track_id: 'palette:graphs' }),
      page('graphs'),
      click('leaf:configs'),
      ev('select', { track_id: 'leaf:configs' }),
      page('configs'),
      ev('found', { page: 'configs' }),
    ];
    const s = scoreTask(task, events);
    expect(s.final_page).toBe('configs');
    expect(s.outcome).toBe('recovered');
    expect(s.selections).toBe(2);
    expect(s.used_search).toBe(true);
    expect(s.first_click_search).toBe(true);
  });

  it('collapses a mouse pick recorded twice (press and menu action)', () => {
    const events = [ev('task_start'), click('search:field'), click('palette:configs'), click('palette:configs'), page('configs'), ev('found', { page: 'configs' })];
    expect(scoreTask(task, events).outcome).toBe('success');
  });

  it('calls an off-path click that still ends on the target recovered', () => {
    const events = [ev('task_start'), click('section:experimentation'), click('section:agents'), click('leaf:configs'), page('configs'), ev('found', { page: 'configs' })];
    const s = scoreTask(task, events);
    expect(s.outcome).toBe('recovered');
    expect(s.first_click_correct).toBe(false);
  });

  it('calls ending on the wrong page a failure', () => {
    const events = [ev('task_start'), click('section:agents'), click('leaf:playgrounds'), page('playgrounds'), ev('found', { page: 'playgrounds' })];
    expect(scoreTask(task, events).outcome).toBe('failure');
  });

  it('keeps give-ups and timeouts apart from failures', () => {
    expect(scoreTask(task, [ev('task_start'), click('pinned:home'), ev('giveup')]).outcome).toBe('giveup');
    expect(scoreTask(task, [ev('task_start'), ev('timeout')]).outcome).toBe('timeout');
    expect(scoreTask(task, [ev('task_start'), click('pinned:home')]).outcome).toBe('incomplete');
  });

  it('counts going back to a page already left', () => {
    const events = [ev('task_start'), page('experiments'), page('flags'), page('configs'), page('experiments'), ev('found', { page: 'experiments' })];
    expect(scoreTask(task, events).backtracks).toBe(2);
  });

  it('ignores presses on nothing interactive', () => {
    const events = [ev('task_start'), ev('click', { track_id: null }), click('section:agents'), click('leaf:configs'), page('configs'), ev('found', { page: 'configs' })];
    expect(scoreTask(task, events).outcome).toBe('success');
  });
});

describe('collapseRepeats', () => {
  it('keeps order and drops only adjacent repeats', () => {
    expect(collapseRepeats(['a', 'a', 'b', 'a'])).toEqual(['a', 'b', 'a']);
  });
});

describe('parseTasks', () => {
  it('flattens scenarios into tasks tagged with their scenario', () => {
    const file = parseTasks(
      'scenarios:\n  - id: s\n    text: Story\n    tasks:\n      - {id: a, prompt: P, start: {page: home}, target: [flags], success_paths: [[leaf:flags]]}\n',
    );
    expect(file.tasks.map((t) => [t.id, t.scenario?.id])).toEqual([['a', 's']]);
  });
});

describe('clicktest/tasks.yaml', () => {
  const file = parseTasks(readFileSync(join(__dirname, '../../clicktest/tasks.yaml'), 'utf8'));
  const all = [...file.tasks, ...(file.sample_tasks ?? [])];
  const pages = new Set(Object.keys(DESTINATIONS));
  const sections = new Set(['shortcuts', ...SECTIONS.map((s) => s.id)]);

  it('parses', () => {
    expect(Array.isArray(file.tasks)).toBe(true);
  });

  it.each(all.map((t) => [t.id, t] as const))('%s points at real pages and sections', (_id, t) => {
    expect(pages.has(t.start.page)).toBe(true);
    t.target.forEach((p) => expect(pages.has(p)).toBe(true));
    (t.start.open_sections ?? []).forEach((s) => expect(sections.has(s)).toBe(true));
    expect(t.success_paths.length).toBeGreaterThan(0);
    for (const path of t.success_paths) {
      for (const step of path) {
        const [kind, id] = step.split(':');
        if (kind === 'section' || kind === 'rail') expect(sections.has(id)).toBe(true);
        if (kind === 'leaf') expect(pages.has(id)).toBe(true);
      }
    }
  });

  it('has 11 tasks across 5 scenarios, with the first impression and wrap-up set', () => {
    expect(file.tasks).toHaveLength(11);
    expect(new Set(file.tasks.map((t) => t.scenario?.id)).size).toBe(5);
    expect(file.first_impression?.seconds).toBe(10);
    expect(file.wrap_up?.map((q) => q.id)).toEqual(['can-do']);
    expect(file.follow_up?.probe?.at_or_below).toBe(4);
  });

  it('has unique ids', () => {
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });
});

describe('selectionFor', () => {
  it('turns pages, Create items, search results and page buttons into answers', () => {
    expect(selectionFor('leaf:optimization')).toMatchObject({ page: 'optimization', label: 'Optimization' });
    expect(selectionFor('cta:optimization')).toMatchObject({ page: 'optimization', label: 'Start optimization on Optimization' });
    expect(selectionFor('pinned:approvals')).toMatchObject({ page: 'approvals' });
    expect(selectionFor('create:flag')).toMatchObject({ page: 'flags', label: 'Flag in the Create menu' });
    expect(selectionFor('palette:sessions')).toMatchObject({ page: 'sessions' });
    expect(selectionFor('palette:shortcut-cleanup')).toMatchObject({ page: 'shortcut-cleanup' });
    expect(selectionFor('footer:connections')).toMatchObject({ page: 'connections', label: 'Connections' });
    expect(selectionFor('footer:profile')).toMatchObject({ label: 'Your profile' });
  });

  it('ignores clicks that only open or close something', () => {
    for (const id of ['section:agents', 'pinned:create', 'search:field', 'nav:collapse', 'cta:insights', 'project']) {
      expect(selectionFor(id)).toBeNull();
    }
  });
});

describe('TrailTracker', () => {
  it('ignores closing a section that started open, and counts reopening it as a step in', () => {
    const t = new TrailTracker('home');
    expect(t.click('section:features')).toBeNull();
    expect(t.route()).toEqual([]);
    expect(t.click('section:features')).toBeNull();
    expect(t.route()).toEqual(['section:features']);
    expect(t.click('section:features')?.kind).toBe('up');
  });

  it('keeps only the current route and logs a section switch', () => {
    const t = new TrailTracker('flags', []);
    t.click('section:features');
    t.click('leaf:flags');
    t.click('cta:flags');
    expect(t.route()).toEqual(['section:features', 'leaf:flags', 'cta:flags']);
    expect(t.click('section:agents')?.kind).toBe('section');
    expect(t.route()).toEqual(['section:agents']);
  });

  it('logs going up the tree and trims the trail', () => {
    const t = new TrailTracker('flags', []);
    t.click('section:agents');
    t.click('leaf:playgrounds');
    expect(t.click('section:agents')?.kind).toBe('up');
    expect(t.route()).toEqual(['section:agents']);
  });

  it('treats closing a section just opened as going up', () => {
    const t = new TrailTracker('flags', []);
    t.click('section:agents');
    expect(t.click('section:agents')?.kind).toBe('up');
    expect(t.route()).toEqual([]);
  });

  it('logs a change of method, from browsing to search', () => {
    const t = new TrailTracker('flags', []);
    t.click('section:agents');
    expect(t.click('search:field')?.kind).toBe('method');
    t.click('palette:configs');
    expect(t.route()).toEqual(['search:field', 'palette:configs']);
  });

  it('does not count a sibling page or a repeated menu pick', () => {
    const t = new TrailTracker('flags', []);
    t.click('section:agents');
    t.click('leaf:configs');
    expect(t.click('leaf:playgrounds')).toBeNull();
    t.click('pinned:create');
    t.click('create:ai-config');
    expect(t.click('create:ai-config')).toBeNull();
    expect(t.backtracks.map((b) => b.kind)).toEqual(['method']);
  });

  it('logs coming back to a page already left', () => {
    const t = new TrailTracker('flags', []);
    t.visit('configs');
    expect(t.visit('flags')?.kind).toBe('revisit');
  });
});

describe('scoreTask backtrack kinds', () => {
  it('counts each kind', () => {
    const events = [ev('task_start'), click('section:experimentation'), click('section:agents'), click('leaf:playgrounds'), page('playgrounds'), click('search:field'), click('palette:configs'), page('configs'), ev('found', { page: 'configs' })];
    const s = scoreTask(task, events);
    expect(s.backtrack_kinds).toEqual({ section: 1, up: 0, method: 1, revisit: 0 });
    expect(s.backtracks).toBe(2);
  });
});

describe('page subtitles', () => {
  const file = parseTasks(readFileSync(join(__dirname, '../../clicktest/tasks.yaml'), 'utf8'));
  // Words too common to give a page away.
  const COMMON = new Set(
    'a an the and or of to in on for with by as at is are be it its this that these you your yours so if from each every how what which who where would can do does any all some one before while about into than them their they has have'.split(' '),
  );
  const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');
  const words = (text: string) =>
    text
      .toLowerCase()
      .replace(/[’']/g, "'")
      .split(/[^a-z0-9'/%-]+/)
      .flatMap((w) => w.split('-'))
      .map((w) => w.replace(/'(s|d|re|ve|ll)$/, ''))
      .filter((w) => w && !COMMON.has(w));
  const taskText = file.tasks.flatMap((t) => [t.prompt, t.scenario?.text ?? '']).join(' ');
  const banned = new Set(words(taskText).map(stem));
  // Irregular forms the stemmer misses.
  for (const extra of ['broke', 'broken', 'saw', 'seen', 'went', 'gone']) banned.add(extra);

  it('covers every page', () => {
    for (const page of Object.keys(DESTINATIONS)) expect(PAGE_SUBTITLE[page], page).toBeTruthy();
  });

  it.each(Object.entries(PAGE_SUBTITLE))('%s shares no word with any task or scenario', (_page, line) => {
    const clashes = words(line).filter((w) => banned.has(stem(w)) || banned.has(w));
    expect(clashes).toEqual([]);
  });
});

describe('cohortOf', () => {
  it('reads trial, pilot and main runs from the pid', () => {
    expect(cohortOf('TEST-sruthy')).toBe('trial');
    expect(cohortOf('discard-probe')).toBe('trial');
    expect(cohortOf('PILOT-ux-kristi')).toBe('pilot');
    expect(cohortOf('ui-48213')).toBe('main');
    expect(cohortOf(null)).toBe('main');
  });
});
