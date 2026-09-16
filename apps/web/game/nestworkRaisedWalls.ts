import type { CatalogCollisionCell, FurnitureCatalogEntry } from './furnitureTypes';

const SHEET_KEY = 'nw-raised-walls-v3';

function raisedWall(
  slug: string,
  name: string,
  col: number,
  row: number,
  w: number,
  h: number,
  collisionCells: readonly CatalogCollisionCell[] = [{ col: 0, row: 0, w, h }],
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
    collisionCells,
  };
}

const doorwayCollision: readonly CatalogCollisionCell[] = [
  { col: 0, row: 0, w: 1, h: 2 },
  { col: 2, row: 0, w: 1, h: 2 },
];

export const NESTWORK_RAISED_WALL_ASSETS: readonly FurnitureCatalogEntry[] = [
  raisedWall('back-straight', 'Mur du fond', 0, 0, 3, 2),
  raisedWall('back-window', 'Mur du fond — fenêtre', 3, 0, 3, 2),
  raisedWall('back-door', 'Mur du fond — passage', 6, 0, 3, 2, doorwayCollision),
  raisedWall('back-short', 'Mur du fond — module court', 9, 0, 1, 2),
  raisedWall('back-accent', 'Mur du fond — soubassement bleu', 0, 2, 3, 2),
  raisedWall('side-left', 'Tranche latérale gauche', 3, 2, 1, 3),
  raisedWall('side-right', 'Tranche latérale droite', 4, 2, 1, 3),
  raisedWall('corner-left', 'Angle du fond — gauche', 5, 2, 1, 2),
  raisedWall('corner-right', 'Angle du fond — droit', 6, 2, 1, 2),
  raisedWall('pillar', 'Pilier mural', 7, 2, 1, 2),
  raisedWall('back-glass', 'Mur du fond — baie vitrée', 0, 5, 3, 2),
  raisedWall('side-glass-left', 'Tranche vitrée gauche', 3, 5, 1, 3),
  raisedWall('side-glass-right', 'Tranche vitrée droite', 4, 5, 1, 3),
];
