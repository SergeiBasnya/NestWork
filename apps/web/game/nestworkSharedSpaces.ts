import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-shared';

function sharedSpaceAsset(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
  renderOffsetX = 0,
  depth = 3,
  hiddenInCatalog = false,
): FurnitureCatalogEntry {
  return {
    id: `${SHEET_KEY}_${slug}_${col}_${row}_${w}x${h}`,
    name,
    category: SHEET_KEY,
    col,
    row,
    w,
    h,
    depth,
    renderOffsetX,
    hiddenInCatalog,
  };
}

export const NESTWORK_SHARED_SPACE_ASSETS: readonly FurnitureCatalogEntry[] = [
  sharedSpaceAsset('reception-counter', "Comptoir d'accueil", 0, 0, 4, 3, -16),
  sharedSpaceAsset('whiteboard', 'Tableau blanc mobile', 4, 0, 2, 2),
  sharedSpaceAsset('notice-board', "Panneau d'affichage", 7, 0, 3, 3, -16),
  sharedSpaceAsset('lockers', 'Casiers de bureau', 10, 0, 3, 3, -16),
  sharedSpaceAsset('coat-rack', 'Vestiaire', 0, 3, 2, 4),
  sharedSpaceAsset('vending-machine', 'Distributeur', 2, 3, 2, 4),
  sharedSpaceAsset('supply-shelf', 'Étagère de fournitures', 4, 3, 3, 4, -16),
  sharedSpaceAsset('phone-booth', 'Cabine acoustique', 7, 3, 2, 4),
  sharedSpaceAsset('round-rug', 'Tapis rond', 0, 7, 3, 3, -16, 1.5),
  sharedSpaceAsset('poufs', 'Poufs modulaires', 3, 7, 2, 2),
  sharedSpaceAsset('high-table', 'Table haute collaborative', 5, 7, 4, 3, -16, 3, true),
  sharedSpaceAsset('projector-screen', 'Écran de projection', 9, 7, 3, 3, -16),
  sharedSpaceAsset('indoor-tree', "Arbre d'intérieur", 0, 10, 2, 3),
  sharedSpaceAsset('wall-clock', 'Horloge murale', 2, 10, 2, 2, -16),
  sharedSpaceAsset('mail-cabinet', 'Meuble courrier', 4, 10, 3, 3, -16),
  sharedSpaceAsset('first-aid-cabinet', 'Armoire de secours', 7, 10, 1, 2),
];
