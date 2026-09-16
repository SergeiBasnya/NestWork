import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SOCKET_QUOTAS, UserQuotaRegistry } from '../src/services/socketQuotas';

function registry() {
  return new UserQuotaRegistry({ maxSocketsPerUser: 4, idleTtlMs: 1_000, sweepEvery: 2, sweepLimit: 2 });
}

describe('UserQuotaRegistry', () => {
  test('shares a burst quota across all sockets of one user and isolates users', () => {
    const quotas = registry();
    assert.equal(quotas.allow('user-1', 'chat', 2, 1_000, 0), true);
    assert.equal(quotas.allow('user-1', 'chat', 2, 1_000, 1), true);
    assert.equal(quotas.allow('user-1', 'chat', 2, 1_000, 2), false);
    assert.equal(quotas.allow('user-2', 'chat', 2, 1_000, 2), true);
  });

  test('opens a fresh window at the boundary', () => {
    const quotas = registry();
    assert.equal(quotas.allow('user-1', 'map', 1, 1_000, 100), true);
    assert.equal(quotas.allow('user-1', 'map', 1, 1_000, 1_099), false);
    assert.equal(quotas.allow('user-1', 'map', 1, 1_000, 1_100), true);
  });

  test('caps active sockets while allowing a slot after disconnect', () => {
    const quotas = registry();
    for (let index = 1; index <= 4; index += 1) assert.equal(quotas.registerSocket('user-1', `s${index}`, 0), true);
    assert.equal(quotas.registerSocket('user-1', 's5', 0), false);
    quotas.unregisterSocket('user-1', 's2', 10);
    assert.equal(quotas.registerSocket('user-1', 's5', 11), true);
    assert.equal(quotas.activeSocketCount('user-1'), 4);
  });

  test('removes only idle users and bounds each cleanup pass', () => {
    const quotas = registry();
    ['u1', 'u2', 'u3'].forEach((user) => {
      quotas.registerSocket(user, `${user}-socket`, 0);
      quotas.unregisterSocket(user, `${user}-socket`, 0);
    });
    assert.equal(quotas.sweep(1_001, 2), 2);
    assert.equal(quotas.userCount(), 1);
  });

  test('bounds inspected entries even when an active user is first', () => {
    const quotas = new UserQuotaRegistry({ maxSocketsPerUser: 4, idleTtlMs: 1_000, sweepEvery: 10_000, sweepLimit: 2 });
    quotas.registerSocket('active', 'active-socket', 0);
    quotas.registerSocket('idle', 'idle-socket', 0);
    quotas.unregisterSocket('idle', 'idle-socket', 0);

    assert.equal(quotas.sweep(1_001, 1), 0);
    assert.equal(quotas.userCount(), 2);
    assert.equal(quotas.sweep(1_001, 2), 1);
  });

  test('rotates the bounded sweep past a permanently active prefix', () => {
    const quotas = new UserQuotaRegistry({ maxSocketsPerUser: 4, idleTtlMs: 1_000, sweepEvery: 10_000, sweepLimit: 2 });
    ['active-1', 'active-2', 'active-3'].forEach((user) => quotas.registerSocket(user, `${user}-socket`, 0));
    quotas.registerSocket('idle-after-prefix', 'idle-socket', 0);
    quotas.unregisterSocket('idle-after-prefix', 'idle-socket', 0);

    assert.equal(quotas.sweep(1_001, 2), 0);
    assert.equal(quotas.sweep(1_001, 2), 1);
    assert.equal(quotas.userCount(), 3);
  });

  test('allows a bounded fifteen-user WebRTC negotiation burst', () => {
    const quotas = registry();
    const { limit, windowMs } = SOCKET_QUOTAS.rtc;
    for (let index = 0; index < limit; index += 1) {
      assert.equal(quotas.allow('user-1', 'rtc', limit, windowMs, index), true);
    }
    assert.equal(quotas.allow('user-1', 'rtc', limit, windowMs, limit), false);
  });
});
