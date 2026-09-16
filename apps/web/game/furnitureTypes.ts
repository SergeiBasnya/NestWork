import type { FurnitureDTO, WorkspaceAssetDTO } from '@nestwork/shared';

export type FurnitureItem = FurnitureDTO;

// The server DTO deliberately contains only an authenticated file endpoint.
// The context hydrates it to a browser-local object URL before Phaser sees it.
export interface WorkspaceAsset extends WorkspaceAssetDTO {
  objectUrl: string;
}

export interface CatalogCollisionCell {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface FurnitureCatalogEntry {
  id: string;
  name: string;
  category: string;
  col: number;
  row: number;
  w: number;
  h: number;
  depth?: number;
  // Visual displacement from the logical, room-relative grid position. This
  // keeps useful pixels on grid lines when a source slot has transparent
  // padding or a wall is centred on a grid edge.
  renderOffsetX?: number;
  renderOffsetY?: number;
  snapToGridEdgeX?: boolean;
  snapToGridEdgeY?: boolean;
  // Keep deprecated entries resolvable for saved maps without offering them
  // for new placements in the decorator.
  hiddenInCatalog?: boolean;
  // Cardinal direction used by seats and other interactive furniture. Keeping
  // it explicit avoids inferring gameplay behaviour from a translated label.
  orientation?: 'up' | 'down' | 'left' | 'right';
  // Optional movement blockers, expressed inside the rendered sprite grid.
  // Original walls use these to block solid sections while leaving doors open.
  collisionCells?: readonly CatalogCollisionCell[];
}
