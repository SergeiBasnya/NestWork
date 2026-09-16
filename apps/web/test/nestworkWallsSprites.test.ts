import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_WALL_ASSETS, type WallConnector } from '../game/nestworkWalls';
import { sheetGroups, sheetTextures } from '../game/sheets';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('modular wall edges expose one canonical connector or remain transparent', async () => {
  const path = new URL('../public/NestWork/construction/modular-walls-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 13 * TILE);
  assert.equal(info.height, 5 * TILE);
  assert.equal(info.channels, 4);

  const edgeOpaquePixels = (item: (typeof NESTWORK_WALL_ASSETS)[number], edge: WallConnector) => {
    const left = item.col * TILE;
    const top = item.row * TILE;
    const width = item.w * TILE;
    const height = item.h * TILE;
    let opaque = 0;
    const visit = (x: number, y: number) => {
      if (data[(y * info.width + x) * 4 + 3]) opaque++;
    };
    if (edge === 'N' || edge === 'S') {
      const y = edge === 'N' ? top : top + height - 1;
      for (let x = left; x < left + width; x++) visit(x, y);
    } else {
      const x = edge === 'W' ? left : left + width - 1;
      for (let y = top; y < top + height; y++) visit(x, y);
    }
    return opaque;
  };

  for (const item of NESTWORK_WALL_ASSETS) {
    for (const edge of ['N', 'E', 'S', 'W'] as const) {
      assert.equal(
        edgeOpaquePixels(item, edge),
        item.connectors.includes(edge) ? 18 : 0,
        `${item.name}: ${edge} edge`,
      );
    }
  }
});

test('the builder shows raised v3 walls while older walls remain available to saved maps', () => {
  const visibleKeys = sheetGroups().flatMap((group) => group.sheets.map((sheet) => sheet.key));
  assert.ok(visibleKeys.includes('nw-raised-walls-v3'));
  assert.ok(!visibleKeys.includes('nw-walls-v2'));
  assert.ok(!visibleKeys.includes('nw-structure'));
  assert.ok(sheetTextures().some((texture) => texture.key === 'nw-structure'));
  assert.ok(sheetTextures().some((texture) => texture.key === 'nw-walls-v2'));
});

test('wall collision footprints stay on their source grid and passages keep a walkable opening', () => {
  for (const item of NESTWORK_WALL_ASSETS) {
    assert.ok(item.collisionCells?.length, `${item.name}: collision footprint`);
    for (const cell of item.collisionCells ?? []) {
      assert.ok(cell.col >= 0 && cell.row >= 0, `${item.name}: non-negative collision origin`);
      assert.ok(cell.col + cell.w <= item.w, `${item.name}: collision width inside sprite`);
      assert.ok(cell.row + cell.h <= item.h, `${item.name}: collision height inside sprite`);
    }
  }

  const horizontalDoor = NESTWORK_WALL_ASSETS.find((item) => item.id.includes('door-horizontal'));
  const verticalDoor = NESTWORK_WALL_ASSETS.find((item) => item.id.includes('door-vertical'));
  assert.deepEqual(horizontalDoor?.collisionCells, [
    { col: 0, row: 0, w: 1, h: 1 },
    { col: 2, row: 0, w: 1, h: 1 },
  ]);
  assert.deepEqual(verticalDoor?.collisionCells, [
    { col: 0, row: 0, w: 1, h: 1 },
    { col: 0, row: 2, w: 1, h: 1 },
  ]);
});
