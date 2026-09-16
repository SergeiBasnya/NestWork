import { createRequire } from 'node:module';
import { NESTWORK_OFFICE_ASSETS } from '../apps/web/game/nestworkOffice';
import { NESTWORK_SEATING_ASSETS } from '../apps/web/game/nestworkSeating';
import { NESTWORK_SHARED_SPACE_ASSETS } from '../apps/web/game/nestworkSharedSpaces';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const sharp = createRequire(requireWeb.resolve('next'))('sharp');
const root = new URL('../', import.meta.url);
const TILE = 32;
const expectedComponentCounts = new Map([
  ['Lampadaire', 2], // lamp body and pull switch
  ['Poufs modulaires', 2],
  ['Table haute collaborative', 3], // table and two independent stools
]);
const minimumComponentPixels = 10;

const sheets = [
  {
    name: 'office',
    file: 'apps/web/public/NestWork/office/starter-office-v2.png',
    items: NESTWORK_OFFICE_ASSETS,
  },
  {
    name: 'seating',
    file: 'apps/web/public/NestWork/office/starter-seating-v2.png',
    items: NESTWORK_SEATING_ASSETS,
  },
  {
    name: 'shared',
    file: 'apps/web/public/NestWork/shared-spaces/starter-shared-spaces-v2.png',
    items: NESTWORK_SHARED_SPACE_ASSETS,
  },
] as const;

async function main() {
  let failures = 0;

  for (const sheet of sheets) {
    const path = new URL(sheet.file, root).pathname;
    const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
    console.log(`\n${sheet.name}`);

    for (const item of sheet.items) {
      const width = item.w * TILE;
      const height = item.h * TILE;
      const left = item.col * TILE;
      const top = item.row * TILE;
      const visited = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      const components: Array<{ pixels: number; bounds: [number, number, number, number] }> = [];
      const visible = (x: number, y: number) =>
        data[((top + y) * info.width + left + x) * 4 + 3] >= 16;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const start = y * width + x;
          if (visited[start] || !visible(x, y)) continue;
          let head = 0;
          let tail = 0;
          let minX = x;
          let minY = y;
          let maxX = x;
          let maxY = y;
          visited[start] = 1;
          queue[tail++] = start;

          while (head < tail) {
            const pixel = queue[head++];
            const px = pixel % width;
            const py = Math.floor(pixel / width);
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
            for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              const next = ny * width + nx;
              if (visited[next] || !visible(nx, ny)) continue;
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
          components.push({ pixels: tail, bounds: [minX, minY, maxX, maxY] });
        }
      }

      components.sort((a, b) => b.pixels - a.pixels);
      const expectedCount = expectedComponentCounts.get(item.name) ?? 1;
      const invalid =
        components.length !== expectedCount ||
        components.some((component) => component.pixels < minimumComponentPixels);
      if (invalid) failures += 1;
      console.log(`${invalid ? 'FAIL' : 'OK  '} ${item.name}: ${JSON.stringify(components)}`);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} sprite(s) contain an unexpected detached component`);
  }

  console.log('\nAll furniture sprites passed the detached-pixel audit.');
}

void main();
