import { describe, expect, it } from 'vitest';
import type { EventKind, StudyEvent } from '../session';
import { classifyTask } from '../study/outcome';
import { shuffled } from '../study/Study';

let seq = 0;
const ev = (kind: EventKind, node_path = '', destination_id: string | null = null, sec = seq): StudyEvent => ({
  session_id: 's',
  scenario_id: 'online-store',
  task_index: 0,
  seq: ++seq,
  kind,
  node_path,
  destination_id,
  depth: node_path === '' ? 0 : node_path.split(' / ').length,
  ts: new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString(),
});

const answer = new Set(['support-bot.configure']);
const AM = 'Agent management';
const SB = `${AM} / Agents / Support bot`;

describe('classifyTask', () => {
  it('is direct when every click was on the way to the answer', () => {
    seq = 0;
    const events = [
      ev('start', '', null, 0),
      ev('click', AM),
      ev('click', `${AM} / Agents`, 'agents'),
      ev('click', SB),
      ev('click', `${SB} / Configure`, 'support-bot.configure'),
      ev('submit', `${SB} / Configure`, 'support-bot.configure', 12),
    ];
    const r = classifyTask(events, answer)!;
    expect(r.outcome).toBe('direct');
    expect(r.firstClick).toBe(AM);
    expect(r.timeMs).toBe(12000);
  });

  it('is indirect after opening a wrong branch', () => {
    seq = 0;
    const events = [
      ev('start'),
      ev('click', 'Feature management'),
      ev('click', AM),
      ev('click', `${AM} / Agents`, 'agents'),
      ev('click', SB),
      ev('submit', `${SB} / Configure`, 'support-bot.configure'),
    ];
    const r = classifyTask(events, answer)!;
    expect(r.outcome).toBe('indirect');
    expect(r.firstClick).toBe('Feature management');
  });

  it('is indirect after closing a section', () => {
    seq = 0;
    const events = [ev('start'), ev('click', AM), ev('back', AM), ev('click', AM), ev('submit', `${SB} / Configure`, 'support-bot.configure')];
    expect(classifyTask(events, answer)!.outcome).toBe('indirect');
  });

  it('is a fail on a wrong answer and a skip on a skip', () => {
    seq = 0;
    expect(classifyTask([ev('start'), ev('submit', `${AM} / Insights`, 'ai-monitoring')], answer)!.outcome).toBe('fail');
    expect(classifyTask([ev('start'), ev('giveup')], answer)!.outcome).toBe('skip');
  });

  it('is null until the task ends', () => {
    expect(classifyTask([ev('start'), ev('click', AM)], answer)).toBeNull();
  });
});

describe('shuffled', () => {
  it('returns every task exactly once', () => {
    const order = shuffled(11);
    expect([...order].sort((a, b) => a - b)).toEqual([...Array(11).keys()]);
  });
  it('is not always the authored order', () => {
    const seen = new Set(Array.from({ length: 20 }, () => shuffled(11).join(',')));
    expect(seen.size).toBeGreaterThan(1);
  });
});
