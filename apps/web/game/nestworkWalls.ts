import type { CatalogCollisionCell, FurnitureCatalogEntry } from './furnitureTypes';

export type WallConnector = 'N' | 'E' | 'S' | 'W';
export interface WallCatalogEntry extends FurnitureCatalogEntry {
  connectors: readonly WallConnector[];
}

const SHEET_KEY = 'nw-walls-v2';

function wallAsset(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
  connectors: readonly WallConnector[],
): WallCatalogEntry {
  const collisionCells: readonly CatalogCollisionCell[] = slug === 'door-horizontal'
    ? [{ col: 0, row: 0, w: 1, h: 1 }, { col: w - 1, row: 0, w: 1, h: 1 }]
    : slug === 'door-vertical'
      ? [{ col: 0, row: 0, w: 1, h: 1 }, { col: 0, row: h - 1, w: 1, h: 1 }]
      : [{ col: 0, row: 0, w, h }];

  return {
    id: `${SHEET_KEY}_${slug}_${col}_${row}_${w}x${h}`,
    name,
    category: SHEET_KEY,
    col,
    row,
    w,
    h,
    depth: 2,
    connectors,
    // A selected grid edge is the right/bottom boundary of the wall's tile.
    // Shift the complete 32px source slot into the cell on its left/above so
    // no wall pixel can straddle the neighbouring cell.
    renderOffsetX: w === 1 ? -32 : 0,
    renderOffsetY: h === 1 ? -32 : 0,
    snapToGridEdgeX: w === 1,
    snapToGridEdgeY: h === 1,
    collisionCells,
  };
}

export const NESTWORK_WALL_ASSETS: readonly WallCatalogEntry[] = [
  wallAsset('straight-horizontal', 'Mur droit horizontal', 0, 0, 3, 1, ['W', 'E']),
  wallAsset('straight-vertical', 'Mur droit vertical', 3, 0, 1, 3, ['N', 'S']),
  wallAsset('corner-ne', 'Angle haut-droite', 4, 0, 1, 1, ['N', 'E']),
  wallAsset('corner-se', 'Angle bas-droite', 5, 0, 1, 1, ['E', 'S']),
  wallAsset('corner-sw', 'Angle bas-gauche', 6, 0, 1, 1, ['S', 'W']),
  wallAsset('corner-nw', 'Angle haut-gauche', 7, 0, 1, 1, ['N', 'W']),
  wallAsset('cross', 'Jonction quatre directions', 8, 0, 1, 1, ['N', 'E', 'S', 'W']),
  wallAsset('end-n', 'Embout vers le haut', 9, 0, 1, 1, ['N']),
  wallAsset('end-e', 'Embout vers la droite', 10, 0, 1, 1, ['E']),
  wallAsset('end-s', 'Embout vers le bas', 11, 0, 1, 1, ['S']),
  wallAsset('end-w', 'Embout vers la gauche', 12, 0, 1, 1, ['W']),
  wallAsset('junction-n', 'Jonction en T vers le haut', 4, 1, 1, 1, ['N', 'E', 'W']),
  wallAsset('junction-e', 'Jonction en T vers la droite', 5, 1, 1, 1, ['N', 'E', 'S']),
  wallAsset('junction-s', 'Jonction en T vers le bas', 6, 1, 1, 1, ['E', 'S', 'W']),
  wallAsset('junction-w', 'Jonction en T vers la gauche', 7, 1, 1, 1, ['N', 'S', 'W']),
  wallAsset('door-horizontal', 'Passage horizontal', 0, 3, 3, 1, ['W', 'E']),
  wallAsset('window-horizontal', 'Mur vitré horizontal', 0, 4, 3, 1, ['W', 'E']),
  wallAsset('door-vertical', 'Passage vertical', 4, 2, 1, 3, ['N', 'S']),
  wallAsset('window-vertical', 'Mur vitré vertical', 5, 2, 1, 3, ['N', 'S']),
  wallAsset('glass-vertical', 'Cloison vitrée verticale', 6, 2, 1, 3, ['N', 'S']),
  wallAsset('divider-vertical', 'Séparateur vertical', 7, 2, 1, 3, ['N', 'S']),
  wallAsset('glass-horizontal', 'Cloison vitrée horizontale', 8, 3, 3, 1, ['W', 'E']),
  wallAsset('divider-horizontal', 'Séparateur horizontal', 8, 4, 3, 1, ['W', 'E']),
];
