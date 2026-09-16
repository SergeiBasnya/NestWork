import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NESTWORK_OFFICE_ASSETS } from '../game/nestworkOffice';
import { NESTWORK_SEATING_ASSETS } from '../game/nestworkSeating';
import { SHEETS } from '../game/sheets';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');
const TILE = 32;

test('seats use complete cardinal sets and grid-native footprints', () => {
  const groups = [
    NESTWORK_SEATING_ASSETS.filter((item) => item.id.includes('office-chair')),
    NESTWORK_SEATING_ASSETS.filter((item) => item.id.includes('cafe-chair')),
    NESTWORK_SEATING_ASSETS.filter((item) => item.id.includes('armchair')),
  ];
  for (const group of groups) {
    assert.deepEqual(new Set(group.map((item) => item.orientation)), new Set(['up', 'down', 'left', 'right']));
  }

  for (const item of groups[0]) assert.deepEqual([item.w, item.h], [1, 1]);
  for (const item of groups[1]) assert.deepEqual([item.w, item.h], [1, 1]);
  for (const item of groups[2]) assert.deepEqual([item.w, item.h], [1, 1]);

  const table = NESTWORK_SEATING_ASSETS.find((item) => item.id.includes('cafe-table'))!;
  assert.deepEqual([table.w, table.h], [2, 2]);
  assert.equal(table.orientation, undefined);
});

test('deprecated composed or diagonal furniture is hidden but remains resolvable', () => {
  for (const name of ['Chaise de bureau', 'Fauteuil détente', 'Table café']) {
    assert.equal(NESTWORK_OFFICE_ASSETS.find((item) => item.name === name)?.hiddenInCatalog, true);
  }
});

test('the oversized seating v1 sheet stays hidden for saved-map compatibility', () => {
  const legacy = SHEETS.find((sheet) => sheet.key === 'nw-seating');
  assert.ok(legacy);
  assert.equal(legacy.hidden, true);
  assert.equal(legacy.presets, undefined);
});

test('seating sheet is transparent and every sprite stays inside its declared tiles', async () => {
  const path = new URL('../public/NestWork/office/starter-seating-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 6 * TILE);
  assert.equal(info.height, 4 * TILE);
  assert.equal(info.channels, 4);

  for (const item of NESTWORK_SEATING_ASSETS) {
    const left = item.col * TILE;
    const top = item.row * TILE;
    const width = item.w * TILE;
    const height = item.h * TILE;
    let opaque = 0;
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha) opaque++;
        if (x === left || x === left + width - 1 || y === top || y === top + height - 1) {
          assert.equal(alpha, 0, `${item.name}: transparent margin, no spill`);
        }
      }
    }
    assert.ok(opaque > 20, `${item.name}: visible sprite`);
  }
});

test('round cafe table starts with a continuous dark curved outline', async () => {
  const path = new URL('../public/NestWork/office/starter-seating-v2.png', import.meta.url).pathname;
  const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
  const table = NESTWORK_SEATING_ASSETS.find((item) => item.name === 'Table café ronde')!;
  const top = table.row * TILE + 20;
  const visiblePixels: Array<[number, number, number]> = [];

  for (let x = table.col * TILE; x < (table.col + table.w) * TILE; x++) {
    const offset = (top * info.width + x) * 4;
    if (data[offset + 3] >= 16) visiblePixels.push([data[offset], data[offset + 1], data[offset + 2]]);
  }

  assert.ok(visiblePixels.length >= 10, 'complete top curve');
  assert.ok(
    visiblePixels.every(([red, green, blue]) => (red + green + blue) / 3 < 90),
    'top curve contains no white or grey extraction residue',
  );
});
