import { describe, expect, it } from 'vitest';
import { parseScheme } from '../parse/scheme';
import { parseScenario } from '../parse/scenario';
import type { StudyEvent, StudySession } from '../session';
import { analyze, type ResultsFile } from '../report/analyze';

const scheme = parseScheme(
  ['---', 'id: demo', 'name: Demo', '---', '# A', '- X -> x', '  - Y -> y', '# B', '- Z -> z'].join('\n'),
);

const scenario = parseScenario('---\nid: s1\npersona: p\n---\n## Find Y\ntargets: y\n');

function session(id: string, schemeId = 'demo'): StudySession {
  return {
    id,
    participant_label: null,
    scheme_id: schemeId,
    started_at: '2026-08-18T00:00:00.000Z',
    finished_at: null,
    user_agent: 'test',
  };
}

let seq = 0;
function event(sessionId: string, kind: StudyEvent['kind'], nodePath: string, destinationId: string | null, ms: number): StudyEvent {
  seq += 1;
  return {
    session_id: sessionId,
    scenario_id: 's1',
    task_index: 0,
    seq,
    kind,
    node_path: nodePath,
    destination_id: destinationId,
    depth: nodePath === '' ? 0 : nodePath.split(' / ').length,
    ts: new Date(Date.UTC(2026, 7, 18, 0, 0, 0, ms)).toISOString(),
  };
}

describe('analyze', () => {
  it('scores a direct success and a give-up across two participants', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s-win'), session('s-lost')],
      events: [
        event('s-win', 'start', '', null, 0),
        event('s-win', 'click', 'A', null, 500),
        event('s-win', 'click', 'A / X', 'x', 900),
        event('s-win', 'submit', 'A / X / Y', 'y', 1400),
        event('s-lost', 'start', '', null, 0),
        event('s-lost', 'click', 'B', null, 800),
        event('s-lost', 'giveup', '', null, 2000),
      ],
    };

    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.schemeId).toBe('demo');
    expect(outcome.sessions).toBe(2);
    expect(outcome.attempts).toBe(2);
    expect(outcome.successRate).toBe(0.5);
    expect(outcome.directnessRate).toBe(0.5);
    expect(outcome.giveupRate).toBe(0.5);
    // A contains the answer, B does not.
    expect(outcome.firstClickRate).toBe(0.5);
    expect(outcome.medianMs).toBe(1700);
  });

  it('counts a backtracking success as a success but not as direct', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [
        event('s1', 'start', '', null, 0),
        event('s1', 'click', 'B', null, 300),
        event('s1', 'back', '', null, 600),
        event('s1', 'click', 'A', null, 900),
        event('s1', 'click', 'A / X', 'x', 1100),
        event('s1', 'submit', 'A / X / Y', 'y', 1500),
      ],
    };
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.directnessRate).toBe(0);
    // The first click went to B, which cannot reach the answer.
    expect(outcome.firstClickRate).toBe(0);
  });

  it('counts a confident wrong answer as an attempt but not a success', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [
        event('s1', 'start', '', null, 0),
        event('s1', 'click', 'B', null, 300),
        event('s1', 'submit', 'B / Z', 'z', 700),
      ],
    };
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.attempts).toBe(1);
    expect(outcome.successRate).toBe(0);
    expect(outcome.giveupRate).toBe(0);
  });

  it('credits a correct answer given at the top level with no drilling', () => {
    seq = 0;
    const topLevel = parseScheme('---\nid: demo\nname: Demo\n---\n# Y -> y\n# Z -> z\n');
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [event('s1', 'start', '', null, 0), event('s1', 'submit', 'Y', 'y', 400)],
    };
    const [outcome] = analyze(results, [topLevel], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.firstClickRate).toBe(1);
  });

  it('ignores events whose session or scenario is unknown', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [],
      events: [event('ghost', 'start', '', null, 0), event('ghost', 'submit', 'A / X / Y', 'y', 500)],
    };
    expect(analyze(results, [scheme], [scenario])).toEqual([]);
  });

  it('drops a task with no terminal event, since it was abandoned mid-flight', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [event('s1', 'start', '', null, 0), event('s1', 'click', 'A', null, 300)],
    };
    expect(analyze(results, [scheme], [scenario])).toEqual([]);
  });
});
