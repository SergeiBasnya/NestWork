import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_STRUCTURE_ASSETS } from '../game/nestworkStructure';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

const FLOOR_FILES = [
  'ivory-tile-32-v4.png',
  'oak-32-v4.png',
  'honey-parquet-32-v1.png',
  'basketweave-parquet-32-v1.png',
  'warm-terrazzo-32-v1.png',
  'warm-grey-carpet-32-v1.png',
  'graphite-carpet-32-v4.png',
  'slate-tile-32-v4.png',
];

test('original NestWork floors use a restrained, opaque and seamless native palette', async () => {
  for (const filename of FLOOR_FILES) {
    const path = new URL(`../public/NestWork/floors/${filename}`, import.meta.url).pathname;
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, TILE, `${filename}: one grid cell wide`);
    assert.equal(info.height, TILE, `${filename}: one grid cell high`);
    assert.equal(info.channels, 4, `${filename}: RGBA after normalization`);
    const tones = new Set<number>();
    for (let pixel = 0; pixel < info.width * info.height; pixel++) {
      assert.equal(data[pixel * 4 + 3], 255, `${filename}: no transparent holes`);
      tones.add(data[pixel * 4] + data[pixel * 4 + 1] + data[pixel * 4 + 2]);
    }
    assert.ok(tones.size >= 4, `${filename}: visible material definition`);
    assert.ok(tones.size <= 16, `${filename}: restrained pixel-art palette`);
    for (let y = 0; y < info.height; y++) {
      const first = (y * info.width) * 4;
      const last = (y * info.width + info.width - 1) * 4;
      assert.deepEqual([...data.subarray(first, first + 4)], [...data.subarray(last, last + 4)], `${filename}: horizontal seam`);
    }
    for (let x = 0; x < info.width; x++) {
      const first = x * 4;
      const last = ((info.height - 1) * info.width + x) * 4;
      assert.deepEqual([...data.subarray(first, first + 4)], [...data.subarray(last, last + 4)], `${filename}: vertical seam`);
    }
  }
});

test('original structure sheet is transparent, tile-aligned and complete', async () => {
  const path = new URL('../public/NestWork/construction/starter-structure-v1.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 12 * TILE);
  assert.equal(info.height, 8 * TILE);
  assert.equal(info.channels, 4);

  for (const item of NESTWORK_STRUCTURE_ASSETS) {
    let opaque = 0;
    for (let y = item.row * TILE; y < (item.row + item.h) * TILE; y++) {
      for (let x = item.col * TILE; x < (item.col + item.w) * TILE; x++) {
        if (data[(y * info.width + x) * 4 + 3]) opaque++;
      }
    }
    assert.ok(opaque > 100, `${item.name}: visible pixels`);
  }
});
