import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AuthGeneration,
  disableSession,
  enableSession,
  isSessionDisabled,
  purgeLegacyAuthStorage,
  retryOnceOnConflict,
  runAuthBootstrap,
} from '../lib/authState';

describe('memory-only auth state', () => {
  test('purges legacy storage without reading or deserializing it', () => {
    let read = false;
    const removed: string[] = [];
    const storage = {
      removeItem: (key: string) => removed.push(key),
      getItem: () => { read = true; return 'stolen-token'; },
    };
    purgeLegacyAuthStorage(storage);
    assert.deepEqual(removed, ['nestwork-auth']);
    assert.equal(read, false);
  });

  test('uses a non-secret tombstone to disable bootstrap until explicit login', () => {
    const values = new Map<string, string>();
    const reads: string[] = [];
    const storage = {
      getItem: (key: string) => { reads.push(key); return values.get(key) ?? null; },
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };

    disableSession(storage);
    assert.equal(isSessionDisabled(storage), true);
    assert.deepEqual(reads, ['nestwork-session-disabled']);
    assert.equal(reads.includes('nestwork-auth'), false);
    enableSession(storage);
    assert.equal(isSessionDisabled(storage), false);
  });

  test('bootstraps in refresh then /me order', async () => {
    const calls: string[] = [];
    const result = await runAuthBootstrap({
      generation: 0,
      isCurrent: () => true,
      refresh: async () => { calls.push('refresh'); return 'access'; },
      loadUser: async (token) => { calls.push(`me:${token}`); return { id: 'u1' }; },
      statusOf: () => undefined,
    });
    assert.deepEqual(calls, ['refresh', 'me:access']);
    assert.deepEqual(result, { status: 'authenticated', accessToken: 'access', user: { id: 'u1' } });
  });

  test('maps 401 to anonymous and a network failure to unavailable', async () => {
    const bootstrap = (status: number | undefined) => runAuthBootstrap({
      generation: 0,
      isCurrent: () => true,
      refresh: async () => { throw { status }; },
      loadUser: async () => ({ id: 'unused' }),
      statusOf: (error) => (error as { status?: number }).status,
    });
    assert.deepEqual(await bootstrap(401), { status: 'anonymous' });
    assert.deepEqual(await bootstrap(undefined), { status: 'unavailable' });
  });

  test('honours Retry-After and retries a 409 exactly once', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const result = await retryOnceOnConflict({
      request: async () => {
        attempts += 1;
        if (attempts === 1) throw { status: 409, retryAfter: '2' };
        return 'ok';
      },
      statusOf: (error) => (error as { status?: number }).status,
      retryAfterOf: (error) => (error as { retryAfter?: string }).retryAfter,
      sleep: async (milliseconds) => { delays.push(milliseconds); },
    });
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [2_000]);
  });

  test('does not commit a response that completes after logout', async () => {
    const clock = new AuthGeneration();
    let finishRefresh: ((token: string) => void) | undefined;
    const result = runAuthBootstrap({
      generation: clock.capture(),
      isCurrent: (value) => clock.isCurrent(value),
      refresh: () => new Promise<string>((resolve) => { finishRefresh = resolve; }),
      loadUser: async () => ({ id: 'u1' }),
      statusOf: () => undefined,
    });
    clock.invalidate();
    finishRefresh?.('late-token');
    assert.deepEqual(await result, { status: 'stale' });
  });
});
