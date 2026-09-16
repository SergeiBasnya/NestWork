import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_SHARED_SPACE_ASSETS } from '../game/nestworkSharedSpaces';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;
const MAX_BOUNDS = new Map<string, [number, number]>([
  ["Comptoir d'accueil", [96, 64]],
  ['Tableau blanc mobile', [52, 44]],
  ["Panneau d'affichage", [64, 60]],
  ['Casiers de bureau', [64, 68]],
  ['Vestiaire', [40, 72]],
  ['Distributeur', [48, 76]],
  ['Étagère de fournitures', [64, 72]],
  ['Cabine acoustique', [48, 84]],
  ['Tapis rond', [64, 48]],
  ['Poufs modulaires', [48, 32]],
  ['Table haute collaborative', [96, 60]],
  ['Écran de projection', [64, 64]],
  ["Arbre d'intérieur", [48, 84]],
  ['Horloge murale', [32, 32]],
  ['Meuble courrier', [64, 64]],
  ['Armoire de secours', [28, 44]],
]);

function visibleComponentCount(
  data: Buffer,
  sheetWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
): number {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let components = 0;
  const visible = (x: number, y: number) => data[((top + y) * sheetWidth + left + x) * 4 + 3] >= 16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || !visible(x, y)) continue;
      components++;
      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const pixel = queue[head++];
        const px = pixel % width;
        const py = Math.floor(pixel / width);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || !visible(nx, ny)) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  return components;
}

function visibleComponentSizes(
  data: Buffer,
  sheetWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
): number[] {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const sizes: number[] = [];
  const visible = (x: number, y: number) => data[((top + y) * sheetWidth + left + x) * 4 + 3] >= 16;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start] || !visible(x, y)) continue;
      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const pixel = queue[head++];
        const px = pixel % width;
        const py = Math.floor(pixel / width);
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || !visible(nx, ny)) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      sizes.push(tail);
    }
  }
  return sizes.sort((leftSize, rightSize) => rightSize - leftSize);
}

test('original shared-spaces sheet is transparent, tile-aligned and uncropped', async () => {
  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });

  assert.equal(info.width, 13 * TILE);
  assert.equal(info.height, 13 * TILE);
  assert.equal(info.channels, 4);

  for (const item of NESTWORK_SHARED_SPACE_ASSETS) {
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
    assert.ok(opaque > 80, `${item.name}: visible pixels`);
    const [maxWidth, maxHeight] = MAX_BOUNDS.get(item.name)!;
    assert.ok(maxX - minX + 1 <= maxWidth, `${item.name}: coherent width`);
    assert.ok(maxY - minY + 1 <= maxHeight, `${item.name}: coherent height`);
  }
});

test('indoor tree keeps a natural crown instead of a clipped horizontal top', async () => {
  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const item = NESTWORK_SHARED_SPACE_ASSETS.find((candidate) => candidate.name === "Arbre d'intérieur")!;
  const left = item.col * TILE;
  const top = item.row * TILE;
  const width = item.w * TILE;
  const height = item.h * TILE;
  let firstOpaqueY = -1;
  let firstRowPixels = 0;

  for (let y = top; y < top + height && firstOpaqueY < 0; y++) {
    for (let x = left; x < left + width; x++) {
      if (data[(y * info.width + x) * 4 + 3]) {
        firstOpaqueY = y;
        firstRowPixels++;
      }
    }
  }

  assert.ok(firstOpaqueY > top, 'transparent breathing room above the crown');
  assert.ok(firstRowPixels <= 6, `rounded crown starts narrowly (${firstRowPixels}px)`);
});

test('utility furniture has compact footprints without detached neighbour fragments', async () => {
  const whiteboard = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Tableau blanc mobile')!;
  const firstAid = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Armoire de secours')!;
  assert.deepEqual([whiteboard.w, whiteboard.h], [2, 2]);
  assert.deepEqual([firstAid.w, firstAid.h], [1, 2]);

  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.equal(
    visibleComponentCount(
      data,
      info.width,
      whiteboard.col * TILE,
      whiteboard.row * TILE,
      whiteboard.w * TILE,
      whiteboard.h * TILE,
    ),
    1,
  );
});

test('shared-space sprites contain no tiny detached extraction residue', async () => {
  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });

  for (const item of NESTWORK_SHARED_SPACE_ASSETS) {
    const sizes = visibleComponentSizes(
      data,
      info.width,
      item.col * TILE,
      item.row * TILE,
      item.w * TILE,
      item.h * TILE,
    );
    assert.ok(sizes.every((size) => size >= 100), `${item.name}: no detached speck (${sizes.join(', ')})`);
  }
});

test('round rug enters its footprint with a curved top edge', async () => {
  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const rug = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Tapis rond')!;
  const left = rug.col * TILE;
  const top = rug.row * TILE;
  const width = rug.w * TILE;
  let firstRowCount = 0;
  let found = false;
  for (let y = top; y < top + rug.h * TILE && !found; y++) {
    for (let x = left; x < left + width; x++) {
      if (data[(y * info.width + x) * 4 + 3] >= 16) firstRowCount++;
    }
    found = firstRowCount > 0;
  }
  assert.ok(firstRowCount <= 12, `rounded rug starts narrowly (${firstRowCount}px)`);
});

test('projection screen and mail cabinet contain no connected checkerboard fringe', async () => {
  const path = new URL('../public/NestWork/shared-spaces/starter-shared-spaces-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const screen = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Écran de projection')!;
  const mail = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Meuble courrier')!;

  for (let localY = 48; localY <= 74; localY++) {
    const fringeX = screen.col * TILE + 18;
    const y = screen.row * TILE + localY;
    assert.equal(data[(y * info.width + fringeX) * 4 + 3], 0, `screen row ${localY}: clean left edge`);
  }

  const mailGapY = mail.row * TILE + 40;
  for (let localX = 38; localX <= 54; localX++) {
    const x = mail.col * TILE + localX;
    assert.equal(data[(mailGapY * info.width + x) * 4 + 3], 0, 'clean gap between plant and printer');
  }
});
