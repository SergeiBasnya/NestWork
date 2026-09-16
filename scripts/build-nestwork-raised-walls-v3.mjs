// Deterministic 2.5D wall kit for the 32px NestWork grid. The generated
// sprites use only hard-edged RGBA pixels: no matte, antialiasing or extraction.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const file = (path) => new URL(path, root).pathname;

const TILE = 32;
const COLS = 10;
const ROWS = 8;
const OUTPUT = 'apps/web/public/NestWork/construction/raised-walls-v3.png';
const COLORS = {
  outline: [35, 39, 52, 255],
  cap: [55, 62, 76, 255],
  capLight: [91, 100, 116, 255],
  base: [66, 73, 88, 255],
  face: [235, 233, 226, 255],
  faceLight: [249, 248, 244, 255],
  faceShadow: [207, 207, 202, 255],
  panel: [112, 126, 165, 255],
  panelLight: [160, 176, 210, 255],
  glass: [100, 119, 167, 255],
  glassLight: [176, 193, 226, 255],
  accent: [224, 137, 35, 255],
};

function rgba(width, height) {
  return Buffer.alloc(width * height * 4);
}

function setPixel(buffer, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function fillRect(buffer, width, height, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) setPixel(buffer, width, height, px, py, color);
  }
}

function clearRect(buffer, width, height, x, y, w, h) {
  fillRect(buffer, width, height, x, y, w, h, [0, 0, 0, 0]);
}

function strokeRect(buffer, width, height, x, y, w, h, thickness, color) {
  fillRect(buffer, width, height, x, y, w, thickness, color);
  fillRect(buffer, width, height, x, y + h - thickness, w, thickness, color);
  fillRect(buffer, width, height, x, y, thickness, h, color);
  fillRect(buffer, width, height, x + w - thickness, y, thickness, h, color);
}

function blit(target, targetWidth, targetHeight, source, sourceWidth, sourceHeight, left, top) {
  for (let y = 0; y < sourceHeight; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const sourceOffset = (y * sourceWidth + x) * 4;
      if (!source[sourceOffset + 3]) continue;
      setPixel(target, targetWidth, targetHeight, left + x, top + y, [
        source[sourceOffset],
        source[sourceOffset + 1],
        source[sourceOffset + 2],
        source[sourceOffset + 3],
      ]);
    }
  }
}

function addPanelTexture(buffer, width, height, startY, endY) {
  for (let x = 16; x < width; x += TILE) {
    fillRect(buffer, width, height, x, startY, 1, endY - startY, COLORS.faceShadow);
    fillRect(buffer, width, height, x + 1, startY, 1, endY - startY, COLORS.faceLight);
  }
  for (let x = 11; x < width - 8; x += 29) {
    setPixel(buffer, width, height, x, startY + 12, COLORS.faceLight);
    setPixel(buffer, width, height, x + 1, startY + 12, COLORS.faceLight);
    setPixel(buffer, width, height, x + 8, startY + 31, COLORS.faceShadow);
  }
}

function backWall(width, variant = 'plain') {
  const height = TILE * 2;
  const buffer = rgba(width, height);
  fillRect(buffer, width, height, 0, 0, width, height, COLORS.face);
  fillRect(buffer, width, height, 0, 0, width, 10, COLORS.cap);
  fillRect(buffer, width, height, 2, 2, width - 4, 2, COLORS.capLight);
  fillRect(buffer, width, height, 0, 8, width, 3, COLORS.outline);
  fillRect(buffer, width, height, 0, 54, width, 10, COLORS.base);
  fillRect(buffer, width, height, 0, 54, width, 3, COLORS.outline);
  fillRect(buffer, width, height, 2, 57, width - 4, 2, COLORS.capLight);
  strokeRect(buffer, width, height, 0, 0, width, height, 2, COLORS.outline);
  addPanelTexture(buffer, width, height, 12, 53);

  if (variant === 'accent') {
    fillRect(buffer, width, height, 3, 36, width - 6, 17, COLORS.panel);
    fillRect(buffer, width, height, 3, 36, width - 6, 2, COLORS.accent);
    for (let x = TILE; x < width; x += TILE) fillRect(buffer, width, height, x, 38, 2, 15, COLORS.base);
  }

  if (variant === 'window' || variant === 'glass') {
    const margin = variant === 'glass' ? 5 : 10;
    const top = variant === 'glass' ? 13 : 17;
    const windowHeight = variant === 'glass' ? 38 : 30;
    fillRect(buffer, width, height, margin, top, width - margin * 2, windowHeight, COLORS.outline);
    fillRect(buffer, width, height, margin + 3, top + 3, width - margin * 2 - 6, windowHeight - 6, COLORS.glass);
    const middle = Math.floor(width / 2);
    fillRect(buffer, width, height, middle - 2, top + 2, 4, windowHeight - 4, COLORS.outline);
    for (let y = top + 7; y < top + windowHeight - 6; y += 11) {
      for (let x = margin + 7; x < width - margin - 5; x += 19) {
        setPixel(buffer, width, height, x, y, COLORS.glassLight);
        setPixel(buffer, width, height, x + 1, y - 1, COLORS.glassLight);
        setPixel(buffer, width, height, x + 2, y - 2, COLORS.glassLight);
      }
    }
  }

  if (variant === 'door') {
    const openingLeft = TILE + 4;
    const openingRight = TILE * 2 - 4;
    clearRect(buffer, width, height, openingLeft, 12, openingRight - openingLeft, height - 12);
    fillRect(buffer, width, height, openingLeft - 4, 10, 4, height - 10, COLORS.outline);
    fillRect(buffer, width, height, openingRight, 10, 4, height - 10, COLORS.outline);
    fillRect(buffer, width, height, openingLeft - 4, 10, openingRight - openingLeft + 8, 5, COLORS.outline);
    fillRect(buffer, width, height, openingLeft, 15, openingRight - openingLeft, 2, COLORS.capLight);
  }

  return buffer;
}

function sideWall(side = 'left', material = 'solid') {
  const width = TILE;
  const height = TILE * 3;
  const buffer = rgba(width, height);
  fillRect(buffer, width, height, 0, 0, width, height, COLORS.face);
  strokeRect(buffer, width, height, 0, 0, width, height, 2, COLORS.outline);

  const outerX = side === 'left' ? 0 : width - 8;
  const innerX = side === 'left' ? width - 7 : 0;
  fillRect(buffer, width, height, outerX, 0, 8, height, COLORS.cap);
  fillRect(buffer, width, height, side === 'left' ? 2 : width - 4, 2, 2, height - 4, COLORS.capLight);
  fillRect(buffer, width, height, innerX, 0, 7, height, COLORS.base);
  fillRect(buffer, width, height, side === 'left' ? width - 7 : 5, 0, 2, height, COLORS.outline);

  for (let y = TILE; y < height; y += TILE) {
    fillRect(buffer, width, height, 8, y, width - 15, 2, COLORS.faceShadow);
    fillRect(buffer, width, height, 8, y + 2, width - 15, 1, COLORS.faceLight);
  }

  if (material === 'glass') {
    fillRect(buffer, width, height, 9, 11, width - 17, height - 22, COLORS.glass);
    for (let y = 20; y < height - 12; y += 17) {
      setPixel(buffer, width, height, side === 'left' ? 13 : 17, y, COLORS.glassLight);
      setPixel(buffer, width, height, side === 'left' ? 14 : 16, y - 1, COLORS.glassLight);
    }
  }

  return buffer;
}

function corner(side) {
  const buffer = backWall(TILE);
  const edgeX = side === 'left' ? 0 : TILE - 8;
  fillRect(buffer, TILE, TILE * 2, edgeX, 0, 8, TILE * 2, COLORS.cap);
  fillRect(buffer, TILE, TILE * 2, side === 'left' ? 6 : TILE - 8, 8, 2, TILE * 2 - 8, COLORS.outline);
  return buffer;
}

const sheet = rgba(COLS * TILE, ROWS * TILE);
const place = (buffer, width, height, col, row) => {
  blit(sheet, COLS * TILE, ROWS * TILE, buffer, width, height, col * TILE, row * TILE);
};

place(backWall(TILE * 3), TILE * 3, TILE * 2, 0, 0);
place(backWall(TILE * 3, 'window'), TILE * 3, TILE * 2, 3, 0);
place(backWall(TILE * 3, 'door'), TILE * 3, TILE * 2, 6, 0);
place(backWall(TILE), TILE, TILE * 2, 9, 0);
place(backWall(TILE * 3, 'accent'), TILE * 3, TILE * 2, 0, 2);
place(sideWall('left'), TILE, TILE * 3, 3, 2);
place(sideWall('right'), TILE, TILE * 3, 4, 2);
place(corner('left'), TILE, TILE * 2, 5, 2);
place(corner('right'), TILE, TILE * 2, 6, 2);
place(backWall(TILE), TILE, TILE * 2, 7, 2);
place(backWall(TILE * 3, 'glass'), TILE * 3, TILE * 2, 0, 5);
place(sideWall('left', 'glass'), TILE, TILE * 3, 3, 5);
place(sideWall('right', 'glass'), TILE, TILE * 3, 4, 5);

await mkdir(file('apps/web/public/NestWork/construction'), { recursive: true });
await sharp(sheet, { raw: { width: COLS * TILE, height: ROWS * TILE, channels: 4 } })
  .png()
  .toFile(file(OUTPUT));

console.log(`Built ${COLS}×${ROWS} raised NestWork wall sheet on the native 32px grid.`);
