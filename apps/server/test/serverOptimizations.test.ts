import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mapUnreadCountRows } from '../src/services/unreadCounts';
import { sendAuthorizedMessage } from '../src/services/sendMessage';
import { dmKeyFor } from '../src/lib/channelAccess';
import { SerialTaskQueue } from '../src/services/serialTaskQueue';

describe('unread aggregation mapping', () => {
  test('maps aggregate rows and normalizes driver numeric values', () => {
    const counts = mapUnreadCountRows([
      { channelId: 'general', unread: 4, unreadMentions: 2 },
      { channelId: 'dm', unread: 1, unreadMentions: 0 },
    ]);

    assert.equal(counts.unread.get('general'), 4);
    assert.equal(counts.mentions.get('general'), 2);
    assert.equal(counts.unread.get('dm'), 1);
    assert.equal(counts.mentions.get('missing') ?? 0, 0);
  });
});

test('DM keys are deterministic and scoped to their workspace', () => {
  assert.equal(dmKeyFor('workspace-1', 'b', 'a'), 'workspace-1|a|b');
  assert.notEqual(dmKeyFor('workspace-1', 'a', 'b'), dmKeyFor('workspace-2', 'a', 'b'));
});

test('serializes asynchronous tasks and continues after a rejection', async () => {
  const queue = new SerialTaskQueue();
  const calls: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const first = queue.run(async () => {
    calls.push('first:start');
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    calls.push('first:end');
  });
  const second = queue.run(async () => { calls.push('second'); throw new Error('expected'); });
  const third = queue.run(async () => { calls.push('third'); });
  await Promise.resolve();
  assert.deepEqual(calls, ['first:start']);
  releaseFirst?.();
  await first;
  await assert.rejects(second, /expected/);
  await third;
  assert.deepEqual(calls, ['first:start', 'first:end', 'second', 'third']);
});

describe('sendAuthorizedMessage', () => {
  test('does not store client bytes when channel authorization fails', async () => {
    let stored = false;
    const result = await sendAuthorizedMessage('user-1', {
      channelId: 'forbidden',
      body: '',
      image: 'data:image/png;base64,AAAA',
    }, {
      authorize: async () => null,
      storeImage: async () => {
        stored = true;
        return '/api/images/leak';
      },
      createMessage: async () => ({ id: 'message-1' }),
      publish: () => undefined,
    });

    assert.equal(result.ok, false);
    assert.equal(stored, false);
  });

  test('authorizes before storage and publishes only after persistence', async () => {
    const calls: string[] = [];
    const result = await sendAuthorizedMessage('user-1', {
      channelId: 'general',
      body: ' hello ',
      image: 'data:image/png;base64,AAAA',
    }, {
      authorize: async () => {
        calls.push('authorize');
        return { slug: 'alpha' };
      },
      storeImage: async () => {
        calls.push('store');
        return '/api/images/1';
      },
      createMessage: async (data) => {
        calls.push(`create:${data.body}`);
        return { id: 'message-1' };
      },
      publish: () => calls.push('publish'),
    });

    assert.deepEqual(calls, ['authorize', 'store', 'create:hello', 'publish']);
    assert.deepEqual(result, { ok: true, messageId: 'message-1' });
  });
});
