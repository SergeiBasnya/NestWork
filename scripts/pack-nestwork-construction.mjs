// Convert the generated 4×4 construction contact sheet into the legacy,
// tile-aligned structure sheet kept for saved-map compatibility.
// Current floors are built natively by build-nestwork-floors-v3.mjs.
// Run from the repository root:
// node scripts/pack-nestwork-construction.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const SOURCE = 'docs/asset-prototypes/nestwork-construction-source-v1.png';
const STRUCTURE_OUTPUT = 'apps/web/public/NestWork/construction/starter-structure-v1.png';
const OUTPUT_COLS = 12;
const OUTPUT_ROWS = 8;

// Source contact-sheet position followed by the tile-aligned runtime slot.
const STRUCTURES = [
  { sourceCol: 0, sourceRow: 1, col: 0, row: 0, w: 3, h: 1 }, // solid horizontal wall
  { sourceCol: 1, sourceRow: 1, col: 3, row: 0, w: 3, h: 1 }, // glass horizontal wall
  { sourceCol: 2, sourceRow: 1, col: 6, row: 0, w: 3, h: 1 }, // horizontal divider
  { sourceCol: 3, sourceRow: 1, col: 9, row: 0, w: 3, h: 2 }, // horizontal window
  { sourceCol: 0, sourceRow: 2, col: 0, row: 2, w: 1, h: 3 }, // solid vertical wall
  { sourceCol: 1, sourceRow: 2, col: 1, row: 2, w: 1, h: 3 }, // glass vertical wall
  { sourceCol: 2, sourceRow: 2, col: 2, row: 2, w: 1, h: 3 }, // vertical divider
  { sourceCol: 3, sourceRow: 2, col: 3, row: 2, w: 2, h: 3 }, // vertical window
  { sourceCol: 0, sourceRow: 3, col: 0, row: 5, w: 2, h: 2 }, // solid corner
  { sourceCol: 1, sourceRow: 3, col: 2, row: 5, w: 3, h: 2 }, // horizontal doorway
  { sourceCol: 2, sourceRow: 3, col: 5, row: 5, w: 2, h: 3 }, // vertical doorway
  { sourceCol: 3, sourceRow: 3, col: 7, row: 5, w: 3, h: 3 }, // cross junction
];

function cellRect(info, col, row) {
  const left = Math.floor((col * info.width) / 4);
  const top = Math.floor((row * info.height) / 4);
  const right = Math.floor(((col + 1) * info.width) / 4);
  const bottom = Math.floor(((row + 1) * info.height) / 4);
  return { left, top, width: right - left, height: bottom - top };
}

async function removeGeneratedCheckerboard(path) {
  const { data, info } = await sharp(file(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  // Image generation returned a neutral light-gray/white checkerboard rather
  // than alpha. Both squares and their antialiased transition remain connected
  // to the canvas edge; the dark object outlines stop the flood fill.
  const isExterior = (pixel) => {
    if (data[pixel * 4 + 3] === 0) return true;
    const r = data[pixel * 4];
    const g = data[pixel * 4 + 1];
    const b = data[pixel * 4 + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12 && Math.min(r, g, b) >= 155;
  };
  let head = 0;
  let tail = 0;
  const enqueue = (pixel) => {
    if (seen[pixel] || !isExterior(pixel)) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < info.width; x++) {
    enqueue(x);
    enqueue((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y++) {
    enqueue(y * info.width);
    enqueue(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    data[pixel * 4 + 3] = 0;
    if (pixel % info.width) enqueue(pixel - 1);
    if (pixel % info.width < info.width - 1) enqueue(pixel + 1);
    if (pixel >= info.width) enqueue(pixel - info.width);
    if (pixel < info.width * (info.height - 1)) enqueue(pixel + info.width);
  }
  return { data, info };
}

function contentBounds(data, info, rect) {
  let minX = rect.left + rect.width;
  let minY = rect.top + rect.height;
  let maxX = rect.left;
  let maxY = rect.top;
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX > maxX || minY > maxY) throw new Error(`Empty source cell at ${rect.left},${rect.top}`);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function keepLargestComponent(data, info, rect) {
  const visited = new Uint8Array(rect.width * rect.height);
  const queue = new Int32Array(rect.width * rect.height);
  let largest = [];
  const localIndex = (x, y) => (y - rect.top) * rect.width + x - rect.left;
  const isVisible = (x, y) => data[(y * info.width + x) * 4 + 3] >= 16;

  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const start = localIndex(x, y);
      if (visited[start] || !isVisible(x, y)) continue;
      let head = 0;
      let tail = 0;
      const component = [];
      visited[start] = 1;
      queue[tail++] = y * info.width + x;
      while (head < tail) {
        const pixel = queue[head++];
        const px = pixel % info.width;
        const py = Math.floor(pixel / info.width);
        component.push(pixel);
        const visit = (nx, ny) => {
          if (nx < rect.left || nx >= rect.left + rect.width || ny < rect.top || ny >= rect.top + rect.height) return;
          const index = localIndex(nx, ny);
          if (visited[index] || !isVisible(nx, ny)) return;
          visited[index] = 1;
          queue[tail++] = ny * info.width + nx;
        };
        visit(px - 1, py);
        visit(px + 1, py);
        visit(px, py - 1);
        visit(px, py + 1);
      }
      if (component.length > largest.length) largest = component;
    }
  }

  const keep = new Set(largest);
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const pixel = y * info.width + x;
      if (!keep.has(pixel)) data[pixel * 4 + 3] = 0;
    }
  }
}

const { data, info } = await removeGeneratedCheckerboard(SOURCE);

const composites = [];
for (const asset of STRUCTURES) {
  const rect = cellRect(info, asset.sourceCol, asset.sourceRow);
  keepLargestComponent(data, info, rect);
  const bounds = contentBounds(data, info, rect);
  const targetWidth = asset.w * TILE;
  const targetHeight = asset.h * TILE;
  const input = await sharp(data, { raw: info })
    .extract(bounds)
    .resize(targetWidth, targetHeight, { kernel: 'nearest', fit: 'fill' })
    .png()
    .toBuffer();
  composites.push({ input, left: asset.col * TILE, top: asset.row * TILE });
}

await mkdir(file('apps/web/public/NestWork/construction'), { recursive: true });
await sharp({
  create: {
    width: OUTPUT_COLS * TILE,
    height: OUTPUT_ROWS * TILE,
    channels: 4,
    background: '#00000000',
  },
})
  .composite(composites)
  .png()
  .toFile(file(STRUCTURE_OUTPUT));

console.log(`Packed ${STRUCTURES.length} legacy structures on a ${TILE}px grid.`);
