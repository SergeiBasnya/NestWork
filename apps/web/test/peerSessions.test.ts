import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fanoutLocalTrack, orderedPeerTargets, reconcilePeerTargets, routePeerSignal } from '../lib/peerSessions';

describe('multi-peer session topology', () => {
  test('transitions from one to three nearby users in stable order', () => {
    assert.deepEqual(orderedPeerTargets('me', ['me', 'c', 'a', 'b'], ['c']), ['c']);
    const targets = orderedPeerTargets('me', ['me', 'c', 'a', 'b'], ['c', 'b', 'a']);
    assert.deepEqual(targets, ['a', 'b', 'c']);
    assert.deepEqual(reconcilePeerTargets(['c'], targets), { open: ['a', 'b'], close: [] });
  });

  test('routes a signal only to the session matching msg.from', () => {
    const sessions = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]]);
    assert.equal(routePeerSignal(sessions, 'b')?.id, 'b');
    assert.equal(routePeerSignal(sessions, 'unknown'), null);
  });

  test('far or leave closes only the target session', () => {
    assert.deepEqual(reconcilePeerTargets(['a', 'b', 'c'], ['a', 'c']), { open: [], close: ['b'] });
  });

  test('fans a local track replacement out to every near session', async () => {
    const calls: string[] = [];
    await fanoutLocalTrack([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async ({ id }) => { calls.push(id); });
    assert.deepEqual(calls.sort(), ['a', 'b', 'c']);
  });

  test('caps a dense room at fourteen remote peers', () => {
    const peers = Array.from({ length: 20 }, (_, index) => `peer-${String(index).padStart(2, '0')}`);
    assert.equal(orderedPeerTargets('me', peers, peers).length, 14);
  });

  test('keeps dense-room admission symmetric for every selected pair', () => {
    const users = Array.from({ length: 20 }, (_, index) => `peer-${String(index).padStart(2, '0')}`);
    for (const user of users) {
      const selected = orderedPeerTargets(user, users, users);
      for (const peer of selected) {
        assert.equal(orderedPeerTargets(peer, users, users).includes(user), true, `${user} ↔ ${peer}`);
      }
    }
  });

  test('always admits a sparse nearby pair among many distant online users', () => {
    const users = Array.from({ length: 20 }, (_, index) => `peer-${String(index).padStart(2, '0')}`);
    assert.deepEqual(orderedPeerTargets('peer-00', users, ['peer-10']), ['peer-10']);
    assert.deepEqual(orderedPeerTargets('peer-10', users, ['peer-00']), ['peer-00']);
  });
});
