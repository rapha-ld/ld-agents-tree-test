import { describe, expect, it } from 'vitest';
import { fetchAllRows } from '../pull/paged';

/** A fake page fetcher over a fixed row count, recording the ranges asked for. */
function fakeSource(total: number, pageSize: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const rows = Array.from({ length: total }, (_, i) => ({ id: i })).slice(from, to + 1);
    return { data: rows, error: null };
  };
  return { calls, fetchPage, pageSize };
}

describe('fetchAllRows', () => {
  it('assembles a result larger than one page', async () => {
    const { calls, fetchPage } = fakeSource(2500, 1000);
    const rows = await fetchAllRows(fetchPage, 1000);

    expect(rows).toHaveLength(2500);
    expect(rows[0]).toEqual({ id: 0 });
    expect(rows[2499]).toEqual({ id: 2499 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once more when the total is an exact multiple of the page size', async () => {
    const { calls, fetchPage } = fakeSource(2000, 1000);
    const rows = await fetchAllRows(fetchPage, 1000);

    expect(rows).toHaveLength(2000);
    // A full second page cannot be assumed to be the last one.
    expect(calls).toHaveLength(3);
  });

  it('stops without a second request when the first page is short', async () => {
    const { calls, fetchPage } = fakeSource(12, 1000);
    const rows = await fetchAllRows(fetchPage, 1000);

    expect(rows).toHaveLength(12);
    expect(calls).toHaveLength(1);
  });

  it('returns nothing for an empty table', async () => {
    const { fetchPage } = fakeSource(0, 1000);
    await expect(fetchAllRows(fetchPage, 1000)).resolves.toEqual([]);
  });

  /**
   * The failure that matters. Returning the rows gathered so far would hand the
   * report a plausible-looking subset and silently understate every figure.
   */
  it('throws on a mid-walk error rather than returning a short list', async () => {
    let call = 0;
    const fetchPage = async (from: number, to: number) => {
      call += 1;
      if (call === 2) return { data: null, error: { message: 'connection reset' } };
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null };
    };

    await expect(fetchAllRows(fetchPage, 1000)).rejects.toThrow('connection reset');
  });

  it('treats a null first page as an error, not as an empty table', async () => {
    const fetchPage = async () => ({ data: null, error: { message: 'permission denied' } });
    await expect(fetchAllRows(fetchPage, 1000)).rejects.toThrow('permission denied');
  });
});
