// Convert the generated 4×4 shared-spaces contact sheet into a tile-aligned
// transparent runtime sheet. Run from the repository root:
// node scripts/pack-nestwork-shared-spaces.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { removeExteriorNeutral, removeSmallAlphaComponents, trimSparseAlphaEdges } from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const OUTPUT_COLS = 13;
const OUTPUT_ROWS = 13;
const SOURCE = 'docs/asset-prototypes/nestwork-shared-spaces-source-v2.png';
const TREE_SOURCE = 'docs/asset-prototypes/nestwork-indoor-tree-source-v1.png';
const VENDING_SOURCE = 'docs/asset-prototypes/nestwork-vending-source-v2.png';
const RUG_SOURCE = 'docs/asset-prototypes/nestwork-round-rug-source-v2.png';
const OUTPUT = 'apps/web/public/NestWork/shared-spaces/starter-shared-spaces-v2.png';

const ASSETS = [
  { sourceCol: 0, sourceRow: 0, col: 0, row: 0, w: 4, h: 3, renderW: 96, renderH: 64 }, // reception counter
  { sourceCol: 1, sourceRow: 0, largestOnly: true, col: 4, row: 0, w: 2, h: 2, renderW: 52, renderH: 44 }, // whiteboard
  { sourceCol: 2, sourceRow: 0, col: 7, row: 0, w: 3, h: 3, renderW: 64, renderH: 60 }, // notice board
  { sourceCol: 3, sourceRow: 0, col: 10, row: 0, w: 3, h: 3, renderW: 64, renderH: 68, cleanComponents: true }, // lockers
  { sourceCol: 0, sourceRow: 1, col: 0, row: 3, w: 2, h: 4, renderW: 40, renderH: 72 }, // coat rack
  { source: 'vending', sourceCol: 0, sourceRow: 0, sourceCols: 1, sourceRows: 1, col: 2, row: 3, w: 2, h: 4, renderW: 48, renderH: 76, cleanNeutral: true }, // vending machine
  { sourceCol: 2, sourceRow: 1, col: 4, row: 3, w: 3, h: 4, renderW: 64, renderH: 72 }, // supply shelf
  { sourceCol: 3, sourceRow: 1, col: 7, row: 3, w: 2, h: 4, renderW: 48, renderH: 84 }, // phone booth
  { source: 'rug', sourceCol: 0, sourceRow: 0, sourceCols: 1, sourceRows: 1, col: 0, row: 7, w: 3, h: 3, renderW: 64, renderH: 48, cleanNeutral: true }, // round rug
  { sourceCol: 1, sourceRow: 2, col: 3, row: 7, w: 2, h: 2, renderW: 48, renderH: 32 }, // poufs
  { sourceCol: 2, sourceRow: 2, col: 5, row: 7, w: 4, h: 3, renderW: 96, renderH: 60, cleanNeutral: true }, // high table
  { sourceCol: 3, sourceRow: 2, col: 9, row: 7, w: 3, h: 3, renderW: 64, renderH: 64, cleanNeutral: true, neutralMin: 90 }, // projector screen
  { source: 'tree', sourceCol: 0, sourceRow: 0, sourceCols: 1, sourceRows: 1, largestOnly: true, col: 0, row: 10, w: 2, h: 3, renderW: 48, renderH: 84 }, // indoor tree
  { sourceCol: 1, sourceRow: 3, col: 2, row: 10, w: 2, h: 2, renderW: 32, renderH: 32 }, // clock
  { sourceCol: 2, sourceRow: 3, col: 4, row: 10, w: 3, h: 3, renderW: 64, renderH: 64, cleanNeutral: true, neutralMin: 90 }, // mail cabinet
  { sourceCol: 3, sourceRow: 3, col: 7, row: 10, w: 1, h: 2, renderW: 28, renderH: 44 }, // first aid cabinet
];

function cellRect(info, col, row, padTop = 0, cols = 4, rows = 4) {
  const left = Math.floor((col * info.width) / cols);
  const sourceTop = Math.floor((row * info.height) / rows);
  const top = Math.max(0, sourceTop - padTop);
  const right = Math.floor(((col + 1) * info.width) / cols);
  const bottom = Math.floor(((row + 1) * info.height) / rows);
  return { left, top, width: right - left, height: bottom - top };
}

async function removeGeneratedCheckerboard(path) {
  const { data, info } = await sharp(file(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  const isExterior = (pixel) => {
    if (data[pixel * 4 + 3] === 0) return true;
    const r = data[pixel * 4];
    const g = data[pixel * 4 + 1];
    const b = data[pixel * 4 + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) <= 12 && Math.min(r, g, b) >= 145;
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

function keepSignificantComponents(data, info, rect, largestOnly = false) {
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
      components.push(component);
    }
  }

  const largest = Math.max(0, ...components.map((component) => component.length));
  const keep = new Set(
    components
      .filter((component) => largestOnly ? component.length === largest : component.length >= Math.max(24, largest * 0.025))
      .flat(),
  );
  for (let y = rect.top; y < rect.top + rect.height; y++) {
    for (let x = rect.left; x < rect.left + rect.width; x++) {
      const pixel = y * info.width + x;
      if (!keep.has(pixel)) data[pixel * 4 + 3] = 0;
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
  shared: await removeGeneratedCheckerboard(SOURCE),
  tree: await removeGeneratedCheckerboard(TREE_SOURCE),
  vending: await removeGeneratedCheckerboard(VENDING_SOURCE),
  rug: await removeGeneratedCheckerboard(RUG_SOURCE),
};
const composites = [];
for (const asset of ASSETS) {
  const { data, info } = sources[asset.source ?? 'shared'];
  const rect = cellRect(
    info,
    asset.sourceCol,
    asset.sourceRow,
    asset.sourcePadTop,
    asset.sourceCols,
    asset.sourceRows,
  );
  if (asset.cleanNeutral) removeExteriorNeutral(data, info, rect, asset.neutralMin ?? 120, 28);
  keepSignificantComponents(data, info, rect, asset.largestOnly);
  const bounds = contentBounds(data, info, rect);
  const targetWidth = asset.w * TILE;
  const targetHeight = asset.h * TILE;
  const scale = Math.min(asset.renderW / bounds.width, asset.renderH / bounds.height);
  const width = Math.max(1, Math.floor(bounds.width * scale));
  const height = Math.max(1, Math.floor(bounds.height * scale));
  const resized = await sharp(data, { raw: info })
    .extract(bounds)
    .resize(width, height, { kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const resizedRect = {
    left: 0,
    top: 0,
    width: resized.info.width,
    height: resized.info.height,
  };
  if (asset.cleanNeutral) {
    removeExteriorNeutral(resized.data, resized.info, resizedRect, asset.neutralMin ?? 120, 28);
  }
  if (asset.cleanNeutral || asset.cleanComponents) {
    removeSmallAlphaComponents(resized.data, resized.info, resizedRect, {
      minimumPixels: 12,
      minimumRatio: 0.012,
      largestOnly: asset.largestOnly,
    });
  }
  if (asset.source === 'vending') trimSparseAlphaEdges(resized.data, resized.info, resizedRect, 2);
  const input = await sharp(resized.data, { raw: resized.info }).png().toBuffer();
  composites.push({
    input,
    left: asset.col * TILE + Math.floor((targetWidth - width) / 2),
    top: asset.row * TILE + targetHeight - height - 2,
  });
}

await mkdir(file('apps/web/public/NestWork/shared-spaces'), { recursive: true });
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

console.log(`Packed ${ASSETS.length} original shared-space assets into ${OUTPUT_COLS}×${OUTPUT_ROWS} tiles.`);
