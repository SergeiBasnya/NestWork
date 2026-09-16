// Build the NestWork floor library directly on its final 64×64 pixel grid.
// These textures deliberately use a short palette and hard pixel edges: no AI
// source crop, photographic grain or high-resolution downscaling enters the
// runtime assets.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;
const SIZE = 64;
const OUTPUT_DIRECTORY = 'apps/web/public/NestWork/floors';

const hex = (value) => {
  const clean = value.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16));
};

function canvas(background) {
  const [r, g, b] = hex(background);
  const data = Buffer.alloc(SIZE * SIZE * 3);
  for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) {
    data[pixel * 3] = r;
    data[pixel * 3 + 1] = g;
    data[pixel * 3 + 2] = b;
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
  // The first and last rows/columns are identical so Canvas TileSprite can
  // repeat the texture without revealing its 64px boundary.
  for (let y = 0; y < SIZE; y += 1) {
    const source = (y * SIZE) * 3;
    const target = (y * SIZE + SIZE - 1) * 3;
    data.copy(data, target, source, source + 3);
  }
  data.copy(data, (SIZE - 1) * SIZE * 3, 0, SIZE * 3);
  return data;
}

function ivoryTile() {
  const data = canvas('#eee9dd');
  const grout = '#b9bab6';
  const groutLight = '#d7d5cd';
  for (const line of [0, 31, 32, 63]) {
    rect(data, line, 0, 1, SIZE, grout);
    rect(data, 0, line, SIZE, 1, grout);
  }
  for (const start of [1, 33]) {
    rect(data, start + 1, 2, 27, 1, '#faf7ef');
    rect(data, 2, start + 1, 1, 27, '#faf7ef');
    rect(data, start + 28, 3, 1, 26, groutLight);
    rect(data, 3, start + 28, 26, 1, groutLight);
  }
  [[12, 11], [18, 14], [43, 20], [49, 15], [15, 45], [45, 47]].forEach(([x, y]) => {
    pixel(data, x, y, '#e2ddd2');
    pixel(data, x + 1, y, '#e2ddd2');
  });
  return seamless(data);
}

function oakFloor() {
  const data = canvas('#b7865e');
  const rowColors = ['#bd8e65', '#b5825b', '#c09268', '#b98a61'];
  const seams = '#765a48';
  const joints = [38, 21, 46, 29];
  for (let row = 0; row < 4; row += 1) {
    const top = row * 16;
    rect(data, 0, top + 1, SIZE, 14, rowColors[row]);
    rect(data, 0, top, SIZE, 1, seams);
    rect(data, 0, top + 15, SIZE, 1, '#8f6a50');
    rect(data, joints[row], top + 1, 2, 14, seams);
    rect(data, 2, top + 2, joints[row] - 5, 1, '#d0a378');
    rect(data, joints[row] + 3, top + 2, SIZE - joints[row] - 6, 1, '#d0a378');
  }
  const grain = [
    [8, 8, 7], [25, 12, 5], [48, 7, 8], [6, 25, 6], [31, 21, 8], [49, 28, 5],
    [11, 39, 8], [35, 44, 5], [50, 37, 7], [5, 56, 6], [21, 52, 7], [43, 59, 8],
  ];
  grain.forEach(([x, y, width], index) => rect(data, x, y, width, 1, index % 2 ? '#a87857' : '#c3976d'));
  [[17, 6], [18, 7], [53, 23], [54, 24], [13, 54], [14, 55], [37, 35]].forEach(([x, y]) => pixel(data, x, y, '#8f684f'));
  return seamless(data);
}

function graphiteCarpet() {
  const data = canvas('#30394a');
  for (let y = 1; y < SIZE - 1; y += 4) {
    for (let x = 1; x < SIZE - 1; x += 4) {
      const alternate = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      pixel(data, x, y, alternate ? '#465269' : '#263142');
      pixel(data, x + 1, y + 1, alternate ? '#39455a' : '#536079');
      pixel(data, x + 2, y, '#202938');
      pixel(data, x, y + 2, '#59647a');
    }
  }
  return seamless(data);
}

function slateTile() {
  const data = canvas('#69769d');
  const grout = '#39445f';
  for (const line of [0, 31, 32, 63]) {
    rect(data, line, 0, 1, SIZE, grout);
    rect(data, 0, line, SIZE, 1, grout);
  }
  for (const x of [1, 33]) {
    for (const y of [1, 33]) {
      rect(data, x + 2, y + 2, 26, 1, '#8590b4');
      rect(data, x + 2, y + 3, 1, 25, '#7884aa');
      rect(data, x + 5, y + 21, 12, 1, '#606c92');
      pixel(data, x + 23, y + 8, '#7581a8');
      pixel(data, x + 24, y + 9, '#7581a8');
    }
  }
  return seamless(data);
}

const floors = [
  ['ivory-tile-64-v3.png', ivoryTile()],
  ['oak-64-v3.png', oakFloor()],
  ['graphite-carpet-64-v3.png', graphiteCarpet()],
  ['slate-tile-64-v3.png', slateTile()],
];

await mkdir(file(OUTPUT_DIRECTORY), { recursive: true });
for (const [filename, data] of floors) {
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(file(`${OUTPUT_DIRECTORY}/${filename}`));
}

console.log(`Built ${floors.length} native ${SIZE}×${SIZE} NestWork floors.`);
