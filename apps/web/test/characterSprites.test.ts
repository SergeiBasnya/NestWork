import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  CHARACTER_NAMES,
  CHAR_ANIMS,
  CHAR_IDLE_ANIMS,
  ORIGINAL_CHARACTERS,
  characterSpriteSpec,
  defaultCharacterFor,
} from '../game/constants';

const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next'))('sharp');

function alphaSignature(data: Buffer, sheetWidth: number, frameX: number, frameWidth: number, frameHeight: number) {
  let signature = '';
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      signature += data[(y * sheetWidth + frameX + x) * 4 + 3] ? '1' : '0';
    }
  }
  return signature;
}

test('every selectable avatar has complete walking and idle sheets at a consistent world scale', async () => {
  for (const name of CHARACTER_NAMES) {
    const spec = characterSpriteSpec(name);
    assert.equal(spec.frameHeight * spec.scale, 48, `${name}: world height`);
    for (const path of [spec.walkFile, spec.idleFile]) {
      const meta = await sharp(new URL(`../public${path}`, import.meta.url).pathname).metadata();
      assert.equal(meta.width, spec.frameWidth * 24, `${name}: 24 horizontal frames`);
      assert.equal(meta.height, spec.frameHeight, `${name}: one row`);
    }
  }
});

test('original characters have transparent, nonempty, uncropped frames with feet aligned', async () => {
  for (const name of ORIGINAL_CHARACTERS) {
    const spec = characterSpriteSpec(name);
    for (const path of [spec.walkFile, spec.idleFile]) {
      const { data, info } = await sharp(new URL(`../public${path}`, import.meta.url).pathname)
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.channels, 4, `${name}: real alpha channel`);
      for (let frame = 0; frame < 24; frame++) {
        let opaque = 0,
          footPixels = 0;
        for (let y = 0; y < spec.frameHeight; y++) {
          for (let x = 0; x < spec.frameWidth; x++) {
            const alpha = data[(y * info.width + frame * spec.frameWidth + x) * 4 + 3];
            if (x === 0 || x === spec.frameWidth - 1 || y === 0)
              assert.equal(alpha, 0, `${name}: transparent margin, no clipping`);
            if (alpha) opaque++;
            if (alpha && y === spec.frameHeight - 1) footPixels++;
          }
        }
        assert.ok(opaque > 600, `${name}: frame ${frame} contains a character`);
        assert.ok(footPixels > 0, `${name}: frame ${frame} feet at baseline`);
      }
    }
  }
});

test('original character silhouettes do not retain a visible white matte', async () => {
  for (const name of ORIGINAL_CHARACTERS) {
    const spec = characterSpriteSpec(name);
    for (const path of [spec.walkFile, spec.idleFile]) {
      const { data, info } = await sharp(new URL(`../public${path}`, import.meta.url).pathname)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const paleEdgePixels = Array.from({ length: 24 }, () => 0);
      const transparentAt = (x: number, y: number, frame: number) => {
        if (x < frame * spec.frameWidth || x >= (frame + 1) * spec.frameWidth || y < 0 || y >= info.height) {
          return true;
        }
        return data[(y * info.width + x) * 4 + 3] === 0;
      };

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const index = (y * info.width + x) * 4;
          const frame = Math.floor(x / spec.frameWidth);
          if (!data[index + 3]) {
            assert.deepEqual(
              [...data.subarray(index, index + 4)],
              [0, 0, 0, 0],
              `${name}: transparent pixels do not retain a white matte`,
            );
            continue;
          }
          const touchesTransparency =
            transparentAt(x - 1, y, frame) ||
            transparentAt(x + 1, y, frame) ||
            transparentAt(x, y - 1, frame) ||
            transparentAt(x, y + 1, frame);
          if (!touchesTransparency) continue;
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const lightest = Math.max(red, green, blue);
          const darkest = Math.min(red, green, blue);
          if (darkest > 105 && lightest - darkest <= 36) paleEdgePixels[frame]++;
        }
      }
      paleEdgePixels.forEach((count, frame) => {
        // A few legitimate white-shirt/shoe pixels may touch transparency. The
        // old generated matte produced dozens around a single silhouette.
        assert.ok(count <= 8, `${name}: frame ${frame} pale edge budget (${count})`);
      });
    }
  }
});

test('Milo and Leo retain six readable walk phases in every direction', async () => {
  for (const name of ['Milo', 'Leo']) {
    const spec = characterSpriteSpec(name);
    const { data, info } = await sharp(new URL(`../public${spec.walkFile}`, import.meta.url).pathname)
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let direction = 0; direction < 4; direction++) {
      const silhouettes = new Set<string>();
      const footSilhouettes = new Set<string>();
      const footMasks: string[] = [];
      const lowerBodyCenters: number[] = [];
      const lowerBodyAreas: number[] = [];

      for (let pose = 0; pose < 6; pose++) {
        const frame = direction * 6 + pose;
        const frameX = frame * spec.frameWidth;
        silhouettes.add(alphaSignature(data, info.width, frameX, spec.frameWidth, spec.frameHeight));
        let footSignature = '';

        let weightedX = 0;
        let opaque = 0;
        for (let y = 42; y < spec.frameHeight; y++) {
          for (let x = 0; x < spec.frameWidth; x++) {
            const isOpaque = data[(y * info.width + frameX + x) * 4 + 3] > 0;
            if (y >= spec.frameHeight - 12) {
              footSignature += isOpaque ? '1' : '0';
            }
            if (!isOpaque) continue;
            weightedX += x;
            opaque++;
          }
        }
        footSilhouettes.add(footSignature);
        footMasks.push(footSignature);
        lowerBodyCenters.push(weightedX / opaque);
        lowerBodyAreas.push(opaque);
      }

      assert.equal(silhouettes.size, 6, `${name}: direction ${direction} has six distinct silhouettes`);
      assert.ok(
        Math.max(...lowerBodyCenters) - Math.min(...lowerBodyCenters) >= 0.75,
        `${name}: direction ${direction} alternates its supports laterally`,
      );
      assert.ok(
        Math.max(...lowerBodyAreas) - Math.min(...lowerBodyAreas) >= 15,
        `${name}: direction ${direction} contains readable contact and passing poses`,
      );
      if (direction < 3) {
        assert.equal(
          footSilhouettes.size,
          6,
          `${name}: direction ${direction} has six distinct foot positions`,
        );
        let changedFootPixels = 0;
        let comparisons = 0;
        for (let first = 0; first < footMasks.length; first++) {
          for (let second = first + 1; second < footMasks.length; second++) {
            for (let pixel = 0; pixel < footMasks[first].length; pixel++) {
              if (footMasks[first][pixel] !== footMasks[second][pixel]) changedFootPixels++;
            }
            comparisons++;
          }
        }
        assert.ok(
          changedFootPixels / comparisons >= 25,
          `${name}: direction ${direction} visibly moves its feet between poses`,
        );
      }
    }
  }
});

test('default avatar and animation ranges use the same runtime contract', () => {
  assert.equal(defaultCharacterFor('new-user'), 'Aurore');
  assert.equal(defaultCharacterFor('existing-user-without-choice'), 'Aurore');
  assert.equal(characterSpriteSpec('Adam').frameWidth, 16);
  assert.equal(characterSpriteSpec('Aurore').idleDurations?.length, 6);
  assert.equal(characterSpriteSpec('Milo').idleDurations?.length, 6);
  assert.equal(characterSpriteSpec('Leo').idleDurations?.length, 6);
  assert.deepEqual(Object.values(CHAR_ANIMS), Object.values(CHAR_IDLE_ANIMS));
  assert.equal(CHAR_ANIMS.walk_down.start, 18);
  assert.equal(CHAR_ANIMS.walk_down.end, 23);
});
