// Build two isolated, grid-native meeting tables from the generated source.
// Run from the repository root: node scripts/pack-nestwork-meeting.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { alphaBounds, removeSmallAlphaComponents } from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const SOURCE = 'docs/asset-prototypes/nestwork-meeting-tables-source-v1.png';
const OUTPUT = 'apps/web/public/NestWork/meeting/meeting-tables-v1.png';
const OUTPUT_COLS = 4;
const OUTPUT_ROWS = 6;

const assets = [
  { name: 'horizontal', sourceLeft: 0, sourceWidthRatio: 0.5, col: 0, row: 0, w: 4, h: 2, renderW: 108, renderH: 56 },
  { name: 'vertical', sourceLeft: 0.5, sourceWidthRatio: 0.5, col: 0, row: 2, w: 2, h: 4, renderW: 56, renderH: 108 },
];

const source = await sharp(file(SOURCE)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// The deliberate chroma background is much brighter than every NestWork
// colour. Remove it directly instead of flood-filling generic neutral colours,
// which could damage the muted-indigo tabletop inset.
for (let pixel = 0; pixel < source.info.width * source.info.height; pixel++) {
  const offset = pixel * 4;
  const red = source.data[offset];
  const green = source.data[offset + 1];
  const blue = source.data[offset + 2];
  const brightChroma = red >= 140 && blue >= 125 && green <= 105 && red - green >= 65 && blue - green >= 55;
  const darkCompressionFringe = red >= 100 && blue >= 110 && green <= 50 && red - green >= 75 && blue - green >= 90;
  if (brightChroma || darkCompressionFringe) {
    source.data.fill(0, offset, offset + 4);
  }
}

const composites = [];
for (const asset of assets) {
  const left = Math.floor(asset.sourceLeft * source.info.width);
  const width = Math.floor(asset.sourceWidthRatio * source.info.width);
  const cell = await sharp(source.data, { raw: source.info })
    .extract({ left, top: 0, width, height: source.info.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  removeSmallAlphaComponents(cell.data, cell.info, {
    left: 0,
    top: 0,
    width: cell.info.width,
    height: cell.info.height,
  }, { minimumPixels: 32, minimumRatio: 0.002 });
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

await mkdir(file('apps/web/public/NestWork/meeting'), { recursive: true });
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

console.log(`Packed ${assets.length} meeting tables into ${OUTPUT_COLS}×${OUTPUT_ROWS} tiles.`);
