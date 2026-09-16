import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_HIGH_COLLABORATION_ASSETS } from '../game/nestworkHighCollaboration';
import { NESTWORK_SHARED_SPACE_ASSETS } from '../game/nestworkSharedSpaces';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('high tables and stools are independent grid-native objects', () => {
  const tables = NESTWORK_HIGH_COLLABORATION_ASSETS.filter((item) => item.id.includes('_table-'));
  const stools = NESTWORK_HIGH_COLLABORATION_ASSETS.filter((item) => item.id.includes('_stool-'));
  assert.deepEqual(tables.map((item) => [item.w, item.h]), [[4, 2], [2, 4]]);
  assert.deepEqual(new Set(stools.map((item) => item.orientation)), new Set(['up', 'down', 'left', 'right']));
  assert.ok(stools.every((item) => item.w === 1 && item.h === 1));
  assert.equal(
    NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.id.includes('_high-table_'))?.hiddenInCatalog,
    true,
  );
});

test('high collaboration sprites keep transparent margins without chroma residue', async () => {
  const path = new URL('../public/NestWork/collaboration/high-collaboration-v1.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [4 * TILE, 7 * TILE, 4]);

  for (const item of NESTWORK_HIGH_COLLABORATION_ASSETS) {
    const left = item.col * TILE;
    const top = item.row * TILE;
    const right = left + item.w * TILE - 1;
    const bottom = top + item.h * TILE - 1;
    let opaque = 0;
    let chroma = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] >= 16) {
          opaque++;
          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          const isPink = red >= 100 && blue >= 110 && green <= 50;
          const isGreen = green >= 70 && green - red >= 35 && green - blue >= 25;
          if (isPink || isGreen) chroma++;
        }
        if (x === left || x === right || y === top || y === bottom) {
          assert.equal(data[offset + 3], 0, `${item.name}: safe transparent margin`);
        }
      }
    }
    assert.ok(opaque > 100, `${item.name}: complete visible object`);
    assert.equal(chroma, 0, `${item.name}: no chroma extraction residue`);
  }
});
