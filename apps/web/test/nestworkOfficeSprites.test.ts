import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_OFFICE_ASSETS } from '../game/nestworkOffice';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;
const MAX_BOUNDS = new Map<string, [number, number]>([
  ['Bureau individuel', [64, 48]],
  ['Chaise de bureau', [32, 44]],
  ['Bureau double', [96, 50]],
  ['Canapé deux places', [64, 48]],
  ['Bibliothèque', [64, 80]],
  ['Meuble bas', [64, 46]],
  ['Coin café', [48, 68]],
  ['Table de réunion', [96, 72]],
  ['Grande plante', [48, 64]],
  ['Petite plante', [24, 30]],
  ['Fontaine à eau', [24, 48]],
  ['Meuble imprimante', [56, 44]],
  ['Fauteuil détente', [40, 48]],
  ['Table café', [64, 44]],
  ['Lampadaire', [20, 48]],
  ['Bacs de tri', [64, 42]],
]);

test('original office sheet is transparent, tile-aligned and uncropped', async () => {
  const path = new URL('../public/NestWork/office/starter-office-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });

  assert.equal(info.width, 12 * TILE);
  assert.equal(info.height, 10 * TILE);
  assert.equal(info.channels, 4);

  for (const item of NESTWORK_OFFICE_ASSETS) {
    const left = item.col * TILE;
    const top = item.row * TILE;
    const width = item.w * TILE;
    const height = item.h * TILE;
    let opaque = 0;
    let minX = left + width;
    let minY = top + height;
    let maxX = left;
    let maxY = top;
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha) {
          opaque++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if (x === left || x === left + width - 1 || y === top || y === top + height - 1) {
          assert.equal(alpha, 0, `${item.name}: transparent margin, no clipping`);
        }
      }
    }
    assert.ok(opaque > 50, `${item.name}: visible pixels`);
    const [maxWidth, maxHeight] = MAX_BOUNDS.get(item.name)!;
    assert.ok(maxX - minX + 1 <= maxWidth, `${item.name}: coherent width`);
    assert.ok(maxY - minY + 1 <= maxHeight, `${item.name}: coherent height`);
  }
});

test('office chair contains one object and no detached side-view artifact', async () => {
  const path = new URL('../public/NestWork/office/starter-office-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const item = NESTWORK_OFFICE_ASSETS.find((candidate) => candidate.name === 'Chaise de bureau')!;
  const width = item.w * TILE;
  const height = item.h * TILE;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let components = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const local = y * width + x;
      const visible = data[((item.row * TILE + y) * info.width + item.col * TILE + x) * 4 + 3] >= 16;
      if (visited[local] || !visible) continue;
      components++;
      let head = 0;
      let tail = 0;
      visited[local] = 1;
      queue[tail++] = local;
      while (head < tail) {
        const pixel = queue[head++];
        const px = pixel % width;
        const py = Math.floor(pixel / width);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          const nextVisible = data[((item.row * TILE + ny) * info.width + item.col * TILE + nx) * 4 + 3] >= 16;
          if (visited[next] || !nextVisible) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  assert.equal(components, 1);
});

test('large plant keeps a complete crown with transparent space above it', async () => {
  const path = new URL('../public/NestWork/office/starter-office-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const plant = NESTWORK_OFFICE_ASSETS.find((item) => item.name === 'Grande plante')!;
  const left = plant.col * TILE;
  const top = plant.row * TILE;
  const width = plant.w * TILE;
  let firstOpaqueY = -1;
  let firstRowPixels = 0;
  for (let y = top; y < top + plant.h * TILE && firstOpaqueY < 0; y++) {
    for (let x = left; x < left + width; x++) {
      if (data[(y * info.width + x) * 4 + 3]) {
        firstOpaqueY = y;
        firstRowPixels++;
      }
    }
  }
  assert.ok(firstOpaqueY > top, 'transparent breathing room above the plant');
  assert.ok(firstRowPixels <= 12, `natural crown starts narrowly (${firstRowPixels}px)`);
});

test('small plant has no neutral extraction tail and the floor lamp keeps its top cap', async () => {
  const path = new URL('../public/NestWork/office/starter-office-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const plant = NESTWORK_OFFICE_ASSETS.find((item) => item.name === 'Petite plante')!;
  const lamp = NESTWORK_OFFICE_ASSETS.find((item) => item.name === 'Lampadaire')!;

  const plantTailY = plant.row * TILE + 60;
  for (let x = plant.col * TILE; x < plant.col * TILE + 10; x++) {
    assert.equal(data[(plantTailY * info.width + x) * 4 + 3], 0, 'no grey tail below the left leaf');
  }

  const lampTopY = lamp.row * TILE + 14;
  const capPixels = [];
  for (let x = lamp.col * TILE; x < (lamp.col + lamp.w) * TILE; x++) {
    const offset = (lampTopY * info.width + x) * 4;
    if (data[offset + 3] >= 16) capPixels.push([data[offset], data[offset + 1], data[offset + 2]]);
  }
  assert.ok(capPixels.length >= 8, 'lamp shade has a complete top cap');
  assert.ok(
    capPixels.every(([red, green, blue]) => (red + green + blue) / 3 < 90),
    'lamp top cap remains a dark outline rather than a pale matte',
  );
});

test('floor lamp source is canonical RGBA with safe margins and no chroma residue', async () => {
  const path = new URL(
    '../../../docs/asset-prototypes/nestwork-floor-lamp-source-v4.png',
    import.meta.url,
  ).pathname;
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  let magenta = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha >= 16) {
        visible++;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        if (Math.min(red, blue) >= 8 && Math.min(red, blue) - green >= 8) magenta++;
      }
      if (x < 16 || x >= info.width - 16 || y < 16 || y >= info.height - 16) {
        assert.equal(alpha, 0, 'canonical source keeps a 16px transparent safety margin');
      }
    }
  }

  assert.ok(visible > 1_000, 'source contains the complete lamp');
  assert.equal(magenta, 0, 'technical chroma background is fully removed');
});
