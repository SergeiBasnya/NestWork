import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_RAISED_WALL_ASSETS } from '../game/nestworkRaisedWalls';
import { sheetForCatalogId } from '../game/sheets';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('raised walls are complete RGBA sprites aligned to the native grid', async () => {
  const path = new URL('../public/NestWork/construction/raised-walls-v3.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 10 * TILE);
  assert.equal(info.height, 8 * TILE);
  assert.equal(info.channels, 4);

  for (const item of NESTWORK_RAISED_WALL_ASSETS) {
    assert.equal(sheetForCatalogId(item.id).key, 'nw-raised-walls-v3');
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= 10, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= 8, `${item.name}: height inside sheet`);

    let opaque = 0;
    for (let y = item.row * TILE; y < (item.row + item.h) * TILE; y++) {
      for (let x = item.col * TILE; x < (item.col + item.w) * TILE; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3]) opaque++;
        else {
          assert.equal(data[offset], 0, `${item.name}: transparent red residue`);
          assert.equal(data[offset + 1], 0, `${item.name}: transparent green residue`);
          assert.equal(data[offset + 2], 0, `${item.name}: transparent blue residue`);
        }
      }
    }
    assert.ok(opaque > item.w * TILE * 20, `${item.name}: visible wall face`);
  }
});

test('the catalog exposes stackable one-column side slices', () => {
  const visible = NESTWORK_RAISED_WALL_ASSETS.filter((item) => !item.hiddenInCatalog);
  const sideWalls = visible.filter((item) => item.id.includes('_side-'));

  assert.equal(sideWalls.length, 4);
  for (const wall of sideWalls) {
    assert.equal(wall.w, 1, `${wall.name}: lateral slice stays inside one column`);
    assert.equal(wall.h, 3, `${wall.name}: side run spans three rows`);
    assert.deepEqual(wall.collisionCells, [{ col: 0, row: 0, w: 1, h: 3 }]);
  }
  assert.equal(visible.some((item) => item.id.includes('raised-side')), false);
});

test('back walls expose an opaque elevated face while the passage keeps a central opening', async () => {
  const path = new URL('../public/NestWork/construction/raised-walls-v3.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];

  const straight = NESTWORK_RAISED_WALL_ASSETS.find((item) => item.id.includes('back-straight'))!;
  for (let x = straight.col * TILE; x < (straight.col + straight.w) * TILE; x++) {
    assert.ok(alpha(x, straight.row * TILE), 'top cap reaches the sprite edge');
    assert.ok(alpha(x, (straight.row + straight.h) * TILE - 1), 'baseboard reaches the sprite edge');
  }

  const passage = NESTWORK_RAISED_WALL_ASSETS.find((item) => item.id.includes('back-door'))!;
  const centerX = (passage.col + 1) * TILE + TILE / 2;
  assert.equal(alpha(centerX, (passage.row + passage.h) * TILE - 2), 0);
  assert.deepEqual(passage.collisionCells, [
    { col: 0, row: 0, w: 1, h: 2 },
    { col: 2, row: 0, w: 1, h: 2 },
  ]);
});
