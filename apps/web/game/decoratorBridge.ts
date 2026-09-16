import type { FurnitureCatalogEntry } from './furnitureTypes';

export interface DecoratorSceneState {
  enabled: boolean;
  selectedItem: FurnitureCatalogEntry | null;
  moveMode: boolean;
  eraseMode: boolean;
  collisionMode: boolean;
}

export interface DecoratorSceneBridge {
  setDecoratorMode(enabled: boolean): void;
  setPlacingItem(item: FurnitureCatalogEntry | null): void;
  setMoveMode(enabled: boolean): void;
  setEraseMode(enabled: boolean): void;
  setCollisionMode(enabled: boolean): void;
}

// React can update the decorator while Phaser is still loading its textures.
// Replay the latest complete state once the scene is ready instead of relying
// on effects that may already have fired against a missing/uninitialised scene.
export function syncDecoratorScene(scene: DecoratorSceneBridge, state: DecoratorSceneState): void {
  scene.setDecoratorMode(state.enabled);
  if (!state.enabled) return;

  scene.setPlacingItem(state.selectedItem);
  scene.setMoveMode(state.moveMode);
  scene.setEraseMode(state.eraseMode);
  scene.setCollisionMode(state.collisionMode);
}
