// Pack Milo's generated contact sheets into the runtime's horizontal strips.
// The artwork remains untouched: this script only removes the exterior white,
// extracts each figure, normalizes its size, and aligns its feet.
// Run from the repository root: node scripts/pack-milo.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { cleanSpriteMatte } from './lib/clean-sprite-matte.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;
const FRAME_WIDTH = 48;
const FRAME_HEIGHT = 64;
const FRAMES_PER_DIRECTION = 6;

async function extractFigures(path) {
  const { data, info } = await sharp(file(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const isExteriorWhite = (pixel) =>
    data[pixel * 4 + 3] === 0 ||
    (data[pixel * 4] > 232 && data[pixel * 4 + 1] > 232 && data[pixel * 4 + 2] > 232);

  let head = 0;
  let tail = 0;
  const enqueueBackground = (pixel) => {
    if (seen[pixel] || !isExteriorWhite(pixel)) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueueBackground(x);
    enqueueBackground((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueueBackground(y * width);
    enqueueBackground(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    data[pixel * 4 + 3] = 0;
    if (pixel % width) enqueueBackground(pixel - 1);
    if (pixel % width < width - 1) enqueueBackground(pixel + 1);
    if (pixel >= width) enqueueBackground(pixel - width);
    if (pixel < width * (height - 1)) enqueueBackground(pixel + width);
  }

  const figures = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start]) continue;
    head = 0;
    tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const visit = (next) => {
        if (!seen[next]) {
          seen[next] = 1;
          queue[tail++] = next;
        }
      };
      if (x) visit(pixel - 1);
      if (x < width - 1) visit(pixel + 1);
      if (y) visit(pixel - width);
      if (y < height - 1) visit(pixel + width);
    }
    if (tail > 800) {
      figures.push({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    }
  }

  const expected = FRAMES_PER_DIRECTION * 4;
  if (figures.length !== expected) {
    throw new Error(`Expected ${expected} figures, found ${figures.length} in ${path}`);
  }
  figures.sort((a, b) => a.top - b.top);

  const frames = [];
  for (let row = 0; row < 4; row++) {
    const ordered = figures
      .slice(row * FRAMES_PER_DIRECTION, (row + 1) * FRAMES_PER_DIRECTION)
      .sort((a, b) => a.left - b.left);
    for (const rect of ordered) {
      const outputHeight = 60;
      const outputWidth = Math.round((rect.width * outputHeight) / rect.height);
      if (outputWidth > FRAME_WIDTH - 4) throw new Error('Figure too wide for runtime frame');
      const resized = await sharp(data, { raw: info })
        .extract(rect)
        .resize(outputWidth, outputHeight, { kernel: 'nearest' })
        .png()
        .toBuffer();
      const input = await cleanSpriteMatte(sharp, resized);
      frames.push(
        await sharp({
          create: {
            width: FRAME_WIDTH,
            height: FRAME_HEIGHT,
            channels: 4,
            background: '#00000000',
          },
        })
          .composite([
            { input, left: Math.floor((FRAME_WIDTH - outputWidth) / 2), top: FRAME_HEIGHT - outputHeight },
          ])
          .png()
          .toBuffer(),
      );
    }
  }
  return frames;
}

const output = 'apps/web/public/Characters/original';
await mkdir(file(output), { recursive: true });
const sheets = [
  ['walk', await extractFigures('docs/asset-prototypes/milo-walk-source.png')],
  ['idle', await extractFigures('docs/asset-prototypes/milo-idle-source.png')],
];

for (const [kind, frames] of sheets) {
  await sharp({
    create: {
      width: FRAME_WIDTH * frames.length,
      height: FRAME_HEIGHT,
      channels: 4,
      background: '#00000000',
    },
  })
    .composite(frames.map((input, index) => ({ input, left: index * FRAME_WIDTH, top: 0 })))
    .png()
    .toFile(file(`${output}/Milo_${kind}.png`));
}

await sharp({
  create: {
    width: FRAME_WIDTH * FRAMES_PER_DIRECTION,
    height: FRAME_HEIGHT * 8,
    channels: 4,
    background: '#00000000',
  },
})
  .composite(
    sheets.flatMap(([, frames], sheet) =>
      frames.map((input, index) => ({
        input,
        left: (index % FRAMES_PER_DIRECTION) * FRAME_WIDTH,
        top: (sheet * 4 + Math.floor(index / FRAMES_PER_DIRECTION)) * FRAME_HEIGHT,
      })),
    ),
  )
  .png()
  .toFile(file('docs/asset-prototypes/milo-runtime-sheet.png'));

console.log('Packed Milo: 24 walking + 24 idle frames, 48×64 RGBA, right/up/left/down.');
