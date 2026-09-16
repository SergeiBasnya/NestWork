import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const SIZE = 32;
const OUTPUT = new URL('../public/NestWork/floors/', import.meta.url);

function tile(background) {
  const pixels = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) setPixel(pixels, x, y, background);
  }
  return pixels;
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const offset = (y * SIZE + x) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
}

function horizontal(pixels, y, x1, x2, color) {
  for (let x = x1; x <= x2; x += 1) setPixel(pixels, x, y, color);
}

function vertical(pixels, x, y1, y2, color) {
  for (let y = y1; y <= y2; y += 1) setPixel(pixels, x, y, color);
}

function rect(pixels, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) setPixel(pixels, xx, yy, color);
  }
}

function sealEdges(pixels) {
  for (let y = 0; y < SIZE; y += 1) {
    const source = (y * SIZE) * 3;
    const target = (y * SIZE + SIZE - 1) * 3;
    pixels[target] = pixels[source];
    pixels[target + 1] = pixels[source + 1];
    pixels[target + 2] = pixels[source + 2];
  }
  for (let x = 0; x < SIZE; x += 1) {
    const source = x * 3;
    const target = ((SIZE - 1) * SIZE + x) * 3;
    pixels[target] = pixels[source];
    pixels[target + 1] = pixels[source + 1];
    pixels[target + 2] = pixels[source + 2];
  }
}

function honeyParquet() {
  const base = [190, 137, 88];
  const light = [207, 154, 99];
  const mid = [177, 121, 76];
  const grain = [166, 111, 70];
  const seam = [133, 89, 61];
  const pixels = tile(base);

  for (const y of [0, 10, 21]) horizontal(pixels, y, 0, 31, seam);
  vertical(pixels, 16, 1, 9, seam);
  vertical(pixels, 7, 11, 20, seam);
  vertical(pixels, 24, 11, 20, seam);
  vertical(pixels, 16, 22, 31, seam);
  horizontal(pixels, 1, 0, 15, light);
  horizontal(pixels, 11, 8, 23, light);
  horizontal(pixels, 22, 17, 30, light);
  for (const [x, y, length, color] of [
    [3, 4, 5, grain], [10, 7, 3, mid], [20, 3, 6, grain], [26, 7, 3, light],
    [1, 15, 4, grain], [11, 13, 5, mid], [18, 18, 4, grain], [26, 16, 3, light],
    [4, 26, 6, mid], [11, 29, 3, grain], [20, 25, 5, grain], [27, 28, 3, light],
  ]) horizontal(pixels, y, x, x + length - 1, color);
  sealEdges(pixels);
  return pixels;
}

function warmTerrazzo() {
  const base = [233, 222, 204];
  const soft = [229, 216, 197];
  const terracotta = [184, 120, 92];
  const sage = [126, 139, 111];
  const taupe = [158, 139, 120];
  const pixels = tile(base);

  for (const [x, y] of [[6, 5], [23, 15], [14, 26]]) setPixel(pixels, x, y, soft);
  rect(pixels, 4, 8, 2, 1, terracotta);
  setPixel(pixels, 5, 9, terracotta);
  rect(pixels, 18, 4, 1, 2, sage);
  rect(pixels, 27, 11, 2, 1, taupe);
  setPixel(pixels, 27, 12, taupe);
  rect(pixels, 10, 18, 2, 1, sage);
  setPixel(pixels, 11, 19, sage);
  rect(pixels, 20, 23, 2, 2, terracotta);
  setPixel(pixels, 21, 22, base);
  rect(pixels, 3, 27, 1, 2, taupe);
  rect(pixels, 28, 28, 2, 1, sage);
  sealEdges(pixels);
  return pixels;
}

function warmGreyCarpet() {
  const base = [139, 139, 134];
  const light = [153, 153, 147];
  const soft = [145, 145, 139];
  const dark = [127, 129, 125];
  const deep = [117, 120, 117];
  const pixels = tile(base);

  for (let y = 2; y < SIZE; y += 4) {
    for (let x = 2; x < SIZE; x += 4) {
      setPixel(pixels, x, y, light);
      setPixel(pixels, x + 1, y, soft);
      setPixel(pixels, x, y + 1, dark);
    }
  }
  for (let y = 0; y < SIZE; y += 8) {
    for (let x = 0; x < SIZE; x += 8) {
      setPixel(pixels, x + 5, y + 4, deep);
      setPixel(pixels, x + 6, y + 4, dark);
    }
  }
  sealEdges(pixels);
  return pixels;
}

function basketweaveParquet() {
  const oak = [177, 128, 82];
  const lightOak = [194, 145, 94];
  const walnut = [156, 106, 70];
  const grain = [139, 92, 63];
  const seam = [119, 79, 57];
  const pixels = tile(oak);

  for (let blockY = 0; blockY < 2; blockY += 1) {
    for (let blockX = 0; blockX < 2; blockX += 1) {
      const x0 = blockX * 16;
      const y0 = blockY * 16;
      const horizontalSlats = (blockX + blockY) % 2 === 0;
      rect(pixels, x0, y0, 16, 16, horizontalSlats ? oak : walnut);

      for (let band = 0; band < 16; band += 4) {
        if (horizontalSlats) {
          horizontal(pixels, y0 + band, x0, x0 + 15, seam);
          horizontal(pixels, y0 + band + 1, x0 + 2, x0 + 6, lightOak);
          horizontal(pixels, y0 + band + 3, x0 + 9, x0 + 13, grain);
        } else {
          vertical(pixels, x0 + band, y0, y0 + 15, seam);
          vertical(pixels, x0 + band + 1, y0 + 2, y0 + 6, lightOak);
          vertical(pixels, x0 + band + 3, y0 + 9, y0 + 13, grain);
        }
      }
    }
  }
  sealEdges(pixels);
  return pixels;
}

const assets = [
  ['honey-parquet-32-v1.png', honeyParquet()],
  ['basketweave-parquet-32-v1.png', basketweaveParquet()],
  ['warm-terrazzo-32-v1.png', warmTerrazzo()],
  ['warm-grey-carpet-32-v1.png', warmGreyCarpet()],
];

for (const [filename, pixels] of assets) {
  await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 9, palette: true })
    .toFile(fileURLToPath(new URL(filename, OUTPUT)));
}
