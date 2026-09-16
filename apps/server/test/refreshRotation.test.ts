import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rotateRefreshToken, type RefreshRotationDependencies } from '../src/services/refreshRotation';

describe('rotateRefreshToken', () => {
  test('allows exactly one winner and keeps its successor usable after a concurrent loser', async () => {
    let available = true;
    let revokedAt: Date | null = null;
    const created: string[] = [];
    let familyRevoked = false;
    const dependencies: RefreshRotationDependencies = {
      transaction: async (operation) => operation({
        inspect: async () => ({ userId: 'user-1', familyId: 'family-1', revokedAt, expiresAt: new Date(3000) }),
        consume: async ({ userId, now }) => {
          if (!available || userId !== 'user-1' || now.getTime() !== 1000) return 0;
          available = false;
          revokedAt = now;
          return 1;
        },
        findUser: async () => ({ id: 'user-1', email: 'user@example.test' }),
        revokeFamily: async () => { familyRevoked = true; },
        create: async ({ jti }) => { created.push(jti); },
      }),
    };
    const base = { currentJti: 'old', userId: 'user-1', nextExpiresAt: new Date(2000), now: new Date(1000) };

    const results = await Promise.all([
      rotateRefreshToken(dependencies, { ...base, nextJti: 'next-1' }),
      rotateRefreshToken(dependencies, { ...base, nextJti: 'next-2' }),
    ]);

    assert.equal(results.filter((result) => result.status === 'rotated').length, 1);
    assert.equal(results.filter((result) => result.status === 'concurrent').length, 1);
    assert.equal(created.length, 1);
    assert.equal(familyRevoked, false);
  });

  test('does not mint a token when conditional consumption fails', async () => {
    let created = false;
    const result = await rotateRefreshToken({
      transaction: async (operation) => operation({
        inspect: async () => ({ userId: 'user-1', familyId: 'family-1', revokedAt: null, expiresAt: new Date(3000) }),
        consume: async () => 0,
        revokeFamily: async () => undefined,
        findUser: async () => ({ id: 'user-1', email: 'user@example.test' }),
        create: async () => { created = true; },
      }),
    }, {
      currentJti: 'old', userId: 'wrong-user', nextJti: 'next', nextExpiresAt: new Date(2000), now: new Date(1000),
    });

    assert.equal(result.status, 'invalid');
    assert.equal(created, false);
  });

  test('replaying a consumed ancestor revokes its successor family', async () => {
    const tokens = new Map([
      ['old', { userId: 'user-1', familyId: 'family-1', revokedAt: null as Date | null, expiresAt: new Date(3000) }],
    ]);
    const dependencies: RefreshRotationDependencies = {
      transaction: async (operation) => operation({
        inspect: async (jti) => tokens.get(jti) ?? null,
        consume: async ({ jti, now }) => {
          const token = tokens.get(jti);
          if (!token || token.revokedAt) return 0;
          token.revokedAt = now;
          return 1;
        },
        revokeFamily: async (familyId, now) => {
          tokens.forEach((token) => { if (token.familyId === familyId) token.revokedAt = now; });
        },
        findUser: async () => ({ id: 'user-1', email: 'user@example.test' }),
        create: async ({ jti, familyId, expiresAt }) => {
          tokens.set(jti, { userId: 'user-1', familyId, revokedAt: null, expiresAt });
        },
      }),
    };
    const input = { currentJti: 'old', userId: 'user-1', nextJti: 'next', nextExpiresAt: new Date(3000), now: new Date(1000) };

    assert.equal((await rotateRefreshToken(dependencies, input)).status, 'rotated');
    assert.equal(tokens.get('next')?.revokedAt, null);
    assert.equal((await rotateRefreshToken(dependencies, { ...input, nextJti: 'retry-next', now: new Date(1500) })).status, 'concurrent');
    assert.equal(tokens.get('next')?.revokedAt, null);
    assert.equal((await rotateRefreshToken(dependencies, { ...input, nextJti: 'attacker-next', now: new Date(7000) })).status, 'invalid');
    assert.equal(tokens.get('next')?.revokedAt?.getTime(), 7000);
  });
});
