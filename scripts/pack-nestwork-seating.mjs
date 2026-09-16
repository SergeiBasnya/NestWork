// Build the grid-native seating sheet from original NestWork source renders.
// Run from the repository root: node scripts/pack-nestwork-seating.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { trimSparseAlphaEdges } from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const OUTPUT_COLS = 6;
const OUTPUT_ROWS = 4;
const SEATING_SOURCE = 'docs/asset-prototypes/nestwork-seating-source-v1.png';
const TABLE_SOURCE = 'docs/asset-prototypes/nestwork-cafe-table-source-v2.png';
const OUTPUT = 'apps/web/public/NestWork/office/starter-seating-v2.png';

const ASSETS = [
  { source: 'seating', sourceCol: 0, sourceRow: 0, sourceCols: 4, sourceRows: 3, col: 0, row: 0, w: 1, h: 1, renderW: 28, renderH: 29 },
  { source: 'seating', sourceCol: 1, sourceRow: 0, sourceCols: 4, sourceRows: 3, col: 1, row: 0, w: 1, h: 1, renderW: 28, renderH: 29 },
  { source: 'seating', sourceCol: 2, sourceRow: 0, sourceCols: 4, sourceRows: 3, col: 2, row: 0, w: 1, h: 1, renderW: 28, renderH: 29 },
  { source: 'seating', sourceCol: 3, sourceRow: 0, sourceCols: 4, sourceRows: 3, col: 3, row: 0, w: 1, h: 1, renderW: 28, renderH: 29 },
  { source: 'seating', sourceCol: 0, sourceRow: 2, sourceCols: 4, sourceRows: 3, col: 0, row: 1, w: 1, h: 1, renderW: 27, renderH: 29 },
  { source: 'seating', sourceCol: 1, sourceRow: 2, sourceCols: 4, sourceRows: 3, col: 1, row: 1, w: 1, h: 1, renderW: 27, renderH: 29 },
  { source: 'seating', sourceCol: 2, sourceRow: 2, sourceCols: 4, sourceRows: 3, col: 2, row: 1, w: 1, h: 1, renderW: 27, renderH: 29 },
  { source: 'seating', sourceCol: 3, sourceRow: 2, sourceCols: 4, sourceRows: 3, col: 3, row: 1, w: 1, h: 1, renderW: 27, renderH: 29 },
  { source: 'seating', sourceCol: 0, sourceRow: 1, sourceCols: 4, sourceRows: 3, col: 0, row: 2, w: 1, h: 1, renderW: 30, renderH: 29 },
  { source: 'seating', sourceCol: 1, sourceRow: 1, sourceCols: 4, sourceRows: 3, col: 1, row: 2, w: 1, h: 1, renderW: 30, renderH: 29 },
  { source: 'seating', sourceCol: 2, sourceRow: 1, sourceCols: 4, sourceRows: 3, col: 2, row: 2, w: 1, h: 1, renderW: 30, renderH: 29 },
  { source: 'seating', sourceCol: 3, sourceRow: 1, sourceCols: 4, sourceRows: 3, col: 3, row: 2, w: 1, h: 1, renderW: 30, renderH: 29 },
  { source: 'table', sourceCol: 0, sourceRow: 0, sourceCols: 1, sourceRows: 1, col: 4, row: 2, w: 2, h: 2, renderW: 44, renderH: 42 },
];

async function removeExteriorNeutral(path, neutralMin = 115, neutralSpread = 14) {
  const { data, info } = await sharp(file(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  const isBackground = (pixel) => {
    const offset = pixel * 4;
    if (!data[offset + 3]) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return Math.max(red, green, blue) - Math.min(red, green, blue) <= neutralSpread
      && Math.min(red, green, blue) >= neutralMin;
  };
  let head = 0;
  let tail = 0;
  const enqueue = (pixel) => {
    if (seen[pixel] || !isBackground(pixel)) return;
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
    data.fill(0, pixel * 4, pixel * 4 + 4);
    if (pixel % info.width) enqueue(pixel - 1);
    if (pixel % info.width < info.width - 1) enqueue(pixel + 1);
    if (pixel >= info.width) enqueue(pixel - info.width);
    if (pixel < info.width * (info.height - 1)) enqueue(pixel + info.width);
  }
  return { data, info };
}

function cellRect(info, asset) {
  const left = Math.floor((asset.sourceCol * info.width) / asset.sourceCols);
  const top = Math.floor((asset.sourceRow * info.height) / asset.sourceRows);
  const right = Math.floor(((asset.sourceCol + 1) * info.width) / asset.sourceCols);
  const bottom = Math.floor(((asset.sourceRow + 1) * info.height) / asset.sourceRows);
  return { left, top, width: right - left, height: bottom - top };
}

function keepLargestComponent(data, info, rect) {
  const visited = new Uint8Array(rect.width * rect.height);
  const queue = new Int32Array(rect.width * rect.height);
  const components = [];
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
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < rect.left || nx >= rect.left + rect.width || ny < rect.top || ny >= rect.top + rect.height) continue;
          const next = localIndex(nx, ny);
          if (visited[next] || !isVisible(nx, ny)) continue;
          visited[next] = 1;
          queue[tail++] = ny * info.width + nx;
        }
      }
      components.push(component);
    }
  }

  const keep = new Set(components.sort((left, right) => right.length - left.length)[0] ?? []);
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const pixel = y * info.width + x;
      if (!keep.has(pixel)) data.fill(0, pixel * 4, pixel * 4 + 4);
    }
  }
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

const sources = {
  seating: await removeExteriorNeutral(SEATING_SOURCE),
  table: await removeExteriorNeutral(TABLE_SOURCE, 100, 32),
};
const composites = [];
for (const asset of ASSETS) {
  const source = sources[asset.source];
  const rect = cellRect(source.info, asset);
  keepLargestComponent(source.data, source.info, rect);
  const bounds = contentBounds(source.data, source.info, rect);
  const scale = Math.min(asset.renderW / bounds.width, asset.renderH / bounds.height);
  const width = Math.max(1, Math.floor(bounds.width * scale));
  const height = Math.max(1, Math.floor(bounds.height * scale));
  const resized = await sharp(source.data, { raw: source.info })
    .extract(bounds)
    .resize(width, height, { kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (asset.source === 'table') {
    trimSparseAlphaEdges(resized.data, resized.info, {
      left: 0,
      top: 0,
      width: resized.info.width,
      height: resized.info.height,
    }, 3);
  }
  const input = await sharp(resized.data, { raw: resized.info }).png().toBuffer();
  composites.push({
    input,
    left: asset.col * TILE + Math.floor((asset.w * TILE - width) / 2),
    top: asset.row * TILE + asset.h * TILE - height - 2,
  });
}

await mkdir(file('apps/web/public/NestWork/office'), { recursive: true });
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
  .toFile(file(OUTPUT));

console.log(`Packed ${ASSETS.length} grid-native seating assets into ${OUTPUT_COLS}×${OUTPUT_ROWS} tiles.`);
