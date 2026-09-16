import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_OFFICE_ASSETS } from '../game/nestworkOffice';
import { NESTWORK_WORKSTATION_ASSETS } from '../game/nestworkWorkstations';
import { sheetForCatalogId } from '../game/sheets';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('workstations are separate, axis-aligned and replace the composed bench', () => {
  assert.deepEqual(NESTWORK_WORKSTATION_ASSETS.map((item) => [item.w, item.h]), [[3, 2], [2, 3]]);
  assert.ok(NESTWORK_WORKSTATION_ASSETS[0].id.includes('desk-horizontal'));
  assert.ok(NESTWORK_WORKSTATION_ASSETS[1].id.includes('desk-vertical'));
  assert.equal(
    NESTWORK_OFFICE_ASSETS.find((item) => item.id.includes('_bench-desk_'))?.hiddenInCatalog,
    true,
  );
});

test('workstation sprites have transparent margins and no green chroma fringe', async () => {
  const path = new URL('../public/NestWork/workstations/workstations-v1.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [3 * TILE, 5 * TILE, 4]);

  for (const item of NESTWORK_WORKSTATION_ASSETS) {
    assert.equal(sheetForCatalogId(item.id).key, 'nw-workstations');
    const left = item.col * TILE;
    const top = item.row * TILE;
    const right = left + item.w * TILE - 1;
    const bottom = top + item.h * TILE - 1;
    let opaque = 0;
    let green = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] >= 16) {
          opaque++;
          if (data[offset + 1] >= 70 && data[offset + 1] - data[offset] >= 35 && data[offset + 1] - data[offset + 2] >= 25) green++;
        }
        if (x === left || x === right || y === top || y === bottom) {
          assert.equal(data[offset + 3], 0, `${item.name}: safe transparent margin`);
        }
      }
    }
    assert.ok(opaque > 400, `${item.name}: complete visible desk`);
    assert.equal(green, 0, `${item.name}: no chroma extraction residue`);
  }
});
