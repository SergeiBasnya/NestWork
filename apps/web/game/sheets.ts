// Single source of truth for every tile sheet usable in the decorator.
// Shared by DecoratorBar (the picker UI) and SpaceScene (rendering).
//
// A placed item's catalogId is `${key}_${col}_${row}_${w}x${h}`. The leading
// token (before the first "_") is the sheet `key`, which maps back to a Phaser
// texture + render depth here. Legacy ids (furniture_/wall_/floor_) keep working
// because their compatibility sheets remain registered under the paid pack.

import type { FurnitureCatalogEntry } from './furnitureTypes';
import { NESTWORK_OFFICE_ASSETS } from './nestworkOffice';
import { NESTWORK_SEATING_ASSETS } from './nestworkSeating';
import { NESTWORK_SHARED_SPACE_ASSETS } from './nestworkSharedSpaces';
import { NESTWORK_STRUCTURE_ASSETS } from './nestworkStructure';
import { NESTWORK_WALL_ASSETS } from './nestworkWalls';
import { NESTWORK_RAISED_WALL_ASSETS } from './nestworkRaisedWalls';
import { NESTWORK_MEETING_ASSETS } from './nestworkMeeting';
import { NESTWORK_WORKSTATION_ASSETS } from './nestworkWorkstations';
import { NESTWORK_HIGH_COLLABORATION_ASSETS } from './nestworkHighCollaboration';
import { LICENSED_ASSETS_ENABLED } from './assetLibrary';

export interface SheetDef {
  key: string; // unique — used as catalogId prefix AND default texture key
  tex: string; // Phaser texture key (may be shared, e.g. wall + floor)
  file: string; // public path
  label: string;
  group: string; // category shown in the picker's grouped selector
  family?: NestWorkAssetFamily; // first-level family for original NestWork assets
  cols: number; // sheet width in tiles
  rows: number; // sheet height in tiles
  depth: number; // render order: floors < walls < furniture < players(10)
  tileFill?: boolean; // repeat one source tile across a drag-sized floor area
  bleedEdges?: boolean; // overlap adjacent surface sprites by 1px to hide canvas seams
  presets?: readonly FurnitureCatalogEntry[]; // named, tile-aligned objects shown as picker cards
  hidden?: boolean; // compatibility-only sheet: preloaded/rendered but omitted from the picker
  rowStart?: number; // first row shown in the picker (default 0)
  rowEnd?: number; // exclusive last row shown (default = rows)
}

export type NestWorkAssetFamily = 'floors' | 'walls' | 'furniture' | 'outdoor';

export interface SheetFamilyDef {
  key: string;
  label: string;
  sheets: SheetDef[];
  original: boolean;
}

const NESTWORK_FAMILY_LABELS: ReadonlyArray<{ key: NestWorkAssetFamily; label: string }> = [
  { key: 'floors', label: 'Sols' },
  { key: 'walls', label: 'Murs' },
  { key: 'furniture', label: 'Mobilier' },
  { key: 'outdoor', label: 'Extérieur' },
];

// Helper to keep the theme list terse.
const theme = (key: string, n: number, name: string, label: string, group: string, rows: number, cols = 16): SheetDef => ({
  key,
  tex: key,
  file: `/Modern/themes/${n}_${name}_32x32.png`,
  label,
  group,
  cols,
  rows,
  depth: 3,
});

export const SHEETS: SheetDef[] = [
  // ── Construction (murs, sols, fenêtres) ──
  { key: 'rb', tex: 'rb', file: '/Modern/Room_Builder_32x32.png', label: 'Room Builder', group: 'Construction', cols: 76, rows: 113, depth: 2 },

  // ── Compatibility sheets from the licensed pack ──
  // Keep these keys stable: existing maps persist them in catalogId values.
  { key: 'furniture', tex: 'interiors', file: '/Modern/legacy/Interiors_32x32.png', label: 'Meubles', group: 'Général', cols: 16, rows: 89, depth: 3 },
  { key: 'wall', tex: 'murssols', file: '/Modern/legacy/Room_Builder_legacy_32x32.png', label: 'Murs', group: 'Construction', cols: 17, rows: 23, depth: 2, bleedEdges: true, rowStart: 0, rowEnd: 5 },
  { key: 'floor', tex: 'murssols', file: '/Modern/legacy/Room_Builder_legacy_32x32.png', label: 'Sols', group: 'Construction', cols: 17, rows: 23, depth: 1, bleedEdges: true, rowStart: 5, rowEnd: 23 },

  // ── Extérieur — assets originaux NestWork ──
  { key: 'grass', tex: 'grass', file: '/NestWork/terrain/grass-32-v1.png', label: 'Pelouse', group: 'Extérieur', family: 'outdoor', cols: 1, rows: 1, depth: 1, tileFill: true },

  // ── Construction originale NestWork ──
  { key: 'nw-floor-ivory', tex: 'nw-floor-ivory', file: '/NestWork/floors/ivory-tile-32-v4.png', label: 'Carrelage ivoire', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-oak', tex: 'nw-floor-oak', file: '/NestWork/floors/oak-32-v4.png', label: 'Parquet chêne', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-honey', tex: 'nw-floor-honey', file: '/NestWork/floors/honey-parquet-32-v1.png', label: 'Parquet miel', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-basketweave', tex: 'nw-floor-basketweave', file: '/NestWork/floors/basketweave-parquet-32-v1.png', label: 'Parquet tressé', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-terrazzo', tex: 'nw-floor-terrazzo', file: '/NestWork/floors/warm-terrazzo-32-v1.png', label: 'Terrazzo crème', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-warm-grey-carpet', tex: 'nw-floor-warm-grey-carpet', file: '/NestWork/floors/warm-grey-carpet-32-v1.png', label: 'Moquette gris chaud', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-carpet', tex: 'nw-floor-carpet', file: '/NestWork/floors/graphite-carpet-32-v4.png', label: 'Moquette graphite', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-floor-slate', tex: 'nw-floor-slate', file: '/NestWork/floors/slate-tile-32-v4.png', label: 'Dalles ardoise', group: 'NestWork original', family: 'floors', cols: 1, rows: 1, depth: 1, tileFill: true },
  { key: 'nw-structure', tex: 'nw-structure', file: '/NestWork/construction/starter-structure-v1.png', label: 'Murs NestWork v1', group: 'NestWork original', family: 'walls', cols: 12, rows: 8, depth: 2, presets: NESTWORK_STRUCTURE_ASSETS, hidden: true },
  { key: 'nw-walls-v2', tex: 'nw-walls-v2', file: '/NestWork/construction/modular-walls-v2.png', label: 'Cloisons fines v2', group: 'NestWork original', family: 'walls', cols: 13, rows: 5, depth: 2, bleedEdges: true, presets: NESTWORK_WALL_ASSETS, hidden: true },
  { key: 'nw-raised-walls-v3', tex: 'nw-raised-walls-v3', file: '/NestWork/construction/raised-walls-v3.png', label: 'Murs en hauteur', group: 'NestWork original', family: 'walls', cols: 10, rows: 8, depth: 2, presets: NESTWORK_RAISED_WALL_ASSETS },

  // ── Mobilier original NestWork ──
  { key: 'nw-office', tex: 'nw-office', file: '/NestWork/office/starter-office-v2.png', label: 'Bureau NestWork', group: 'NestWork original', family: 'furniture', cols: 12, rows: 10, depth: 3, presets: NESTWORK_OFFICE_ASSETS },
  { key: 'nw-seating', tex: 'nw-seating', file: '/NestWork/office/starter-seating-v1.png', label: 'Assises NestWork v1', group: 'NestWork original', family: 'furniture', cols: 8, rows: 6, depth: 3, hidden: true },
  { key: 'nw-seating-v2', tex: 'nw-seating-v2', file: '/NestWork/office/starter-seating-v2.png', label: 'Assises & café', group: 'NestWork original', family: 'furniture', cols: 6, rows: 4, depth: 3, presets: NESTWORK_SEATING_ASSETS },
  { key: 'nw-workstations', tex: 'nw-workstations', file: '/NestWork/workstations/workstations-v1.png', label: 'Postes de travail', group: 'NestWork original', family: 'furniture', cols: 3, rows: 5, depth: 3, presets: NESTWORK_WORKSTATION_ASSETS },
  { key: 'nw-meeting', tex: 'nw-meeting', file: '/NestWork/meeting/meeting-tables-v1.png', label: 'Réunion', group: 'NestWork original', family: 'furniture', cols: 4, rows: 6, depth: 3, presets: NESTWORK_MEETING_ASSETS },
  { key: 'nw-high-collaboration', tex: 'nw-high-collaboration', file: '/NestWork/collaboration/high-collaboration-v1.png', label: 'Tables hautes', group: 'NestWork original', family: 'furniture', cols: 4, rows: 7, depth: 3, presets: NESTWORK_HIGH_COLLABORATION_ASSETS },
  { key: 'nw-shared', tex: 'nw-shared', file: '/NestWork/shared-spaces/starter-shared-spaces-v2.png', label: 'Espaces partagés', group: 'NestWork original', family: 'furniture', cols: 13, rows: 13, depth: 3, presets: NESTWORK_SHARED_SPACE_ASSETS },

  // ── Général ──
  theme('t1', 1, 'Generic', 'Générique', 'Général', 78),

  // ── Maison ──
  theme('t2', 2, 'LivingRoom', 'Salon', 'Maison', 45),
  theme('t3', 3, 'Bathroom', 'Salle de bain', 'Maison', 56),
  theme('t4', 4, 'Bedroom', 'Chambre', 'Maison', 107),
  theme('t12', 12, 'Kitchen', 'Cuisine', 'Maison', 49),
  theme('t14', 14, 'Basement', 'Sous-sol', 'Maison', 50),
  theme('t20', 20, 'Japanese_interiors', 'Japonais', 'Maison', 32),
  theme('t26', 26, 'Condominium', 'Appartement', 'Maison', 19),

  // ── Travail & école ──
  theme('t5', 5, 'Classroom_and_library', 'Classe & bibliothèque', 'Travail & école', 34),
  theme('t13', 13, 'Conference_Hall', 'Salle de conférence', 'Travail & école', 12),
  theme('t23', 23, 'Television_and_Film_Studio', 'Studio TV / ciné', 'Travail & école', 14),

  // ── Loisirs & sport ──
  theme('t6', 6, 'Music_and_sport', 'Musique & sport', 'Loisirs & sport', 48),
  theme('t7', 7, 'Art', 'Art', 'Loisirs & sport', 7),
  theme('t8', 8, 'Gym', 'Gym', 'Loisirs & sport', 33),
  theme('t9', 9, 'Fishing', 'Pêche', 'Loisirs & sport', 27),
  theme('t25', 25, 'Shooting_Range', 'Stand de tir', 'Loisirs & sport', 5),

  // ── Commerces ──
  theme('t16', 16, 'Grocery_store', 'Épicerie', 'Commerces', 78),
  theme('t21', 21, 'Clothing_Store', 'Magasin de vêtements', 'Commerces', 67),
  theme('t22', 22, 'Museum', 'Musée', 'Commerces', 122),
  theme('t24', 24, 'Ice_Cream_Shop', 'Glacier', 'Commerces', 17),

  // ── Spécial & fêtes ──
  theme('t10', 10, 'Birthday_party', 'Anniversaire', 'Spécial & fêtes', 7, 12),
  theme('t11', 11, 'Halloween', 'Halloween', 'Spécial & fêtes', 61),
  theme('t15', 15, 'Christmas', 'Noël', 'Spécial & fêtes', 17),
  theme('t17', 17, 'Visibile_Upstairs_System', 'Étages', 'Spécial & fêtes', 27),
  theme('t18', 18, 'Jail', 'Prison', 'Spécial & fêtes', 45),
  theme('t19', 19, 'Hospital', 'Hôpital', 'Spécial & fêtes', 110),
];

const BY_KEY = new Map(SHEETS.map((s) => [s.key, s]));
const PRESET_BY_ID = new Map(
  SHEETS.flatMap((sheet) => sheet.presets ?? []).map((item) => [item.id, item]),
);

// catalogId → sheet (by leading token). Falls back to the compatibility sheet.
export function sheetForCatalogId(catalogId: string): SheetDef {
  const key = catalogId.split('_')[0];
  return BY_KEY.get(key) ?? BY_KEY.get('furniture')!;
}

// Seam correction is an asset property, not a render-depth property. Room
// Builder contains walls, doors, borders and decorative pieces on the same
// depth, so inferring this from depth would smear unrelated sprite edges.
export function sheetNeedsEdgeBleed(catalogId: string): boolean {
  return !!sheetForCatalogId(catalogId).bleedEdges;
}

export function catalogRenderOffset(catalogId: string): { x: number; y: number } {
  const item = PRESET_BY_ID.get(catalogId);
  return { x: item?.renderOffsetX ?? 0, y: item?.renderOffsetY ?? 0 };
}

export function catalogGridEdgeSnap(catalogId: string): { x: boolean; y: boolean } {
  const item = PRESET_BY_ID.get(catalogId);
  return { x: !!item?.snapToGridEdgeX, y: !!item?.snapToGridEdgeY };
}

// Original NestWork sheets expose a reliable default layer. Placed objects can
// still override it with their persisted per-object index in the decorator.
export function catalogSemanticDepth(catalogId: string): number | null {
  const sheet = sheetForCatalogId(catalogId);
  if (!sheet.family) return null;
  return PRESET_BY_ID.get(catalogId)?.depth ?? sheet.depth;
}

export function catalogCollisionCells(catalogId: string): NonNullable<FurnitureCatalogEntry['collisionCells']> {
  return PRESET_BY_ID.get(catalogId)?.collisionCells ?? [];
}

// Unique (tex, file) pairs to preload — wall + floor share one file.
export function sheetTextures(includeLicensed = LICENSED_ASSETS_ENABLED): { key: string; file: string }[] {
  const seen = new Set<string>();
  const out: { key: string; file: string }[] = [];
  for (const s of SHEETS) {
    if (!includeLicensed && !s.family) continue;
    if (seen.has(s.tex)) continue;
    seen.add(s.tex);
    out.push({ key: s.tex, file: s.file });
  }
  return out;
}

// Category groups in display order, each with its sheets.
export function sheetGroups(includeLicensed = LICENSED_ASSETS_ENABLED): { group: string; sheets: SheetDef[] }[] {
  const order: string[] = [];
  const map = new Map<string, SheetDef[]>();
  for (const s of SHEETS) {
    if (s.hidden) continue;
    if (!includeLicensed && !s.family) continue;
    if (!map.has(s.group)) {
      map.set(s.group, []);
      order.push(s.group);
    }
    map.get(s.group)!.push(s);
  }
  return order.map((group) => ({ group, sheets: map.get(group)! }));
}

// Compact two-level navigation for the decorator. Original assets are grouped
// by their functional family; licensed sheets keep their existing categories.
export function sheetFamilies(includeLicensed = LICENSED_ASSETS_ENABLED): SheetFamilyDef[] {
  const visible = SHEETS.filter((sheet) => !sheet.hidden);
  const original = NESTWORK_FAMILY_LABELS.map(({ key, label }) => ({
    key: `nestwork:${key}`,
    label: `NestWork · ${label}`,
    sheets: visible.filter((sheet) => sheet.family === key),
    original: true,
  })).filter((family) => family.sheets.length > 0);

  const licensed: SheetFamilyDef[] = [];
  for (const { group, sheets } of sheetGroups(includeLicensed)) {
    const familySheets = sheets.filter((sheet) => !sheet.family);
    if (!familySheets.length) continue;
    licensed.push({
      key: `library:${group}`,
      label: group,
      sheets: familySheets,
      original: false,
    });
  }

  return [...original, ...licensed];
}

export function familyKeyForSheet(sheetKey: string): string | null {
  const sheet = BY_KEY.get(sheetKey);
  if (!sheet) return null;
  return sheet.family ? `nestwork:${sheet.family}` : `library:${sheet.group}`;
}
