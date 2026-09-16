import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PresenceRegistry, proximityKey, resolveRtcTarget, type PlayerState } from '../src/services/presence';

function player(socketId: string, userId: string, workspaceSlug = 'alpha'): PlayerState {
  return {
    socketId,
    userId,
    workspaceSlug,
    name: userId,
    x: 0,
    y: 0,
    direction: 'down',
    roomId: null,
    character: null,
    status: 'ONLINE',
    dnd: false,
    lockX: 0,
    lockY: 0,
  };
}

describe('PresenceRegistry', () => {
  test('keeps a user online until their last socket leaves', () => {
    const registry = new PresenceRegistry();
    assert.equal(registry.join(player('socket-1', 'user-1')).firstSocketForUser, true);
    assert.equal(registry.join(player('socket-2', 'user-1')).firstSocketForUser, false);
    assert.equal(registry.getUsers('alpha').length, 1);

    const secondaryLeave = registry.leave('socket-2');
    assert.equal(secondaryLeave?.userStillOnline, true);
    assert.equal(registry.getUsers('alpha').length, 1);

    const lastLeave = registry.leave('socket-1');
    assert.equal(lastLeave?.userStillOnline, false);
    assert.equal(registry.getUsers('alpha').length, 0);
  });

  test('promotes a valid remaining socket when the primary leaves', () => {
    const registry = new PresenceRegistry();
    registry.join(player('socket-1', 'user-1'));
    registry.join(player('socket-2', 'user-1'));

    const result = registry.leave('socket-1');

    assert.equal(result?.wasPrimary, true);
    assert.equal(result?.promoted?.socketId, 'socket-2');
    assert.equal(registry.isPrimary('socket-2'), true);
  });

  test('binds each socket to its own workspace', () => {
    const registry = new PresenceRegistry();
    registry.join(player('socket-alpha', 'user-1', 'alpha'));
    registry.join(player('socket-beta', 'user-1', 'beta'));

    assert.equal(registry.getSocket('socket-alpha')?.workspaceSlug, 'alpha');
    assert.equal(registry.getSocket('socket-beta')?.workspaceSlug, 'beta');
  });

  test('keeps a turn-in-place in the authoritative presence state', () => {
    const registry = new PresenceRegistry();
    registry.join(player('socket-1', 'user-1'));

    registry.updateSocket('socket-1', { direction: 'up' });

    assert.equal(registry.getUsers('alpha')[0]?.direction, 'up');
  });
});

describe('resolveRtcTarget', () => {
  test('allows only a near, non-DND pair of primary sockets', () => {
    const registry = new PresenceRegistry();
    registry.join(player('sender-primary', 'user-1'));
    registry.join(player('sender-secondary', 'user-1'));
    registry.join(player('target-primary', 'user-2'));
    const nearPairs = new Map([[proximityKey('alpha', 'user-1', 'user-2'), true]]);

    assert.equal(resolveRtcTarget(registry, nearPairs, 'sender-primary', 'user-2')?.socketId, 'target-primary');
    assert.equal(resolveRtcTarget(registry, nearPairs, 'sender-secondary', 'user-2'), null);
    assert.equal(resolveRtcTarget(registry, new Map(), 'sender-primary', 'user-2'), null);

    registry.updateUser('alpha', 'user-2', { dnd: true });
    assert.equal(resolveRtcTarget(registry, nearPairs, 'sender-primary', 'user-2'), null);
  });
});
