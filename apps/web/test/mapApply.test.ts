import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyMapWithBackup } from '../lib/mapApply';

describe('applyMapWithBackup', () => {
  test('does not send the destructive command when backup creation fails', async () => {
    let didApply = false;

    await assert.rejects(() => applyMapWithBackup({
      createBackup: async () => false,
      applyMap: async () => {
        didApply = true;
        return { ok: true };
      },
    }), /sauvegarde automatique a échoué/);

    assert.equal(didApply, false);
  });

  test('surfaces a rejected server acknowledgement', async () => {
    await assert.rejects(() => applyMapWithBackup({
      createBackup: async () => true,
      applyMap: async () => ({ ok: false, error: 'Application refusée.' }),
    }), /Application refusée/);
  });

  test('resolves only after backup and application succeed', async () => {
    const calls: string[] = [];

    await applyMapWithBackup({
      createBackup: async () => {
        calls.push('backup');
        return true;
      },
      applyMap: async () => {
        calls.push('apply');
        return { ok: true };
      },
    });

    assert.deepEqual(calls, ['backup', 'apply']);
  });
});
