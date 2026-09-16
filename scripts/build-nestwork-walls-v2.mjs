// Deterministic modular wall tiles. Every connection uses the same 18px band
// centred on a 32px grid edge, so straight pieces, corners and junctions meet
// without relying on image-generation geometry.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const COLS = 13;
const ROWS = 5;
const OUTPUT = 'apps/web/public/NestWork/construction/modular-walls-v2.png';
const COLORS = {
  outline: [35, 39, 52, 255],
  shadow: [66, 73, 88, 255],
  cream: [232, 229, 220, 255],
  creamLight: [247, 244, 237, 255],
  glass: [112, 126, 177, 255],
  glassLight: [157, 174, 218, 255],
  orange: [238, 143, 31, 255],
};

const sheet = Buffer.alloc(COLS * TILE * ROWS * TILE * 4);
const sheetWidth = COLS * TILE;

function pixel(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= buffer.length / 4 / width) return;
  const index = (y * width + x) * 4;
  buffer[index] = color[0];
  buffer[index + 1] = color[1];
  buffer[index + 2] = color[2];
  buffer[index + 3] = color[3];
}

function rectangle(mask, width, height, left, top, right, bottom) {
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(width, right); x++) mask[y * width + x] = 1;
  }
}

function network(width, height, connectors, material = 'solid') {
  const outer = new Uint8Array(width * height);
  const inner = new Uint8Array(width * height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const addBands = (mask, half) => {
    rectangle(mask, width, height, cx - half, cy - half, cx + half, cy + half);
    if (connectors.includes('N')) rectangle(mask, width, height, cx - half, 0, cx + half, cy + 1);
    if (connectors.includes('S')) rectangle(mask, width, height, cx - half, cy, cx + half, height);
    if (connectors.includes('W')) rectangle(mask, width, height, 0, cy - half, cx + 1, cy + half);
    if (connectors.includes('E')) rectangle(mask, width, height, cx, cy - half, width, cy + half);
  };
  addBands(outer, 9);
  addBands(inner, 6);

  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!outer[index]) continue;
      if (!inner[index]) {
        pixel(buffer, width, x, y, y > cy + 5 ? COLORS.shadow : COLORS.outline);
        continue;
      }
      const base = material === 'glass' ? COLORS.glass : COLORS.cream;
      const light = material === 'glass' ? COLORS.glassLight : COLORS.creamLight;
      pixel(buffer, width, x, y, (x + y) % 17 === 0 ? light : base);
      if (material === 'divider' && ((connectors.includes('N') || connectors.includes('S')) ? x === cx : y === cy)) {
        pixel(buffer, width, x, y, COLORS.orange);
      }
    }
  }
  return buffer;
}

function overlay(target, targetWidth, source, sourceWidth, sourceHeight, left, top) {
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const sourceIndex = (y * sourceWidth + x) * 4;
      if (!source[sourceIndex + 3]) continue;
      pixel(target, targetWidth, left + x, top + y, [
        source[sourceIndex],
        source[sourceIndex + 1],
        source[sourceIndex + 2],
        source[sourceIndex + 3],
      ]);
    }
  }
}

function place(buffer, width, height, col, row) {
  overlay(sheet, sheetWidth, buffer, width, height, col * TILE, row * TILE);
}

function doorway(width, height, orientation) {
  const horizontal = orientation === 'horizontal';
  const buffer = network(width, height, horizontal ? ['W', 'E'] : ['N', 'S']);
  const openingStart = TILE;
  const openingEnd = TILE * 2;
  if (horizontal) {
    for (let y = 0; y < height; y++) for (let x = openingStart; x < openingEnd; x++) pixel(buffer, width, x, y, [0, 0, 0, 0]);
    for (const x of [openingStart, openingEnd - 4]) {
      for (let y = 5; y < 27; y++) for (let dx = 0; dx < 4; dx++) pixel(buffer, width, x + dx, y, COLORS.outline);
    }
  } else {
    for (let y = openingStart; y < openingEnd; y++) for (let x = 0; x < width; x++) pixel(buffer, width, x, y, [0, 0, 0, 0]);
    for (const y of [openingStart, openingEnd - 4]) {
      for (let x = 5; x < 27; x++) for (let dy = 0; dy < 4; dy++) pixel(buffer, width, x, y + dy, COLORS.outline);
    }
  }
  return buffer;
}

function windowWall(width, height, orientation) {
  const horizontal = orientation === 'horizontal';
  const buffer = network(width, height, horizontal ? ['W', 'E'] : ['N', 'S']);
  if (horizontal) {
    for (let y = 10; y < 22; y++) for (let x = TILE + 3; x < TILE * 2 - 3; x++) {
      pixel(buffer, width, x, y, (x + y) % 11 === 0 ? COLORS.glassLight : COLORS.glass);
    }
  } else {
    for (let y = TILE + 3; y < TILE * 2 - 3; y++) for (let x = 10; x < 22; x++) {
      pixel(buffer, width, x, y, (x + y) % 11 === 0 ? COLORS.glassLight : COLORS.glass);
    }
  }
  return buffer;
}

place(network(TILE * 3, TILE, ['W', 'E']), TILE * 3, TILE, 0, 0);
place(network(TILE, TILE * 3, ['N', 'S']), TILE, TILE * 3, 3, 0);
place(network(TILE, TILE, ['N', 'E']), TILE, TILE, 4, 0);
place(network(TILE, TILE, ['E', 'S']), TILE, TILE, 5, 0);
place(network(TILE, TILE, ['S', 'W']), TILE, TILE, 6, 0);
place(network(TILE, TILE, ['N', 'W']), TILE, TILE, 7, 0);
place(network(TILE, TILE, ['N', 'E', 'S', 'W']), TILE, TILE, 8, 0);
place(network(TILE, TILE, ['N']), TILE, TILE, 9, 0);
place(network(TILE, TILE, ['E']), TILE, TILE, 10, 0);
place(network(TILE, TILE, ['S']), TILE, TILE, 11, 0);
place(network(TILE, TILE, ['W']), TILE, TILE, 12, 0);
place(network(TILE, TILE, ['N', 'E', 'W']), TILE, TILE, 4, 1);
place(network(TILE, TILE, ['N', 'E', 'S']), TILE, TILE, 5, 1);
place(network(TILE, TILE, ['E', 'S', 'W']), TILE, TILE, 6, 1);
place(network(TILE, TILE, ['N', 'S', 'W']), TILE, TILE, 7, 1);
place(doorway(TILE * 3, TILE, 'horizontal'), TILE * 3, TILE, 0, 3);
place(windowWall(TILE * 3, TILE, 'horizontal'), TILE * 3, TILE, 0, 4);
place(doorway(TILE, TILE * 3, 'vertical'), TILE, TILE * 3, 4, 2);
place(windowWall(TILE, TILE * 3, 'vertical'), TILE, TILE * 3, 5, 2);
place(network(TILE, TILE * 3, ['N', 'S'], 'glass'), TILE, TILE * 3, 6, 2);
place(network(TILE, TILE * 3, ['N', 'S'], 'divider'), TILE, TILE * 3, 7, 2);
place(network(TILE * 3, TILE, ['W', 'E'], 'glass'), TILE * 3, TILE, 8, 3);
place(network(TILE * 3, TILE, ['W', 'E'], 'divider'), TILE * 3, TILE, 8, 4);

await mkdir(file('apps/web/public/NestWork/construction'), { recursive: true });
await sharp(sheet, { raw: { width: sheetWidth, height: ROWS * TILE, channels: 4 } })
  .png()
  .toFile(file(OUTPUT));

console.log(`Built ${COLS}×${ROWS} modular NestWork wall sheet with exact 32px connectors.`);
