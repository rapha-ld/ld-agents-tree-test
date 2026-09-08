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
    finished_at: '2026-08-18T00:10:00.000Z',
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
        // Sections start open, so a run is: pick a page, then confirm it. The
        // pick is a click carrying a destination id.
        event('s-win', 'start', '', null, 0),
        event('s-win', 'click', 'A / X / Y', 'y', 900),
        event('s-win', 'submit', 'A / X / Y', 'y', 1400),
        event('s-lost', 'start', '', null, 0),
        event('s-lost', 'click', 'B / Z', 'z', 800),
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

  it('counts a changed pick as a success but not as direct', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [
        event('s1', 'start', '', null, 0),
        // Picked the wrong page, then picked again. Both are clicks carrying a
        // destination id, which is what makes it two picks rather than one.
        event('s1', 'click', 'B / Z', 'z', 300),
        event('s1', 'click', 'A / X / Y', 'y', 1100),
        event('s1', 'submit', 'A / X / Y', 'y', 1500),
      ],
    };
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.directnessRate).toBe(0);
    // The first pick was in B, which cannot reach the answer.
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

  it('keeps a session that was restarted before finishing out of the rates', () => {
    seq = 0;
    const abandoned: StudySession = { ...session('s-quit'), finished_at: null };
    const results: ResultsFile = {
      sessions: [abandoned],
      events: [
        event('s-quit', 'start', '', null, 0),
        event('s-quit', 'click', 'A', null, 300),
        event('s-quit', 'submit', 'A / X / Y', 'y', 800),
      ],
    };

    // The correct answer here is deliberately ignored: the run never finished,
    // so it cannot inflate the success rate. It is still reported as a dropout,
    // because a scheme everyone abandons is the most important thing to see.
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.attempts).toBe(0);
    expect(outcome.successRate).toBeNull();
    expect(outcome.finishedSessions).toBe(0);
    expect(outcome.abandonedSessions).toBe(1);
  });

  it('ignores events whose session or scenario is unknown', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [],
      events: [event('ghost', 'start', '', null, 0), event('ghost', 'submit', 'A / X / Y', 'y', 500)],
    };
    expect(analyze(results, [scheme], [scenario])).toEqual([]);
  });

  it('reports per-scenario and whole-run time as medians across participants', () => {
    seq = 0;
    // Two participants on the same menu. One takes 1s on the task, the other 3s.
    const results: ResultsFile = {
      sessions: [session('a'), session('b')],
      events: [
        event('a', 'start', '', null, 0),
        event('a', 'submit', 'A / X / Y', 'y', 1000),
        event('b', 'start', '', null, 0),
        event('b', 'submit', 'A / X / Y', 'y', 3000),
      ],
    };
    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.medianMs).toBe(2000);
    // One task per scenario here, so the scenario total equals the task time and
    // the median across the two participants is the midpoint.
    expect(outcome.scenarioOutcomes).toHaveLength(1);
    expect(outcome.scenarioOutcomes[0].medianMs).toBe(2000);
    expect(outcome.scenarioOutcomes[0].successes).toBe(2);
    expect(outcome.medianRunMs).toBe(2000);
  });

  it('sums a participant\'s tasks into one scenario time rather than averaging them', () => {
    seq = 0;
    const twoTasks = parseScenario(
      '---\nid: s1\npersona: p\n---\n## Find Y\ntargets: y\n\n## Find Y again\ntargets: y\n',
    );
    const second = (kind: StudyEvent['kind'], nodePath: string, destId: string | null, ms: number): StudyEvent => ({
      ...event('a', kind, nodePath, destId, ms),
      task_index: 1,
    });
    const results: ResultsFile = {
      sessions: [session('a')],
      events: [
        event('a', 'start', '', null, 0),
        event('a', 'submit', 'A / X / Y', 'y', 1000),
        second('start', '', null, 5000),
        second('submit', 'A / X / Y', 'y', 7000),
      ],
    };
    const [outcome] = analyze(results, [scheme], [twoTasks]);
    // 1s on the first task plus 2s on the second.
    expect(outcome.scenarioOutcomes[0].medianMs).toBe(3000);
    expect(outcome.medianRunMs).toBe(3000);
    // The per-task median is still per task, not the total.
    expect(outcome.medianMs).toBe(1500);
  });

  it('drops a task with no terminal event, since it was abandoned mid-flight', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1')],
      events: [event('s1', 'start', '', null, 0), event('s1', 'click', 'A', null, 300)],
    };

    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.attempts).toBe(0);
    expect(outcome.tasks).toEqual([]);
    // The session itself reached the end, so it is not a dropout.
    expect(outcome.finishedSessions).toBe(1);
    expect(outcome.abandonedSessions).toBe(0);
  });

  /**
   * Partial runs reach the database but were previously invisible: analyze drops
   * any session without a finished_at, so an abandoned run counted for nothing.
   * These cover the dropout figures that surface them.
   */
  describe('dropout', () => {
    const unfinished = (id: string): StudySession => ({ ...session(id), finished_at: null });

    it('counts started, finished, and abandoned separately', () => {
      seq = 0;
      const results: ResultsFile = {
        sessions: [session('done-1'), session('done-2'), unfinished('quit-1')],
        events: [
          event('done-1', 'start', '', null, 0),
          event('done-1', 'submit', 'A / X / Y', 'y', 1000),
          event('done-2', 'start', '', null, 0),
          event('done-2', 'submit', 'A / X / Y', 'y', 1000),
          event('quit-1', 'start', '', null, 0),
        ],
      };

      const [outcome] = analyze(results, [scheme], [scenario]);
      expect(outcome.startedSessions).toBe(3);
      expect(outcome.finishedSessions).toBe(2);
      expect(outcome.abandonedSessions).toBe(1);
    });

    it('keeps an abandoned run out of the success rate', () => {
      seq = 0;
      const results: ResultsFile = {
        sessions: [session('done-1'), unfinished('quit-1')],
        events: [
          event('done-1', 'start', '', null, 0),
          event('done-1', 'submit', 'A / X / Y', 'y', 1000),
          // A wrong answer that must not drag the rate down, because this run
          // never finished.
          event('quit-1', 'start', '', null, 0),
          event('quit-1', 'submit', 'B / Z', 'z', 1000),
        ],
      };

      const [outcome] = analyze(results, [scheme], [scenario]);
      expect(outcome.attempts).toBe(1);
      expect(outcome.successRate).toBe(1);
    });

    it('reports the median number of tasks reached before quitting', () => {
      seq = 0;
      const twoTasks = parseScenario(
        '---\nid: s1\npersona: p\n---\n## Find Y\ntargets: y\n\n## Find Z\ntargets: z\n',
      );
      const secondTask = (sessionId: string, kind: StudyEvent['kind']): StudyEvent => ({
        ...event(sessionId, kind, 'B / Z', 'z', 500),
        task_index: 1,
      });

      const results: ResultsFile = {
        sessions: [unfinished('quit-early'), unfinished('quit-late')],
        events: [
          // Clicked around but never answered, so no task completed.
          event('quit-early', 'start', '', null, 0),
          event('quit-early', 'click', 'A', null, 100),
          // Answered the first task, gave up on the second, then left.
          event('quit-late', 'start', '', null, 0),
          event('quit-late', 'submit', 'A / X / Y', 'y', 200),
          secondTask('quit-late', 'giveup'),
        ],
      };

      const [outcome] = analyze(results, [scheme], [twoTasks]);
      expect(outcome.abandonedSessions).toBe(2);
      // Zero tasks and two tasks, so a median of one.
      expect(outcome.medianTasksBeforeAbandon).toBe(1);
    });

    it('reports no dropout median when every run finished', () => {
      seq = 0;
      const results: ResultsFile = {
        sessions: [session('done-1')],
        events: [event('done-1', 'start', '', null, 0), event('done-1', 'submit', 'A / X / Y', 'y', 1000)],
      };

      const [outcome] = analyze(results, [scheme], [scenario]);
      expect(outcome.abandonedSessions).toBe(0);
      expect(outcome.medianTasksBeforeAbandon).toBeNull();
    });
  });
});

describe('directness with every section open', () => {
  const scheme = parseScheme(
    `---\nid: m\nname: M\n---\n# Alpha\n- One -> one\n# Beta\n- Two -> two\n`,
    'm.md',
  );
  const scenario = parseScenario(`---\nid: s\npersona: P\n---\nCtx.\n\n## Find two.\ntargets: two\n`, 's.md');
  const session = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    participant_label: 'p',
    scheme_id: 'm',
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T00:01:00Z',
    user_agent: 'test',
  };
  const ev = (seq: number, kind: string, node_path: string, depth: number, destination_id: string | null = null) => ({
    session_id: session.id,
    scenario_id: 's',
    task_index: 0,
    seq,
    kind: kind as never,
    node_path,
    destination_id,
    depth,
    ts: '2026-01-01T00:00:0' + seq + 'Z',
  });

  it('counts a straight path as direct', () => {
    const [outcome] = analyze({ sessions: [session], events: [
      ev(1, 'start', '', 0),
      ev(2, 'click', 'Beta / Two', 2, 'two'),
      ev(3, 'submit', 'Beta / Two', 2, 'two'),
    ] }, [scheme], [scenario]);
    expect(outcome.directnessRate).toBe(1);
  });

  it('does not count picking one page and then another, even with no backtrack', () => {
    // Changing a pick leaves two clicks and no `back`, which is why absence of
    // `back` cannot carry this on its own.
    const [outcome] = analyze({ sessions: [session], events: [
      ev(1, 'start', '', 0),
      ev(2, 'click', 'Alpha / One', 2, 'one'),
      ev(3, 'click', 'Beta / Two', 2, 'two'),
      ev(4, 'submit', 'Beta / Two', 2, 'two'),
    ] }, [scheme], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(outcome.directnessRate).toBe(0);
  });
});
