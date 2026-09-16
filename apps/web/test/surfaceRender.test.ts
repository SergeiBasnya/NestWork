import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sheetNeedsEdgeBleed } from '../game/sheets';
import { surfaceRenderRect } from '../game/surfaceRender';

describe('sheetNeedsEdgeBleed', () => {
  test('includes dedicated floors and walls but excludes mixed and decorative sheets', () => {
    assert.equal(sheetNeedsEdgeBleed('floor_0_9_1x1'), true);
    assert.equal(sheetNeedsEdgeBleed('wall_1_0_1x1'), true);
    assert.equal(sheetNeedsEdgeBleed('nw-walls-v2_straight-horizontal_0_0_3x1'), true);
    assert.equal(sheetNeedsEdgeBleed('rb_10_20_1x2'), false);
    assert.equal(sheetNeedsEdgeBleed('furniture_0_5_2x1'), false);
    assert.equal(sheetNeedsEdgeBleed('t1_6_0_1x2'), false);
  });
});

describe('surfaceRenderRect', () => {
  test('keeps the logical top-left and bleeds only the right and bottom edges', () => {
    const rendered = surfaceRenderRect(64, 96, 320, 160);

    assert.deepEqual(rendered, { centerX: 224.5, centerY: 176.5, width: 321, height: 161 });
    assert.equal(rendered.centerX - rendered.width / 2, 64);
    assert.equal(rendered.centerY - rendered.height / 2, 96);
  });

  test('never shrinks the rendered area when given a negative bleed', () => {
    assert.deepEqual(surfaceRenderRect(10, 20, 32, 32, -1), {
      centerX: 26,
      centerY: 36,
      width: 32,
      height: 32,
    });
  });
});
