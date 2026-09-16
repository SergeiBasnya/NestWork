import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const IMAGE_GC_GRACE_MS = 24 * 60 * 60 * 1_000;
export const IMAGE_GC_BATCH_SIZE = 25;
const IMAGE_GC_MIN_INTERVAL_MS = 5 * 60_000;

export interface ImageGcRepository {
  findUnreferencedCandidates(cutoff: Date, limit: number): Promise<Array<{ id: string }>>;
  deleteUnreferenced(ids: string[], cutoff: Date): Promise<number>;
}

// During a rolling deploy an older server can still write only the legacy URL
// column. Both the candidate query and DELETE must therefore protect the FK and
// the exact URL form until the contract phase removes those columns.
export const IMAGE_UNREFERENCED_SQL = `
  NOT EXISTS (
    SELECT 1 FROM "Message" AS m
    WHERE m."imageId" = i."id" OR m."imageUrl" = '/api/images/' || i."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "MapTemplate" AS t
    WHERE t."previewImageId" = i."id" OR t."preview" = '/api/images/' || i."id"
  )
`;

export async function collectOrphanImages(
  repository: ImageGcRepository,
  options: { now?: Date; graceMs?: number; limit?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const graceMs = Math.max(0, options.graceMs ?? IMAGE_GC_GRACE_MS);
  const limit = Math.max(1, Math.min(options.limit ?? IMAGE_GC_BATCH_SIZE, 100));
  const cutoff = new Date(now.getTime() - graceMs);
  // Filtering happens before LIMIT, so referenced old rows cannot permanently
  // starve newer orphan candidates.
  const candidates = await repository.findUnreferencedCandidates(cutoff, limit);
  if (candidates.length === 0) return 0;
  const ids = candidates.map(({ id }) => id);
  // DELETE repeats all four checks, closing the candidate/delete race; foreign
  // keys additionally protect a concurrent write by a current server.
  return repository.deleteUnreferenced(ids, cutoff);
}

export const prismaImageGcRepository: ImageGcRepository = {
  findUnreferencedCandidates: (cutoff, limit) => prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT i."id"
    FROM "Image" AS i
    WHERE i."createdAt" < ${cutoff}
      AND ${Prisma.raw(IMAGE_UNREFERENCED_SQL)}
    ORDER BY i."createdAt" ASC
    LIMIT ${limit}
  `),
  deleteUnreferenced: async (ids, cutoff) => {
    if (ids.length === 0) return 0;
    return prisma.$executeRaw(Prisma.sql`
      DELETE FROM "Image" AS i
      WHERE i."id" IN (${Prisma.join(ids)})
        AND i."createdAt" < ${cutoff}
        AND ${Prisma.raw(IMAGE_UNREFERENCED_SQL)}
    `);
  },
};

let running: Promise<void> | null = null;
let lastStartedAt = 0;

export function scheduleImageGc(now = Date.now()): void {
  if (running || now - lastStartedAt < IMAGE_GC_MIN_INTERVAL_MS) return;
  lastStartedAt = now;
  running = collectOrphanImages(prismaImageGcRepository)
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error('[images] orphan GC failed:', error instanceof Error ? error.message : error);
    })
    .finally(() => { running = null; });
}
