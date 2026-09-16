// Pack generated artwork into the runtime's two horizontal animation strips.
// No character drawing: keep the generated pixels, extract connected figures,
// remove only exterior white, normalize scale, and align the feet.
// Run from the repository root: node scripts/pack-aurore.mjs
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { cleanSpriteMatte } from './lib/clean-sprite-matte.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;
const WIDTH = 48;
const HEIGHT = 64;

async function extractFigures(path, expectedRows) {
  const { data, info } = await sharp(file(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const background = (p) =>
    data[p * 4 + 3] === 0 || (data[p * 4] > 232 && data[p * 4 + 1] > 232 && data[p * 4 + 2] > 232);
  // Flood from the canvas edge so enclosed white clothing stays opaque.
  let head = 0;
  let tail = 0;
  const enqueue = (p) => {
    if (seen[p] || !background(p)) return;
    seen[p] = 1;
    queue[tail++] = p;
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
    const p = queue[head++];
    data[p * 4 + 3] = 0;
    if (p % width) enqueue(p - 1);
    if (p % width < width - 1) enqueue(p + 1);
    if (p >= width) enqueue(p - width);
    if (p < width * (height - 1)) enqueue(p + width);
  }

  const figures = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start]) continue;
    head = 0;
    tail = 1;
    queue[0] = start;
    seen[start] = 1;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const visit = (n) => {
        if (!seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      };
      if (x) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    if (tail > 800)
      figures.push({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  if (figures.length !== expectedRows * 6)
    throw new Error(`Expected ${expectedRows * 6} figures, found ${figures.length} in ${path}`);
  figures.sort((a, b) => a.top - b.top);
  const frames = [];
  for (let row = 0; row < expectedRows; row++) {
    const ordered = figures.slice(row * 6, row * 6 + 6).sort((a, b) => a.left - b.left);
    for (const rect of ordered) {
      // Same head/body proportions; reserve four pixels above the bun.
      const outputHeight = 60;
      const outputWidth = Math.round((rect.width * outputHeight) / rect.height);
      if (outputWidth > WIDTH - 4) throw new Error('Figure too wide for runtime frame');
      const resized = await sharp(data, { raw: info })
        .extract(rect)
        .resize(outputWidth, outputHeight, { kernel: 'nearest' })
        .png()
        .toBuffer();
      const input = await cleanSpriteMatte(sharp, resized);
      frames.push(
        await sharp({
          create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#00000000' },
        })
          .composite([
            { input, left: Math.floor((WIDTH - outputWidth) / 2), top: HEIGHT - outputHeight },
          ])
          .png()
          .toBuffer(),
      );
    }
  }
  return frames;
}

const walk = await extractFigures('docs/asset-prototypes/aurore-walk-source.png', 4);
const idle = (await extractFigures('docs/asset-prototypes/aurore-animation-source.png', 8)).slice(
  24,
);
// Only the six left-facing idle poses needed the high rear bun correction.
// Keep the other 42 animation frames from their original sources unchanged.
const corrected = await extractFigures('docs/asset-prototypes/aurore-bun-correction-source.png', 8);
idle.splice(12, 6, ...corrected.slice(36, 42));
const output = 'apps/web/public/Characters/original';
await mkdir(file(output), { recursive: true });
for (const [kind, frames] of [
  ['walk', walk],
  ['idle', idle],
]) {
  await sharp({
    create: { width: WIDTH * 24, height: HEIGHT, channels: 4, background: '#00000000' },
  })
    .composite(frames.map((input, i) => ({ input, left: i * WIDTH, top: 0 })))
    .png()
    .toFile(file(`${output}/Aurore_${kind}.png`));
}
// Review contact sheet uses exactly the runtime frames, without resampling.
await sharp({
  create: { width: WIDTH * 6, height: HEIGHT * 8, channels: 4, background: '#00000000' },
})
  .composite(
    [...walk, ...idle].map((input, i) => ({
      input,
      left: (i % 6) * WIDTH,
      top: Math.floor(i / 6) * HEIGHT,
    })),
  )
  .png()
  .toFile(file('docs/asset-prototypes/aurore-runtime-sheet.png'));
console.log('Packed 24 walking + 24 idle frames, 48×64 RGBA, right/up/left/down.');
