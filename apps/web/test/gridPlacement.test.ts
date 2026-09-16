import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { placementFromPointer, snapToGrid } from '../game/gridPlacement';

describe('snapToGrid', () => {
  test('uses the room origin instead of the global world origin', () => {
    assert.deepEqual(snapToGrid(83, 117, { x: 19, y: 21 }, 32), { x: 83, y: 117 });
    assert.deepEqual(snapToGrid(96, 130, { x: 19, y: 21 }, 32), { x: 83, y: 117 });
  });

  test('keeps the usual world grid when its origin is zero', () => {
    assert.deepEqual(snapToGrid(47, 81, { x: 0, y: 0 }, 32), { x: 32, y: 96 });
  });
});

describe('placementFromPointer', () => {
  test('keeps regular furniture in the cell under the pointer', () => {
    assert.deepEqual(placementFromPointer(82, 84, { x: 20, y: 20 }, 32), { x: 52, y: 84 });
  });

  test('chooses the nearest requested wall edge', () => {
    assert.deepEqual(
      placementFromPointer(82, 78, { x: 20, y: 20 }, 32, { x: true, y: false }),
      { x: 84, y: 52 },
    );
    assert.deepEqual(
      placementFromPointer(82, 78, { x: 20, y: 20 }, 32, { x: false, y: true }),
      { x: 52, y: 84 },
    );
    assert.deepEqual(
      placementFromPointer(82, 78, { x: 20, y: 20 }, 32, { x: true, y: true }),
      { x: 84, y: 84 },
    );
  });
});
