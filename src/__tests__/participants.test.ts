import { describe, expect, it } from 'vitest';
import { parseScenario } from '../parse/scenario';
import { parseScheme } from '../parse/scheme';
import type { StudyEvent, StudySession } from '../session';
import { analyze, summarizeSessions, type ResultsFile } from '../report/analyze';

const scheme = parseScheme(['---', 'id: demo', 'name: Demo', '---', '# A', '- X -> x', '  - Y -> y'].join('\n'));
const scenario = parseScenario('---\nid: s1\npersona: p\n---\n## Find Y\ntargets: y\n\n## Find X\ntargets: x\n');

function session(id: string, finished: string | null, label: string | null = null): StudySession {
  return {
    id,
    participant_label: label,
    scheme_id: 'demo',
    started_at: '2026-08-31T10:00:00.000Z',
    finished_at: finished,
    user_agent: 'test',
  };
}

let seq = 0;
function event(
  sessionId: string,
  kind: StudyEvent['kind'],
  taskIndex: number,
  destinationId: string | null,
  minute: number,
): StudyEvent {
  seq += 1;
  return {
    session_id: sessionId,
    scenario_id: 's1',
    task_index: taskIndex,
    seq,
    kind,
    node_path: destinationId ? 'A / X' : '',
    destination_id: destinationId,
    depth: destinationId ? 2 : 0,
    ts: `2026-08-31T10:${String(minute).padStart(2, '0')}:00.000Z`,
  };
}

describe('summarizeSessions', () => {
  it('describes a finished run', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1', '2026-08-31T10:05:00.000Z', 'Priya')],
      events: [
        event('s1', 'start', 0, null, 0),
        event('s1', 'submit', 0, 'y', 1),
        event('s1', 'start', 1, null, 2),
        event('s1', 'giveup', 1, null, 3),
      ],
    };

    const [row] = summarizeSessions(results, [scenario]);
    expect(row.label).toBe('Priya');
    expect(row.finished).toBe(true);
    expect(row.durationMs).toBe(5 * 60_000);
    expect(row.tasksCompleted).toBe(2);
    expect(row.successes).toBe(1);
    expect(row.giveups).toBe(1);
  });

  it('measures an abandoned run to its last event, not to a finish it never reached', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1', null)],
      events: [event('s1', 'start', 0, null, 0), event('s1', 'submit', 0, 'y', 2)],
    };

    const [row] = summarizeSessions(results, [scenario]);
    expect(row.finished).toBe(false);
    expect(row.durationMs).toBe(2 * 60_000);
    expect(row.tasksCompleted).toBe(1);
  });

  it('gives a null duration to a session that left no events', () => {
    const [row] = summarizeSessions({ sessions: [session('s1', null)], events: [] }, [scenario]);
    expect(row.durationMs).toBeNull();
    expect(row.tasksCompleted).toBe(0);
  });

  it('counts a wrong answer as a completed task but not a success', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1', '2026-08-31T10:05:00.000Z')],
      events: [event('s1', 'start', 0, null, 0), event('s1', 'submit', 0, 'x', 1)],
    };

    const [row] = summarizeSessions(results, [scenario]);
    expect(row.tasksCompleted).toBe(1);
    expect(row.successes).toBe(0);
  });
});

/**
 * Excluding a participant is done by filtering the results file before analyze,
 * so the guarantee worth testing is that analyze has no memory of them.
 */
describe('excluding a participant', () => {
  const twoPeople: ResultsFile = (() => {
    seq = 0;
    return {
      sessions: [
        session('good', '2026-08-31T10:05:00.000Z', 'Priya'),
        session('bad', '2026-08-31T10:05:00.000Z', 'Pilot run'),
      ],
      events: [
        event('good', 'start', 0, null, 0),
        event('good', 'submit', 0, 'y', 1),
        event('bad', 'start', 0, null, 0),
        event('bad', 'submit', 0, 'x', 1),
      ],
    };
  })();

  const drop = (file: ResultsFile, id: string): ResultsFile => ({
    sessions: file.sessions.filter((s) => s.id !== id),
    events: file.events.filter((e) => e.session_id !== id),
  });

  it('halves the success rate when both are counted', () => {
    const [outcome] = analyze(twoPeople, [scheme], [scenario]);
    expect(outcome.attempts).toBe(2);
    expect(outcome.successRate).toBe(0.5);
    expect(outcome.finishedSessions).toBe(2);
  });

  it('removes the excluded run from every figure', () => {
    const [outcome] = analyze(drop(twoPeople, 'bad'), [scheme], [scenario]);
    expect(outcome.attempts).toBe(1);
    expect(outcome.successRate).toBe(1);
    expect(outcome.finishedSessions).toBe(1);
    expect(outcome.startedSessions).toBe(1);
  });

  it('still lists the excluded person, so they can be put back', () => {
    // The participants table is built from the unfiltered file on purpose.
    expect(summarizeSessions(twoPeople, [scenario]).map((r) => r.label)).toEqual(['Priya', 'Pilot run']);
  });
});

describe('first-click reporting', () => {
  it('reports no data rather than zero when no click path can be read back', () => {
    seq = 0;
    const stale: ResultsFile = {
      sessions: [session('s1', '2026-08-31T10:05:00.000Z')],
      events: [
        event('s1', 'start', 0, null, 0),
        // A path whose labels no longer exist in the scheme, which is what a
        // renamed menu item leaves behind.
        { ...event('s1', 'click', 0, null, 1), node_path: 'Renamed section' },
        event('s1', 'submit', 0, 'y', 2),
      ],
    };

    const [outcome] = analyze(stale, [scheme], [scenario]);
    expect(outcome.firstClickKnown).toBe(0);
    expect(outcome.firstClickRate).toBeNull();
    // The answer itself is still credited; only the first move is unreadable.
    expect(outcome.successRate).toBe(1);
  });

  it('counts a wrong top-level answer against the first-click rate', () => {
    seq = 0;
    const results: ResultsFile = {
      sessions: [session('s1', '2026-08-31T10:05:00.000Z')],
      events: [event('s1', 'start', 0, null, 0), event('s1', 'submit', 0, 'nowhere', 1)],
    };

    const [outcome] = analyze(results, [scheme], [scenario]);
    expect(outcome.firstClickKnown).toBe(1);
    expect(outcome.firstClickRate).toBe(0);
  });
});

/**
 * Results files exported before the per-scenario question existed have no
 * `responses` key at all. Loading one must still work rather than throwing.
 */
describe('older results files', () => {
  it('analyzes a file with no responses key', () => {
    seq = 0;
    const legacy = {
      sessions: [session('s1', '2026-08-31T10:05:00.000Z', 'Priya')],
      events: [event('s1', 'start', 0, null, 0), event('s1', 'submit', 0, 'y', 1)],
    } as ResultsFile;

    const [outcome] = analyze(legacy, [scheme], [scenario]);
    expect(outcome.successRate).toBe(1);
    expect(summarizeSessions(legacy, [scenario])).toHaveLength(1);
  });
});
