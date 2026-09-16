import type { FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-meeting';

function meetingAsset(
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

export const NESTWORK_MEETING_ASSETS: readonly FurnitureCatalogEntry[] = [
  meetingAsset('table-horizontal', 'Table de réunion — horizontale', 0, 0, 4, 2),
  meetingAsset('table-vertical', 'Table de réunion — verticale', 0, 2, 2, 4),
];
