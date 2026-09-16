import assert from 'node:assert/strict';
import test from 'node:test';
import { NESTWORK_OFFICE_ASSETS } from '../game/nestworkOffice';
import { NESTWORK_SHARED_SPACE_ASSETS } from '../game/nestworkSharedSpaces';
import { NESTWORK_WALL_ASSETS } from '../game/nestworkWalls';
import { catalogGridEdgeSnap, catalogRenderOffset } from '../game/sheets';

const byName = <T extends { name: string }>(items: readonly T[], name: string): T =>
  items.find((item) => item.name === name)!;

test('wall slots stay wholly inside the cell left or above the selected edge', () => {
  const horizontal = byName(NESTWORK_WALL_ASSETS, 'Mur droit horizontal').id;
  const vertical = byName(NESTWORK_WALL_ASSETS, 'Mur droit vertical').id;
  const corner = byName(NESTWORK_WALL_ASSETS, 'Angle haut-droite').id;
  assert.deepEqual(catalogRenderOffset(horizontal), {
    x: 0,
    y: -32,
  });
  assert.deepEqual(catalogRenderOffset(vertical), {
    x: -32,
    y: 0,
  });
  assert.deepEqual(catalogRenderOffset(corner), {
    x: -32,
    y: -32,
  });
  assert.deepEqual(catalogGridEdgeSnap(horizontal), { x: false, y: true });
  assert.deepEqual(catalogGridEdgeSnap(vertical), { x: true, y: false });
  assert.deepEqual(catalogGridEdgeSnap(corner), { x: true, y: true });
});

test('padded original furniture uses a grid-aligned visual footprint', () => {
  assert.deepEqual(catalogRenderOffset(byName(NESTWORK_OFFICE_ASSETS, 'Bureau individuel').id), {
    x: -16,
    y: 0,
  });
  assert.deepEqual(catalogRenderOffset(byName(NESTWORK_OFFICE_ASSETS, 'Bureau double').id), {
    x: -32,
    y: 0,
  });
  assert.deepEqual(catalogRenderOffset(byName(NESTWORK_SHARED_SPACE_ASSETS, "Comptoir d'accueil").id), {
    x: -16,
    y: 0,
  });
});

test('unregistered and already aligned assets keep their logical position', () => {
  assert.deepEqual(catalogRenderOffset('furniture_0_0_1x1'), { x: 0, y: 0 });
  assert.deepEqual(catalogGridEdgeSnap('furniture_0_0_1x1'), { x: false, y: false });
  assert.deepEqual(catalogRenderOffset(byName(NESTWORK_OFFICE_ASSETS, 'Petite plante').id), {
    x: 0,
    y: 0,
  });
});
