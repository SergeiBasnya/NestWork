import assert from 'node:assert/strict';
import test from 'node:test';
import {
  syncDecoratorScene,
  type DecoratorSceneBridge,
  type DecoratorSceneState,
} from '../game/decoratorBridge';

function bridgeSpy() {
  const calls: string[] = [];
  const scene: DecoratorSceneBridge = {
    setDecoratorMode: (enabled) => calls.push(`decorator:${enabled}`),
    setPlacingItem: (item) => calls.push(`item:${item?.id ?? 'none'}`),
    setMoveMode: (enabled) => calls.push(`move:${enabled}`),
    setEraseMode: (enabled) => calls.push(`erase:${enabled}`),
    setCollisionMode: (enabled) => calls.push(`collision:${enabled}`),
  };
  return { scene, calls };
}

const selectedItem = {
  id: 't1_2_3_1x2',
  name: 'Générique 1×2',
  category: 't1',
  col: 2,
  row: 3,
  w: 1,
  h: 2,
  depth: 3,
};

test('replays the selected library object when the Phaser scene becomes ready', () => {
  const { scene, calls } = bridgeSpy();
  const state: DecoratorSceneState = {
    enabled: true,
    selectedItem,
    moveMode: false,
    eraseMode: false,
    collisionMode: false,
  };

  syncDecoratorScene(scene, state);

  assert.deepEqual(calls, [
    'decorator:true',
    `item:${selectedItem.id}`,
    'move:false',
    'erase:false',
    'collision:false',
  ]);
});

test('disabling the decorator clears the scene without recreating a placement ghost', () => {
  const { scene, calls } = bridgeSpy();

  syncDecoratorScene(scene, {
    enabled: false,
    selectedItem,
    moveMode: false,
    eraseMode: false,
    collisionMode: false,
  });

  assert.deepEqual(calls, ['decorator:false']);
});
