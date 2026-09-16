import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  collectOrphanImages,
  IMAGE_UNREFERENCED_SQL,
  IMAGE_GC_GRACE_MS,
  type ImageGcRepository,
} from '../src/services/imageGc';
import { storedImageId } from '../src/lib/images';

describe('image lifecycle GC', () => {
  test('repository contract protects FK and exact legacy URL references in both contexts', () => {
    assert.match(IMAGE_UNREFERENCED_SQL, /m\."imageId" = i\."id"/);
    assert.match(IMAGE_UNREFERENCED_SQL, /m\."imageUrl" = '\/api\/images\/' \|\| i\."id"/);
    assert.match(IMAGE_UNREFERENCED_SQL, /t\."previewImageId" = i\."id"/);
    assert.match(IMAGE_UNREFERENCED_SQL, /t\."preview" = '\/api\/images\/' \|\| i\."id"/);
  });

  test('uses the grace cutoff and performs lookup before a guarded delete', async () => {
    const calls: string[] = [];
    const now = new Date('2026-08-13T12:00:00.000Z');
    const repository: ImageGcRepository = {
      findUnreferencedCandidates: async (cutoff, limit) => {
        calls.push(`candidates:${cutoff.toISOString()}:${limit}`);
        return [{ id: 'failed-upload' }];
      },
      deleteUnreferenced: async (ids, cutoff) => {
        calls.push(`delete:${ids.join(',')}:${cutoff.toISOString()}`);
        return ids.length;
      },
    };

    assert.equal(await collectOrphanImages(repository, { now }), 1);
    const cutoff = new Date(now.getTime() - IMAGE_GC_GRACE_MS).toISOString();
    assert.deepEqual(calls, [
      `candidates:${cutoff}:25`,
      `delete:failed-upload:${cutoff}`,
    ]);
  });

  test('bounds a batch and tolerates a reference created before guarded delete', async () => {
    const candidates = Array.from({ length: 150 }, (_, index) => ({ id: `image-${index}` }));
    let requestedLimit = 0;
    let deletedIds: string[] = [];
    const repository: ImageGcRepository = {
      findUnreferencedCandidates: async (_cutoff, limit) => { requestedLimit = limit; return candidates.slice(0, limit); },
      // Simulate a concurrent relation on image-0: the guarded production
      // delete excludes it even though it was absent from the prior lookup.
      deleteUnreferenced: async (ids) => {
        deletedIds = ids.filter((id) => id !== 'image-0');
        return deletedIds.length;
      },
    };

    assert.equal(await collectOrphanImages(repository, { limit: 1_000 }), 99);
    assert.equal(requestedLimit, 100);
    assert.equal(deletedIds.length, 99);
    assert.equal(deletedIds.includes('image-0'), false);
  });

  test('candidate repository returns orphans directly so referenced oldest rows cannot starve the batch', async () => {
    const calls: string[] = [];
    const repository: ImageGcRepository = {
      findUnreferencedCandidates: async () => {
        calls.push('query:already-unreferenced');
        return [{ id: 'newer-orphan' }];
      },
      deleteUnreferenced: async (ids) => { calls.push(`delete:${ids.join(',')}`); return ids.length; },
    };
    assert.equal(await collectOrphanImages(repository), 1);
    assert.deepEqual(calls, ['query:already-unreferenced', 'delete:newer-orphan']);
  });

  test('extracts only current stored URLs and leaves legacy data URLs untouched', () => {
    const id = 'abcdefghijklmnop';
    assert.equal(storedImageId(`/api/images/${id}`), id);
    assert.equal(storedImageId('data:image/png;base64,AAAA'), null);
    assert.equal(storedImageId('/api/images/short'), null);
  });
});
