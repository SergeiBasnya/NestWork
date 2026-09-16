import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-high-collaboration';

function collaborationAsset(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
  orientation?: FurnitureCatalogEntry['orientation'],
): FurnitureCatalogEntry {
  return {
    id: `${SHEET_KEY}_${slug}_${col}_${row}_${w}x${h}`,
    name,
    category: SHEET_KEY,
    col,
    row,
    w,
    h,
    depth: 3,
    orientation,
  };
}

export const NESTWORK_HIGH_COLLABORATION_ASSETS: readonly FurnitureCatalogEntry[] = [
  collaborationAsset('table-horizontal', 'Table haute — horizontale', 0, 0, 4, 2),
  collaborationAsset('table-vertical', 'Table haute — verticale', 0, 2, 2, 4),
  collaborationAsset('stool-down', 'Tabouret haut — vers le bas', 0, 6, 1, 1, 'down'),
  collaborationAsset('stool-up', 'Tabouret haut — vers le haut', 1, 6, 1, 1, 'up'),
  collaborationAsset('stool-left', 'Tabouret haut — vers la gauche', 2, 6, 1, 1, 'left'),
  collaborationAsset('stool-right', 'Tabouret haut — vers la droite', 3, 6, 1, 1, 'right'),
];
