import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-office';

function officeAsset(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
  renderOffsetX = 0,
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
    depth: 3,
    renderOffsetX,
    hiddenInCatalog,
  };
}

export const NESTWORK_OFFICE_ASSETS: readonly FurnitureCatalogEntry[] = [
  officeAsset('desk', 'Bureau individuel', 0, 0, 3, 2, -16),
  officeAsset('office-chair', 'Chaise de bureau', 3, 0, 2, 2, -16, true),
  officeAsset('bench-desk', 'Bureau double', 5, 0, 4, 2, -32, true),
  officeAsset('sofa', 'Canapé deux places', 9, 0, 3, 2, -16),
  officeAsset('bookshelf', 'Bibliothèque', 0, 2, 3, 3, -16),
  officeAsset('low-cabinet', 'Meuble bas', 3, 2, 3, 2, -16),
  officeAsset('coffee-station', 'Coin café', 6, 2, 2, 3),
  officeAsset('meeting-table', 'Table de réunion', 8, 2, 4, 3, -16, true),
  officeAsset('large-plant', 'Grande plante', 0, 5, 2, 3),
  officeAsset('small-plant', 'Petite plante', 2, 5, 1, 2),
  officeAsset('water-cooler', 'Fontaine à eau', 3, 5, 1, 2),
  officeAsset('printer-cabinet', 'Meuble imprimante', 4, 5, 3, 2, -16),
  officeAsset('lounge-chair', 'Fauteuil détente', 0, 8, 2, 2, 0, true),
  officeAsset('cafe-table', 'Table café', 2, 8, 3, 2, -16, true),
  officeAsset('floor-lamp', 'Lampadaire', 5, 8, 1, 2),
  officeAsset('recycling-bins', 'Bacs de tri', 6, 8, 3, 2, -16),
];
