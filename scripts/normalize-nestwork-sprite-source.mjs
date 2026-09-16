// Convert an AI-generated isolated render into a canonical transparent source.
// Usage: node scripts/normalize-nestwork-sprite-source.mjs input.png output.png
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  alphaBounds,
  assertNoMagentaResidue,
  assertTransparentMargin,
  removeExteriorMagenta,
  removeExteriorNeutral,
  removeSmallAlphaComponents,
} from './lib/sprite-alpha.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const [, , inputArg, outputArg, backgroundMode = 'neutral'] = process.argv;

if (!inputArg || !outputArg) {
  throw new Error('Usage: node scripts/normalize-nestwork-sprite-source.mjs input.png output.png [neutral|magenta]');
}

const input = resolve(inputArg);
const output = resolve(outputArg);
const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const fullImage = { left: 0, top: 0, width: source.info.width, height: source.info.height };

// Generated previews may contain a baked checkerboard or a deliberate chroma
// background. Flood-fill it from the edges, stopping at the dark sprite outline.
if (backgroundMode === 'magenta') {
  removeExteriorMagenta(source.data, source.info, fullImage);
} else if (backgroundMode === 'neutral') {
  removeExteriorNeutral(source.data, source.info, fullImage, 80, 42);
} else {
  throw new Error(`Unknown background mode: ${backgroundMode}`);
}
removeSmallAlphaComponents(source.data, source.info, fullImage, {
  minimumPixels: 24,
  minimumRatio: 0.0005,
});

const bounds = alphaBounds(source.data, source.info);
const padding = Math.max(16, Math.ceil(Math.max(bounds.width, bounds.height) * 0.04));
const normalizedWidth = bounds.width + padding * 2;
const normalizedHeight = bounds.height + padding * 2;
const sprite = await sharp(source.data, { raw: source.info }).extract(bounds).png().toBuffer();

await mkdir(dirname(output), { recursive: true });
await sharp({
  create: {
    width: normalizedWidth,
    height: normalizedHeight,
    channels: 4,
    background: '#00000000',
  },
})
  .composite([{ input: sprite, left: padding, top: padding }])
  .png()
  .toFile(output);

const normalized = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assertTransparentMargin(normalized.data, normalized.info, output, padding);
if (backgroundMode === 'magenta') {
  assertNoMagentaResidue(normalized.data, normalized.info, output);
}
console.log(`Normalized ${inputArg} -> ${outputArg} with ${padding}px transparent margins.`);
