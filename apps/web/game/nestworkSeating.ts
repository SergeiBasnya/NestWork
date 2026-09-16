import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-seating-v2';

function seatingAsset(
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

export const NESTWORK_SEATING_ASSETS: readonly FurnitureCatalogEntry[] = [
  seatingAsset('office-chair-down', 'Chaise de bureau — vers le bas', 0, 0, 1, 1, 'down'),
  seatingAsset('office-chair-up', 'Chaise de bureau — vers le haut', 1, 0, 1, 1, 'up'),
  seatingAsset('office-chair-left', 'Chaise de bureau — vers la gauche', 2, 0, 1, 1, 'left'),
  seatingAsset('office-chair-right', 'Chaise de bureau — vers la droite', 3, 0, 1, 1, 'right'),

  seatingAsset('cafe-chair-down', 'Chaise café — vers le bas', 0, 1, 1, 1, 'down'),
  seatingAsset('cafe-chair-up', 'Chaise café — vers le haut', 1, 1, 1, 1, 'up'),
  seatingAsset('cafe-chair-left', 'Chaise café — vers la gauche', 2, 1, 1, 1, 'left'),
  seatingAsset('cafe-chair-right', 'Chaise café — vers la droite', 3, 1, 1, 1, 'right'),

  seatingAsset('armchair-down', 'Fauteuil — vers le bas', 0, 2, 1, 1, 'down'),
  seatingAsset('armchair-up', 'Fauteuil — vers le haut', 1, 2, 1, 1, 'up'),
  seatingAsset('armchair-left', 'Fauteuil — vers la gauche', 2, 2, 1, 1, 'left'),
  seatingAsset('armchair-right', 'Fauteuil — vers la droite', 3, 2, 1, 1, 'right'),

  seatingAsset('cafe-table', 'Table café ronde', 4, 2, 2, 2),
];
