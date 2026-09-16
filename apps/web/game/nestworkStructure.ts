import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-structure';

function structureAsset(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
): FurnitureCatalogEntry {
  return {
    id: `${SHEET_KEY}_${slug}_${col}_${row}_${w}x${h}`,
    name,
    category: SHEET_KEY,
    col,
    row,
    w,
    h,
    depth: 2,
  };
}

export const NESTWORK_STRUCTURE_ASSETS: readonly FurnitureCatalogEntry[] = [
  structureAsset('solid-wall-horizontal', 'Mur plein horizontal', 0, 0, 3, 1),
  structureAsset('glass-wall-horizontal', 'Cloison vitrée horizontale', 3, 0, 3, 1),
  structureAsset('divider-horizontal', 'Séparateur horizontal', 6, 0, 3, 1),
  structureAsset('window-horizontal', 'Fenêtre horizontale', 9, 0, 3, 2),
  structureAsset('solid-wall-vertical', 'Mur plein vertical', 0, 2, 1, 3),
  structureAsset('glass-wall-vertical', 'Cloison vitrée verticale', 1, 2, 1, 3),
  structureAsset('divider-vertical', 'Séparateur vertical', 2, 2, 1, 3),
  structureAsset('window-vertical', 'Fenêtre verticale', 3, 2, 2, 3),
  structureAsset('solid-corner', 'Angle de mur', 0, 5, 2, 2),
  structureAsset('doorway-horizontal', 'Porte horizontale', 2, 5, 3, 2),
  structureAsset('doorway-vertical', 'Porte verticale', 5, 5, 2, 3),
  structureAsset('cross-junction', 'Jonction de murs', 7, 5, 3, 3),
];
