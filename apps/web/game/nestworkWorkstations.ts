import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-workstations';

function workstationAsset(
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
    depth: 3,
  };
}

export const NESTWORK_WORKSTATION_ASSETS: readonly FurnitureCatalogEntry[] = [
  workstationAsset('desk-horizontal', 'Bureau modulaire — horizontal', 0, 0, 3, 2),
  workstationAsset('desk-vertical', 'Bureau modulaire — vertical', 0, 2, 2, 3),
];
