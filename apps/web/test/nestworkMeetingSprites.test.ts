import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_MEETING_ASSETS } from '../game/nestworkMeeting';
import { SHEETS, sheetForCatalogId } from '../game/sheets';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('meeting tables are separate, axis-aligned and grid-native', () => {
  assert.deepEqual(NESTWORK_MEETING_ASSETS.map((item) => [item.w, item.h]), [[4, 2], [2, 4]]);
  assert.ok(NESTWORK_MEETING_ASSETS[0].id.includes('table-horizontal'));
  assert.ok(NESTWORK_MEETING_ASSETS[1].id.includes('table-vertical'));
  const legacy = SHEETS.find((sheet) => sheet.key === 'nw-office')?.presets
    ?.find((item) => item.id.includes('_meeting-table_'));
  assert.equal(legacy?.hiddenInCatalog, true);
});

test('meeting table sprites have transparent margins and no chroma fringe', async () => {
  const path = new URL('../public/NestWork/meeting/meeting-tables-v1.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [4 * TILE, 6 * TILE, 4]);

  for (const item of NESTWORK_MEETING_ASSETS) {
    assert.equal(sheetForCatalogId(item.id).key, 'nw-meeting');
    const left = item.col * TILE;
    const top = item.row * TILE;
    const right = left + item.w * TILE - 1;
    const bottom = top + item.h * TILE - 1;
    let opaque = 0;
    let pink = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] >= 16) {
          opaque++;
          if (data[offset] > 120 && data[offset + 2] > 110 && data[offset + 1] < 100) pink++;
        }
        if (x === left || x === right || y === top || y === bottom) {
          assert.equal(data[offset + 3], 0, `${item.name}: safe transparent margin`);
        }
      }
    }
    assert.ok(opaque > 500, `${item.name}: complete visible table`);
    assert.equal(pink, 0, `${item.name}: no magenta extraction residue`);
  }
});
