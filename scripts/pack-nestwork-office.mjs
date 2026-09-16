// Convert the generated 4×4 contact sheet into a tile-aligned runtime sheet.
// Run from the repository root: node scripts/pack-nestwork-office.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import {
  assertNoMagentaResidue,
  assertTransparentMargin,
  removeExteriorNeutral,
  removeSmallAlphaComponents,
} from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const OUTPUT_COLS = 12;
const OUTPUT_ROWS = 10;
const SOURCE = 'docs/asset-prototypes/nestwork-office-starter-source-v1.png';
const LAMP_SOURCE = 'docs/asset-prototypes/nestwork-floor-lamp-source-v4.png';
const OUTPUT = 'apps/web/public/NestWork/office/starter-office-v2.png';

// Source contact-sheet position followed by the tile-aligned runtime slot.
const ASSETS = [
  { sourceCol: 0, sourceRow: 0, col: 0, row: 0, w: 3, h: 2, renderW: 64, renderH: 48 }, // desk
  { sourceCol: 1, sourceRow: 0, col: 3, row: 0, w: 2, h: 2, renderW: 32, renderH: 44, largestOnly: true }, // office chair
  { sourceCol: 2, sourceRow: 0, col: 5, row: 0, w: 4, h: 2, renderW: 96, renderH: 50 }, // bench desk
  { sourceCol: 3, sourceRow: 0, col: 9, row: 0, w: 3, h: 2, renderW: 64, renderH: 48 }, // sofa
  { sourceCol: 0, sourceRow: 1, col: 0, row: 2, w: 3, h: 3, renderW: 64, renderH: 80 }, // bookshelf
  { sourceCol: 1, sourceRow: 1, col: 3, row: 2, w: 3, h: 2, renderW: 64, renderH: 46 }, // low cabinet
  { sourceCol: 2, sourceRow: 1, col: 6, row: 2, w: 2, h: 3, renderW: 48, renderH: 68 }, // coffee station
  { sourceCol: 3, sourceRow: 1, col: 8, row: 2, w: 4, h: 3, renderW: 96, renderH: 72 }, // meeting table
  { sourceCol: 0, sourceRow: 2, col: 0, row: 5, w: 2, h: 3, renderW: 48, renderH: 64, cleanNeutral: true, neutralMin: 90 }, // large plant
  { sourceCol: 1, sourceRow: 2, col: 2, row: 5, w: 1, h: 2, renderW: 24, renderH: 30, cleanNeutral: true, neutralMin: 70 }, // small plant
  { sourceCol: 2, sourceRow: 2, col: 3, row: 5, w: 1, h: 2, renderW: 24, renderH: 48 }, // water cooler
  { sourceCol: 3, sourceRow: 2, col: 4, row: 5, w: 3, h: 2, renderW: 56, renderH: 44 }, // printer cabinet
  { sourceCol: 0, sourceRow: 3, col: 0, row: 8, w: 2, h: 2, renderW: 40, renderH: 48 }, // lounge chair
  { sourceCol: 1, sourceRow: 3, col: 2, row: 8, w: 3, h: 2, renderW: 64, renderH: 44 }, // cafe table
  { source: 'lamp', sourceCol: 0, sourceRow: 0, sourceCols: 1, sourceRows: 1, col: 5, row: 8, w: 1, h: 2, renderW: 20, renderH: 48, normalizedSource: true }, // floor lamp
  { sourceCol: 3, sourceRow: 3, col: 6, row: 8, w: 3, h: 2, renderW: 64, renderH: 42 }, // recycling bins
];

async function removeExteriorWhite(path) {
  const { data, info } = await sharp(file(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const isBackground = (pixel) =>
    data[pixel * 4 + 3] === 0 ||
    (data[pixel * 4] > 232 && data[pixel * 4 + 1] > 232 && data[pixel * 4 + 2] > 232);
  let head = 0;
  let tail = 0;
  const enqueue = (pixel) => {
    if (seen[pixel] || !isBackground(pixel)) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    data[pixel * 4 + 3] = 0;
    if (pixel % width) enqueue(pixel - 1);
    if (pixel % width < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel < width * (height - 1)) enqueue(pixel + width);
  }
  return { data, info };
}

function contentBounds(data, info, left, top, width, height) {
  let minX = left + width;
  let minY = top + height;
  let maxX = left;
  let maxY = top;
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX > maxX || minY > maxY) throw new Error(`Empty source cell at ${left},${top}`);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function keepSignificantComponents(data, info, left, top, width, height, minimumRatio) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components = [];
  const localIndex = (x, y) => (y - top) * width + x - left;
  const isVisible = (x, y) => data[(y * info.width + x) * 4 + 3] >= 16;

  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
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
          if (nx < left || nx >= left + width || ny < top || ny >= top + height) return;
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
  const keep = new Set(components.filter((component) => component.length >= largest * minimumRatio).flat());
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      const pixel = y * info.width + x;
      if (!keep.has(pixel)) data[pixel * 4 + 3] = 0;
    }
  }
}

const sources = {
  office: await removeExteriorWhite(SOURCE),
  lamp: await sharp(file(LAMP_SOURCE)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
};
assertTransparentMargin(sources.lamp.data, sources.lamp.info, LAMP_SOURCE, 16);
assertNoMagentaResidue(sources.lamp.data, sources.lamp.info, LAMP_SOURCE);
const composites = [];
for (const asset of ASSETS) {
  const { data, info } = sources[asset.source ?? 'office'];
  const sourceCols = asset.sourceCols ?? 4;
  const sourceRows = asset.sourceRows ?? 4;
  const cellLeft = Math.floor((asset.sourceCol * info.width) / sourceCols);
  const cellTop = Math.floor((asset.sourceRow * info.height) / sourceRows);
  const cellRight = Math.floor(((asset.sourceCol + 1) * info.width) / sourceCols);
  const cellBottom = Math.floor(((asset.sourceRow + 1) * info.height) / sourceRows);
  const cell = {
    left: cellLeft,
    top: cellTop,
    width: cellRight - cellLeft,
    height: cellBottom - cellTop,
  };
  if (asset.cleanNeutral) removeExteriorNeutral(data, info, cell, asset.neutralMin ?? 120, 28);
  keepSignificantComponents(
    data,
    info,
    cellLeft,
    cellTop,
    cellRight - cellLeft,
    cellBottom - cellTop,
    asset.largestOnly ? 1 : asset.source === 'lamp' ? 0.01 : 0.04,
  );
  const bounds = contentBounds(data, info, cellLeft, cellTop, cellRight - cellLeft, cellBottom - cellTop);
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
  const resizedRect = { left: 0, top: 0, width: resized.info.width, height: resized.info.height };
  if (asset.cleanNeutral) {
    removeExteriorNeutral(resized.data, resized.info, resizedRect, asset.neutralMin ?? 120, 28);
  }
  if (asset.cleanNeutral) {
    removeSmallAlphaComponents(resized.data, resized.info, resizedRect, {
      minimumPixels: asset.source === 'lamp' ? 2 : 12,
      minimumRatio: asset.source === 'lamp' ? 0.002 : 0.012,
    });
  }
  const input = await sharp(resized.data, { raw: resized.info }).png().toBuffer();
  composites.push({
    input,
    left: asset.col * TILE + Math.floor((targetWidth - width) / 2),
    top: asset.row * TILE + targetHeight - height - 2,
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

console.log(`Packed ${ASSETS.length} original office assets into ${OUTPUT_COLS}×${OUTPUT_ROWS} tiles.`);
