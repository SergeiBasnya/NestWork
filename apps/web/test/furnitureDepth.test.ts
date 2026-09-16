import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DECOR_BACK_EDGE,
  FURNITURE_FRONT_EDGE,
  nextDecorDepth,
  resolveDecorDepth,
} from '../game/furnitureDepth';

describe('furniture depth', () => {
  test('stored object indices override catalog defaults', () => {
    assert.equal(resolveDecorDepth(1, 49, 3), 49);
    assert.equal(resolveDecorDepth(1.5, 3, 3), 3);
    assert.equal(resolveDecorDepth(2, 1, 3), 1);
    assert.equal(resolveDecorDepth(3, 42, 3), 42);
    assert.equal(resolveDecorDepth(2, 40, 3, 2_000), 40);
  });

  test('legacy assets keep their stored depth for saved-map compatibility', () => {
    assert.equal(resolveDecorDepth(null, 1, 2), 1);
    assert.equal(resolveDecorDepth(null, 12, 3), 12);
  });

  test('orders furniture by the bottom of its grid footprint inside the same layer', () => {
    const chairBehind = resolveDecorDepth(3, 3, 3, 160);
    const deskInFront = resolveDecorDepth(3, 3, 3, 192);
    assert.ok(chairBehind < deskInFront);
  });

  test('keeps floors, rugs and walls on fixed layers regardless of their position', () => {
    assert.equal(resolveDecorDepth(1, 1, 3, 2_000), 1);
    assert.equal(resolveDecorDepth(1.5, 1.5, 3, 2_000), 1.5);
    assert.equal(resolveDecorDepth(2, 2, 3, 2_000), 2);
  });

  test('allocates stable front and back indices inside the decor band', () => {
    assert.ok(nextDecorDepth([2, 3, 8], true) > 8);
    assert.ok(nextDecorDepth([2, 3, 8], true) < FURNITURE_FRONT_EDGE);
    assert.ok(nextDecorDepth([2, 3, 8], false) > DECOR_BACK_EDGE);
    assert.ok(nextDecorDepth([2, 3, 8], false) < 2);
    assert.equal(nextDecorDepth([], true), FURNITURE_FRONT_EDGE);
  });

  test('invalid persisted values remain inside the decor band', () => {
    assert.equal(resolveDecorDepth(null, Number.NaN, 3), 3);
    assert.equal(resolveDecorDepth(null, -8, 3), DECOR_BACK_EDGE);
    assert.equal(resolveDecorDepth(null, 500, 3), FURNITURE_FRONT_EDGE);
  });
});
