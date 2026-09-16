import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyMap } from '../src/services/applyMap';

describe('applyMap', () => {
  test('publishes the authoritative state only after replacement and re-read', async () => {
    const calls: string[] = [];
    const furniture = [{ id: 'new-id' }];

    await applyMap({
      replaceFurniture: async () => { calls.push('replace'); },
      readFurniture: async () => {
        calls.push('read');
        return furniture;
      },
      publishFurniture: (items) => {
        calls.push('publish');
        assert.equal(items, furniture);
      },
    });

    assert.deepEqual(calls, ['replace', 'read', 'publish']);
  });

  test('does not read or publish when the transaction fails', async () => {
    let didRead = false;
    let didPublish = false;

    await assert.rejects(() => applyMap({
      replaceFurniture: async () => { throw new Error('transaction failed'); },
      readFurniture: async () => {
        didRead = true;
        return [];
      },
      publishFurniture: () => { didPublish = true; },
    }), /transaction failed/);

    assert.equal(didRead, false);
    assert.equal(didPublish, false);
  });

  test('does not publish when the authoritative re-read fails', async () => {
    let didPublish = false;

    await assert.rejects(() => applyMap({
      replaceFurniture: async () => undefined,
      readFurniture: async () => { throw new Error('read failed'); },
      publishFurniture: () => { didPublish = true; },
    }), /read failed/);

    assert.equal(didPublish, false);
  });
});
