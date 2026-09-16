// Build isolated high tables and cardinal stools from generated sources.
// Run from the repository root: node scripts/pack-nestwork-high-collaboration.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { alphaBounds, removeSmallAlphaComponents } from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const OUTPUT = 'apps/web/public/NestWork/collaboration/high-collaboration-v1.png';
const OUTPUT_COLS = 4;
const OUTPUT_ROWS = 7;

async function loadSource(path, chroma) {
  const source = await sharp(file(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let pixel = 0; pixel < source.info.width * source.info.height; pixel++) {
    const offset = pixel * 4;
    const red = source.data[offset];
    const green = source.data[offset + 1];
    const blue = source.data[offset + 2];
    const remove = chroma === 'magenta'
      ? (red >= 140 && blue >= 125 && green <= 105 && red - green >= 65 && blue - green >= 55)
        || (red >= 100 && blue >= 110 && green <= 50 && red - green >= 75 && blue - green >= 90)
      : (green >= 120 && green - red >= 60 && green - blue >= 60)
        || (green >= 70 && red <= 60 && blue <= 70 && green - red >= 35 && green - blue >= 25);
    if (remove) source.data.fill(0, offset, offset + 4);
  }
  return source;
}

const sources = {
  tables: await loadSource('docs/asset-prototypes/nestwork-high-tables-source-v1.png', 'magenta'),
  stools: await loadSource('docs/asset-prototypes/nestwork-high-stools-source-v1.png', 'green'),
};

const assets = [
  { source: 'tables', sourceCol: 0, sourceCols: 2, col: 0, row: 0, w: 4, h: 2, renderW: 104, renderH: 58 },
  { source: 'tables', sourceCol: 1, sourceCols: 2, col: 0, row: 2, w: 2, h: 4, renderW: 54, renderH: 108 },
  ...Array.from({ length: 4 }, (_, sourceCol) => ({
    source: 'stools', sourceCol, sourceCols: 4, col: sourceCol, row: 6, w: 1, h: 1, renderW: 27, renderH: 29,
  })),
];

const composites = [];
for (const asset of assets) {
  const source = sources[asset.source];
  const left = Math.floor((asset.sourceCol * source.info.width) / asset.sourceCols);
  const right = Math.floor(((asset.sourceCol + 1) * source.info.width) / asset.sourceCols);
  const cell = await sharp(source.data, { raw: source.info })
    .extract({ left, top: 0, width: right - left, height: source.info.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  removeSmallAlphaComponents(cell.data, cell.info, {
    left: 0,
    top: 0,
    width: cell.info.width,
    height: cell.info.height,
  }, { minimumPixels: 24, minimumRatio: 0.002 });
  const bounds = alphaBounds(cell.data, cell.info);
  const scale = Math.min(asset.renderW / bounds.width, asset.renderH / bounds.height);
  const renderWidth = Math.max(1, Math.floor(bounds.width * scale));
  const renderHeight = Math.max(1, Math.floor(bounds.height * scale));
  const input = await sharp(cell.data, { raw: cell.info })
    .extract(bounds)
    .resize(renderWidth, renderHeight, { kernel: 'nearest' })
    .png()
    .toBuffer();
  composites.push({
    input,
    left: asset.col * TILE + Math.floor((asset.w * TILE - renderWidth) / 2),
    top: asset.row * TILE + Math.floor((asset.h * TILE - renderHeight) / 2),
  });
}

await mkdir(file('apps/web/public/NestWork/collaboration'), { recursive: true });
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

console.log(`Packed ${assets.length} high collaboration assets into ${OUTPUT_COLS}×${OUTPUT_ROWS} tiles.`);
