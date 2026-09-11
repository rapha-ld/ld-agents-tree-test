import { describe, expect, it } from 'vitest';
import { RETRY_DELAYS_MS, isTransient, withRetry } from '../session';

/** Never waits. The point of injecting sleep is that a test does not sit out the backoff. */
const nosleep = async () => {};

describe('isTransient', () => {
  it('treats a thrown fetch as worth retrying', () => {
    expect(isTransient(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('treats a SQLSTATE as settled', () => {
    // 23502 is a not-null violation: the same insert fails the same way forever.
    expect(isTransient({ code: '23502', message: 'null value in column "session_id"' })).toBe(false);
  });

  it('treats a permission error as settled', () => {
    expect(isTransient({ code: '42501', message: 'permission denied for table sessions' })).toBe(false);
  });

  it('retries a gateway error', () => {
    expect(isTransient({ code: '503', message: 'service unavailable' })).toBe(true);
  });
});

describe('withRetry', () => {
  it('stops at the first success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return { error: null };
    }, nosleep);
    expect(calls).toBe(1);
    expect(result.error).toBe(null);
  });

  it('recovers from a network blip', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return { error: null };
    }, nosleep);
    expect(calls).toBe(2);
    expect(result.error).toBe(null);
  });

  it('gives up after the last delay', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return { error: { message: 'network down' } };
    }, nosleep);
    expect(calls).toBe(RETRY_DELAYS_MS.length + 1);
    expect(result.error).toEqual({ message: 'network down' });
  });

  it('reports a constraint violation without trying again', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return { error: { code: '23502', message: 'null value in column "session_id"' } };
    }, nosleep);
    expect(calls).toBe(1);
    expect(result.error).toMatchObject({ code: '23502' });
  });
});
