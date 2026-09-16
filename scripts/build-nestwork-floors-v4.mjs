// Build one repeatable 32×32 texture for each NestWork floor brush.
// One bitmap equals one builder cell; the finer material pattern lives inside
// that cell and is never resized by Phaser.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;
const SIZE = 32;
const OUTPUT_DIRECTORY = 'apps/web/public/NestWork/floors';

const hex = (value) => {
  const clean = value.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16));
};

function canvas(background) {
  const [r, g, b] = hex(background);
  const data = Buffer.alloc(SIZE * SIZE * 3);
  for (let offset = 0; offset < data.length; offset += 3) {
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
  }
  return data;
}

function pixel(data, x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const [r, g, b] = hex(color);
  const offset = (y * SIZE + x) * 3;
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
}

function rect(data, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) pixel(data, px, py, color);
  }
}

function seamless(data) {
  for (let y = 0; y < SIZE; y += 1) {
    const source = y * SIZE * 3;
    const target = (y * SIZE + SIZE - 1) * 3;
    data.copy(data, target, source, source + 3);
  }
  data.copy(data, (SIZE - 1) * SIZE * 3, 0, SIZE * 3);
  return data;
}

function ivoryTile() {
  const data = canvas('#eee9dd');
  const grout = '#b9bab6';
  for (const line of [0, 15, 16, 31]) {
    rect(data, line, 0, 1, SIZE, grout);
    rect(data, 0, line, SIZE, 1, grout);
  }
  for (const x of [1, 17]) {
    for (const y of [1, 17]) {
      rect(data, x + 1, y + 1, 11, 1, '#faf7ef');
      pixel(data, x + 11, y + 11, '#ddd9d0');
    }
  }
  [[6, 7], [22, 10], [10, 23], [25, 25]].forEach(([x, y]) => pixel(data, x, y, '#e1dcd2'));
  return seamless(data);
}

function oakFloor() {
  const data = canvas('#b7865e');
  const colors = ['#bd8e65', '#b5825b', '#c09268', '#b98a61'];
  const joints = [20, 9, 24, 15];
  for (let row = 0; row < 4; row += 1) {
    const top = row * 8;
    rect(data, 0, top + 1, SIZE, 6, colors[row]);
    rect(data, 0, top, SIZE, 1, '#765a48');
    rect(data, 0, top + 7, SIZE, 1, '#8f6a50');
    rect(data, joints[row], top + 1, 1, 6, '#765a48');
    rect(data, 2, top + 2, Math.max(2, joints[row] - 4), 1, '#d0a378');
  }
  [[5, 5, 4], [23, 12, 5], [3, 20, 5], [18, 27, 6]].forEach(([x, y, width]) => {
    rect(data, x, y, width, 1, '#9f7354');
  });
  return seamless(data);
}

function graphiteCarpet() {
  const data = canvas('#30394a');
  for (let y = 1; y < SIZE - 1; y += 3) {
    for (let x = 1; x < SIZE - 1; x += 3) {
      const alternate = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0;
      pixel(data, x, y, alternate ? '#4d5870' : '#263142');
      pixel(data, x + 1, y + 1, alternate ? '#39455a' : '#59647a');
    }
  }
  return seamless(data);
}

function slateTile() {
  const data = canvas('#69769d');
  for (const line of [0, 15, 16, 31]) {
    rect(data, line, 0, 1, SIZE, '#39445f');
    rect(data, 0, line, SIZE, 1, '#39445f');
  }
  for (const x of [1, 17]) {
    for (const y of [1, 17]) {
      rect(data, x + 1, y + 1, 11, 1, '#8590b4');
      pixel(data, x + 10, y + 9, '#606c92');
    }
  }
  return seamless(data);
}

const floors = [
  ['ivory-tile-32-v4.png', ivoryTile()],
  ['oak-32-v4.png', oakFloor()],
  ['graphite-carpet-32-v4.png', graphiteCarpet()],
  ['slate-tile-32-v4.png', slateTile()],
];

await mkdir(file(OUTPUT_DIRECTORY), { recursive: true });
for (const [filename, data] of floors) {
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(file(`${OUTPUT_DIRECTORY}/${filename}`));
}

console.log(`Built ${floors.length} native ${SIZE}×${SIZE} NestWork floor brushes.`);
