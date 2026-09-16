// Procedural open-space generator. Produces a map snapshot (same shape as a saved
// template: { furniture }) that can be saved + applied like any other map.
//
// The palette below only references original NestWork assets. Generated maps
// can therefore be shared without depending on the private LimeZu library.

import { TILE_SIZE } from './constants';
import type { FurnitureCatalogEntry } from './furnitureTypes';
import { NESTWORK_OFFICE_ASSETS } from './nestworkOffice';
import { NESTWORK_SEATING_ASSETS } from './nestworkSeating';
import { NESTWORK_SHARED_SPACE_ASSETS } from './nestworkSharedSpaces';
import { NESTWORK_WORKSTATION_ASSETS } from './nestworkWorkstations';

interface SnapItem {
  catalogId: string;
  col: number;
  row: number;
  w: number;
  h: number;
  x: number;
  y: number;
  depth: number;
  flip: boolean;
}
export interface MapSnapshot {
  furniture: SnapItem[];
}

type Piece = Pick<FurnitureCatalogEntry, 'id' | 'col' | 'row' | 'w' | 'h'> & { depth: number };

function preset(entries: readonly FurnitureCatalogEntry[], slug: string): Piece {
  const item = entries.find((candidate) => candidate.id.includes(`_${slug}_`));
  if (!item) throw new Error(`Missing original NestWork preset: ${slug}`);
  return { id: item.id, col: item.col, row: item.row, w: item.w, h: item.h, depth: item.depth ?? 3 };
}

const PALETTE = {
  desk: preset(NESTWORK_WORKSTATION_ASSETS, 'desk-horizontal'),
  chair: preset(NESTWORK_SEATING_ASSETS, 'office-chair-up'),
  sofa: preset(NESTWORK_OFFICE_ASSETS, 'sofa'),
  armchair: preset(NESTWORK_SEATING_ASSETS, 'armchair-down'),
  roundTable: preset(NESTWORK_SEATING_ASSETS, 'cafe-table'),
  lowCabinet: preset(NESTWORK_OFFICE_ASSETS, 'low-cabinet'),
  largePlant: preset(NESTWORK_OFFICE_ASSETS, 'large-plant'),
  smallPlant: preset(NESTWORK_OFFICE_ASSETS, 'small-plant'),
  bookshelf: preset(NESTWORK_OFFICE_ASSETS, 'bookshelf'),
  coffeeStation: preset(NESTWORK_OFFICE_ASSETS, 'coffee-station'),
  vendingMachine: preset(NESTWORK_SHARED_SPACE_ASSETS, 'vending-machine'),
  rug: preset(NESTWORK_SHARED_SPACE_ASSETS, 'round-rug'),
} satisfies Record<string, Piece>;

const FLOOR_SHEETS = [
  'nw-floor-honey',
  'nw-floor-honey',
  'nw-floor-basketweave',
  'nw-floor-terrazzo',
  'nw-floor-warm-grey-carpet',
] as const;

export function generateOfficeMap(
  roomPosX: number,
  roomPosY: number,
  roomWpx: number,
  roomHpx: number,
  random: () => number = Math.random,
): MapSnapshot {
  const TW = Math.floor(roomWpx / TILE_SIZE);
  const TH = Math.floor(roomHpx / TILE_SIZE);
  const furniture: SnapItem[] = [];
  const occupied = new Set<string>(); // furniture-occupied tiles (floors don't count)
  const rand = (n: number) => Math.floor(random() * Math.max(1, n));
  const pick = <T>(items: readonly T[]): T => items[rand(items.length)];

  const toItem = (p: Piece, col: number, row: number, flip = false): SnapItem => ({
    catalogId: p.id,
    col: p.col, row: p.row, w: p.w, h: p.h,
    x: roomPosX + col * TILE_SIZE,
    y: roomPosY + row * TILE_SIZE,
    depth: p.depth, flip,
  });

  const free = (col: number, row: number, w: number, h: number): boolean => {
    if (col < 0 || row < 0 || col + w > TW || row + h > TH) return false;
    for (let c = col; c < col + w; c++) for (let r = row; r < row + h; r++) if (occupied.has(`${c},${r}`)) return false;
    return true;
  };
  const mark = (col: number, row: number, w: number, h: number) => {
    for (let c = col; c < col + w; c++) for (let r = row; r < row + h; r++) occupied.add(`${c},${r}`);
  };
  // Try to place a piece; returns true on success.
  const place = (p: Piece, col: number, row: number, flip = false): boolean => {
    if (!free(col, row, p.w, p.h)) return false;
    furniture.push(toItem(p, col, row, flip));
    mark(col, row, p.w, p.h);
    return true;
  };

  // ── 1. Floor the whole room (3×2 modules, clipped at room edges) ──
  const floorSheet = pick(FLOOR_SHEETS);
  for (let r = 0; r < TH; r += 2) {
    for (let c = 0; c < TW; c += 3) {
      const w = Math.min(3, TW - c);
      const h = Math.min(2, TH - r);
      furniture.push({
        catalogId: `${floorSheet}_0_0_${w}x${h}`,
        col: 0,
        row: 0,
        w,
        h,
        x: roomPosX + c * TILE_SIZE,
        y: roomPosY + r * TILE_SIZE,
        depth: 1,
        flip: false,
      });
    }
  }

  const M = 2; // wall margin

  // ── 2. Storage wall along the top ──
  let c = M;
  while (c < TW - M - 8) {
    if (random() < 0.6) {
      if (place(PALETTE.bookshelf, c, M)) c += PALETTE.bookshelf.w + 1;
      else c += 1;
    } else {
      if (place(PALETTE.lowCabinet, c, M)) c += PALETTE.lowCabinet.w + 1;
      else c += 1;
    }
  }

  // ── 3. Desk pods in 2×2 clusters with walkable aisles ──
  const deskRight = Math.floor(TW * 0.62);
  const podTop = M + 4;
  const podBottom = TH - 8;
  const CW = 9;
  const CH = 8;
  for (let by = podTop; by < podBottom - 3; by += CH) {
    for (let bx = M + 1; bx < deskRight - 7; bx += CW) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const col = bx + dx * 4;
          const row = by + dy * 4;
          if (place(PALETTE.desk, col, row)) place(PALETTE.chair, col + 1, row + 2);
        }
      }
      if (random() < 0.25) place(PALETTE.smallPlant, bx + 3, by + 3);
    }
  }

  // ── 4. Lounge (bottom-right): rug below cardinal furniture ──
  const lx = deskRight + 1;
  const ly = Math.floor(TH * 0.55);
  if (lx < TW - 7) {
    if (free(lx + 2, ly + 2, PALETTE.rug.w, PALETTE.rug.h)) {
      furniture.push(toItem(PALETTE.rug, lx + 2, ly + 2));
    }
    place(PALETTE.sofa, lx, ly);
    place(PALETTE.roundTable, lx + 3, ly);
    place(PALETTE.armchair, lx + 3, ly + 2);
    place(PALETTE.largePlant, lx + 6, ly + 2);
  }

  // ── 5. Coffee corner (top-right) ──
  const kx = TW - M - 6;
  const ky = M + 1;
  place(PALETTE.coffeeStation, kx, ky);
  place(PALETTE.vendingMachine, kx + 3, ky);

  // ── 6. Scatter a few plants in remaining cells ──
  for (let i = 0; i < 6; i++) {
    const col = M + rand(Math.max(1, TW - 2 * M));
    const row = M + 4 + rand(Math.max(1, TH - M - 8));
    place(random() < 0.35 ? PALETTE.largePlant : PALETTE.smallPlant, col, row);
  }

  return { furniture };
}

// A lightweight schematic thumbnail (floor fill + a coloured rect per piece),
// drawn straight from the snapshot — no Phaser render needed.
export function schematicPreview(snap: MapSnapshot, roomWpx: number, roomHpx: number, maxW = 360): string | null {
  if (typeof document === 'undefined') return null;
  const scale = Math.min(1, maxW / roomWpx);
  const cw = Math.max(1, Math.round(roomWpx * scale));
  const ch = Math.max(1, Math.round(roomHpx * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#cdb892'; // floor-ish
  ctx.fillRect(0, 0, cw, ch);
  const colorFor = (it: SnapItem) => {
    if (it.depth <= 1) return null; // floor — already filled
    if (it.catalogId.includes('plant')) return '#4f9d52';
    if (it.catalogId.includes('sofa') || it.catalogId.includes('armchair')) return '#6874a6';
    if (it.catalogId.includes('coffee') || it.catalogId.includes('vending')) return '#8aa0b0';
    return '#6b584a'; // generic furniture
  };
  // furniture are positioned in world coords; map back via room origin (x - posX).
  // We only have absolute x/y + room size, so derive local from the canvas extent.
  const minX = Math.min(...snap.furniture.map((f) => f.x), 0);
  const minY = Math.min(...snap.furniture.map((f) => f.y), 0);
  for (const it of snap.furniture) {
    const col = colorFor(it);
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect((it.x - minX) * scale, (it.y - minY) * scale, it.w * TILE_SIZE * scale, it.h * TILE_SIZE * scale);
  }
  try {
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}
