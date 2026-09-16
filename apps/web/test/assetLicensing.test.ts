import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_CHARACTER_NAMES, CHARACTER_NAMES, ORIGINAL_CHARACTERS, availableCharacter, characterDir } from '../game/constants';
import { LICENSED_ASSETS_ENABLED } from '../game/assetLibrary';
import { EMOTE_KEYS, emoteFile } from '../game/emotes';
import { catalogSemanticDepth, familyKeyForSheet, SHEETS, sheetFamilies, sheetForCatalogId, sheetTextures } from '../game/sheets';
import { NESTWORK_OFFICE_ASSETS } from '../game/nestworkOffice';
import { NESTWORK_MEETING_ASSETS } from '../game/nestworkMeeting';
import { NESTWORK_WORKSTATION_ASSETS } from '../game/nestworkWorkstations';
import { NESTWORK_HIGH_COLLABORATION_ASSETS } from '../game/nestworkHighCollaboration';
import { NESTWORK_SEATING_ASSETS } from '../game/nestworkSeating';
import { NESTWORK_SHARED_SPACE_ASSETS } from '../game/nestworkSharedSpaces';
import { NESTWORK_STRUCTURE_ASSETS } from '../game/nestworkStructure';
import { NESTWORK_WALL_ASSETS } from '../game/nestworkWalls';

test('all runtime sheets use licensed or original asset directories', () => {
  for (const sheet of SHEETS) {
    assert.doesNotMatch(sheet.file.toLowerCase(), /free/);
  }
});

test('original assets are exposed through compact functional families', () => {
  const originalFamilies = sheetFamilies().filter((family) => family.original);
  assert.deepEqual(
    originalFamilies.map((family) => family.label),
    ['NestWork · Sols', 'NestWork · Murs', 'NestWork · Mobilier', 'NestWork · Extérieur'],
  );
  assert.deepEqual(
    originalFamilies.flatMap((family) => family.sheets.map((sheet) => sheet.key)),
    [
      'nw-floor-ivory',
      'nw-floor-oak',
      'nw-floor-honey',
      'nw-floor-basketweave',
      'nw-floor-terrazzo',
      'nw-floor-warm-grey-carpet',
      'nw-floor-carpet',
      'nw-floor-slate',
      'nw-raised-walls-v3',
      'nw-office',
      'nw-seating-v2',
      'nw-workstations',
      'nw-meeting',
      'nw-high-collaboration',
      'nw-shared',
      'grass',
    ],
  );
  for (const family of originalFamilies) {
    for (const sheet of family.sheets) {
      assert.equal(familyKeyForSheet(sheet.key), family.key);
    }
  }
});

test('the public asset mode is original-only while full mode remains opt-in', () => {
  const publicFamilies = sheetFamilies(false);
  const fullFamilies = sheetFamilies(true);
  assert.ok(publicFamilies.every((family) => family.original));
  assert.ok(fullFamilies.some((family) => !family.original));
  assert.ok(fullFamilies.some((family) => family.sheets.some((sheet) => sheet.key === 'furniture')));
  assert.ok(sheetTextures(false).every((texture) => texture.file.startsWith('/NestWork/')));
  assert.ok(sheetTextures(true).some((texture) => texture.file.startsWith('/Modern/')));
});

test('public reaction emotes resolve to original NestWork assets', () => {
  assert.equal(EMOTE_KEYS.length, 6);
  for (const key of EMOTE_KEYS) {
    assert.equal(
      emoteFile(key).startsWith('/NestWork/emotes/'),
      !LICENSED_ASSETS_ENABLED,
    );
  }
});

test('legacy catalog ids keep their stable compatibility sheets', () => {
  assert.equal(sheetForCatalogId('furniture_0_5_2x1').key, 'furniture');
  assert.equal(sheetForCatalogId('wall_1_0_1x1').key, 'wall');
  assert.equal(sheetForCatalogId('floor_0_9_1x1').key, 'floor');
});

test('original assets expose semantic default layers while legacy sheets keep saved depth compatibility', () => {
  assert.equal(catalogSemanticDepth('nw-floor-ivory_0_0_1x1'), 1);
  assert.equal(catalogSemanticDepth(NESTWORK_WALL_ASSETS[0].id), 2);
  assert.equal(catalogSemanticDepth(NESTWORK_OFFICE_ASSETS[0].id), 3);
  const rug = NESTWORK_SHARED_SPACE_ASSETS.find((item) => item.name === 'Tapis rond');
  assert.ok(rug);
  assert.equal(catalogSemanticDepth(rug.id), 1.5);
  assert.equal(catalogSemanticDepth('floor_0_9_1x1'), null);
  assert.equal(catalogSemanticDepth('wall_1_0_1x1'), null);
});

test('original office presets stay inside their public NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-office');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/office/starter-office-v2.png');
  assert.equal(sheet.presets, NESTWORK_OFFICE_ASSETS);
  assert.equal(NESTWORK_OFFICE_ASSETS.length, 16);
  for (const item of NESTWORK_OFFICE_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('grid-native seating presets stay inside their original NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-seating-v2');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/office/starter-seating-v2.png');
  assert.equal(sheet.presets, NESTWORK_SEATING_ASSETS);
  assert.equal(NESTWORK_SEATING_ASSETS.length, 13);
  for (const item of NESTWORK_SEATING_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('meeting presets stay inside their original NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-meeting');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/meeting/meeting-tables-v1.png');
  assert.equal(sheet.presets, NESTWORK_MEETING_ASSETS);
  for (const item of NESTWORK_MEETING_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('workstation presets stay inside their original NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-workstations');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/workstations/workstations-v1.png');
  assert.equal(sheet.presets, NESTWORK_WORKSTATION_ASSETS);
  for (const item of NESTWORK_WORKSTATION_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('high collaboration presets stay inside their original NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-high-collaboration');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/collaboration/high-collaboration-v1.png');
  assert.equal(sheet.presets, NESTWORK_HIGH_COLLABORATION_ASSETS);
  for (const item of NESTWORK_HIGH_COLLABORATION_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('original structure presets stay inside their public NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-structure');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/construction/starter-structure-v1.png');
  assert.equal(sheet.presets, NESTWORK_STRUCTURE_ASSETS);
  assert.equal(NESTWORK_STRUCTURE_ASSETS.length, 12);
  for (const item of NESTWORK_STRUCTURE_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('modular wall presets stay inside their original NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-walls-v2');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/construction/modular-walls-v2.png');
  assert.equal(sheet.presets, NESTWORK_WALL_ASSETS);
  for (const item of NESTWORK_WALL_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('original shared-space presets stay inside their public NestWork sheet', () => {
  const sheet = SHEETS.find((candidate) => candidate.key === 'nw-shared');
  assert.ok(sheet);
  assert.equal(sheet.file, '/NestWork/shared-spaces/starter-shared-spaces-v2.png');
  assert.equal(sheet.presets, NESTWORK_SHARED_SPACE_ASSETS);
  assert.equal(NESTWORK_SHARED_SPACE_ASSETS.length, 16);
  for (const item of NESTWORK_SHARED_SPACE_ASSETS) {
    assert.equal(sheetForCatalogId(item.id), sheet);
    assert.ok(item.col >= 0 && item.row >= 0);
    assert.ok(item.col + item.w <= sheet.cols, `${item.name}: width inside sheet`);
    assert.ok(item.row + item.h <= sheet.rows, `${item.name}: height inside sheet`);
  }
});

test('character assets distinguish original NestWork art from the licensed pack', () => {
  assert.ok(ALL_CHARACTER_NAMES.includes('Milo'));
  assert.ok(ALL_CHARACTER_NAMES.includes('Leo'));
  assert.ok(ALL_CHARACTER_NAMES.includes('Adam'));
  assert.ok(ALL_CHARACTER_NAMES.includes('P20'));
  assert.deepEqual(
    CHARACTER_NAMES,
    LICENSED_ASSETS_ENABLED ? ALL_CHARACTER_NAMES : ORIGINAL_CHARACTERS,
  );
  assert.equal(availableCharacter('Adam'), LICENSED_ASSETS_ENABLED ? 'Adam' : 'Aurore');
  for (const character of ALL_CHARACTER_NAMES) {
    if (ORIGINAL_CHARACTERS.includes(character)) {
      assert.equal(characterDir(character), '/Characters/original');
    } else {
      assert.match(characterDir(character), /^\/Characters(?:\/named)?$/);
    }
  }
});
