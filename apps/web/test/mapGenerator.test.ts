import assert from 'node:assert/strict';
import test from 'node:test';
import { TILE_SIZE } from '../game/constants';
import { generateOfficeMap } from '../game/mapGenerator';

test('generated offices use only original NestWork assets and stay on the room grid', () => {
  const roomCol = 2;
  const roomRow = 3;
  const roomWidth = 30;
  const roomHeight = 22;
  const snapshot = generateOfficeMap(
    roomCol * TILE_SIZE,
    roomRow * TILE_SIZE,
    roomWidth * TILE_SIZE,
    roomHeight * TILE_SIZE,
    () => 0.5,
  );

  assert.ok(snapshot.furniture.length > 0);
  assert.ok(snapshot.furniture.every((item) => item.catalogId.startsWith('nw-')));

  const floorCoverage = new Uint8Array(roomWidth * roomHeight);
  const occupied = new Set<string>();
  for (const item of snapshot.furniture) {
    const col = (item.x - roomCol * TILE_SIZE) / TILE_SIZE;
    const row = (item.y - roomRow * TILE_SIZE) / TILE_SIZE;
    assert.ok(Number.isInteger(col) && Number.isInteger(row), `${item.catalogId}: grid aligned`);
    assert.ok(col >= 0 && row >= 0, `${item.catalogId}: starts inside room`);
    assert.ok(col + item.w <= roomWidth, `${item.catalogId}: width inside room`);
    assert.ok(row + item.h <= roomHeight, `${item.catalogId}: height inside room`);

    if (item.catalogId.startsWith('nw-floor-')) {
      assert.equal(item.depth, 1);
      for (let y = row; y < row + item.h; y += 1) {
        for (let x = col; x < col + item.w; x += 1) floorCoverage[y * roomWidth + x] += 1;
      }
      continue;
    }

    // Rugs intentionally live below furniture; every solid furniture footprint
    // must otherwise remain separate so generated aisles stay usable.
    if (item.depth <= 1.5) continue;
    for (let y = row; y < row + item.h; y += 1) {
      for (let x = col; x < col + item.w; x += 1) {
        const cell = `${x},${y}`;
        assert.ok(!occupied.has(cell), `${item.catalogId}: furniture overlap at ${cell}`);
        occupied.add(cell);
      }
    }
  }

  floorCoverage.forEach((count, index) => {
    assert.equal(count, 1, `floor cell ${index} covered exactly once`);
  });
  assert.ok(snapshot.furniture.some((item) => item.catalogId.includes('_desk-horizontal_')));
  assert.ok(snapshot.furniture.some((item) => item.catalogId.includes('_office-chair-up_')));
  assert.ok(snapshot.furniture.some((item) => item.catalogId.includes('_round-rug_')));
});
