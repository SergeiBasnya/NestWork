import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tileFillRect } from '../game/tileFill';

describe('tileFillRect', () => {
  test('builds the same rectangle in every drag direction', () => {
    assert.deepEqual(tileFillRect(2, 3, 6, 8, 20, 20), { col: 2, row: 3, w: 5, h: 6 });
    assert.deepEqual(tileFillRect(6, 8, 2, 3, 20, 20), { col: 2, row: 3, w: 5, h: 6 });
  });

  test('clamps the pointer to the room bounds', () => {
    assert.deepEqual(tileFillRect(2, 2, 99, -10, 8, 6), { col: 2, row: 0, w: 6, h: 3 });
  });

  test('caps large fills to the persistence limit around the start cell', () => {
    assert.deepEqual(tileFillRect(70, 70, 0, 0, 100, 100), { col: 7, row: 7, w: 64, h: 64 });
    assert.deepEqual(tileFillRect(10, 10, 99, 99, 100, 100), { col: 10, row: 10, w: 64, h: 64 });
  });
});
