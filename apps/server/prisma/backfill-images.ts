/**
 * One-shot backfill: move inline base64 images out of the rows that carry them
 * and into the Image table, leaving a cacheable /api/images/<id> URL behind.
 *
 *   pnpm --filter @nestwork/server db:backfill-images
 *
 * Idempotent — rows already migrated are skipped, so it's safe to re-run (and to
 * run before the new server code is deployed: the read path accepts both shapes).
 * Rows whose data URL is unparseable are left untouched and reported, never
 * silently dropped.
 */
import 'dotenv/config';
// Reuse the app's client: Prisma 7 needs the pg adapter, and storeDataUrl writes
// through this same instance anyway.
import { prisma } from '../src/lib/prisma';
import { storeDataUrl, isStoredImageUrl, storedImageId } from '../src/lib/images';

// Processed in small batches: a few hundred multi-MB base64 strings pulled at
// once would be enough to OOM a small instance.
const BATCH = 25;

async function backfillMessages() {
  let migrated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.message.findMany({
      where: { imageUrl: { not: null } },
      select: { id: true, imageUrl: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const current = row.imageUrl!;
      if (isStoredImageUrl(current)) {
        const claimed = await storeDataUrl(current);
        if (!claimed) {
          console.warn(`  [skip] message ${row.id}: stored image is missing, left as-is`);
          skipped++;
          continue;
        }
        await prisma.message.update({ where: { id: row.id }, data: { imageId: storedImageId(claimed) } });
        continue;
      }
      const url = await storeDataUrl(current);
      if (!url) {
        console.warn(`  [skip] message ${row.id}: unrecognised image payload, left as-is`);
        skipped++;
        continue;
      }
      await prisma.message.update({ where: { id: row.id }, data: { imageUrl: url, imageId: storedImageId(url) } });
      migrated++;
    }
  }
  return { migrated, skipped };
}

async function backfillTemplates() {
  let migrated = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.mapTemplate.findMany({
      where: { preview: { not: null } },
      select: { id: true, preview: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const current = row.preview!;
      if (isStoredImageUrl(current)) {
        const claimed = await storeDataUrl(current);
        if (!claimed) {
          console.warn(`  [skip] template ${row.id}: stored image is missing, left as-is`);
          skipped++;
          continue;
        }
        await prisma.mapTemplate.update({ where: { id: row.id }, data: { previewImageId: storedImageId(claimed) } });
        continue;
      }
      const url = await storeDataUrl(current);
      if (!url) {
        console.warn(`  [skip] template ${row.id}: unrecognised preview payload, left as-is`);
        skipped++;
        continue;
      }
      await prisma.mapTemplate.update({ where: { id: row.id }, data: { preview: url, previewImageId: storedImageId(url) } });
      migrated++;
    }
  }
  return { migrated, skipped };
}

async function main() {
  console.log('Backfilling inline images → Image table…');

  const msg = await backfillMessages();
  console.log(`  messages   : ${msg.migrated} migrated, ${msg.skipped} skipped`);

  const tpl = await backfillTemplates();
  console.log(`  templates  : ${tpl.migrated} migrated, ${tpl.skipped} skipped`);

  const { _count, _sum } = await prisma.image.aggregate({ _count: true, _sum: { size: true } });
  const mb = ((_sum.size ?? 0) / 1_048_576).toFixed(1);
  console.log(`Done. Image table holds ${_count} blob(s), ${mb} MB.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
