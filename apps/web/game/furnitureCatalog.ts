import type { FurnitureCatalogEntry } from './furnitureTypes';

export const FURNITURE_CATEGORIES = [
  'Tables',
  'Chaises',
  'Rangement',
  'Tech',
  'Deco',
  'Plantes',
  'Cuisine',
] as const;

export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

// Tile coordinates reference the licensed compatibility sheet (16 cols x 89 rows, 32px per tile).
// These are best-effort positions — adjust visually as needed
export const FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  // ─── Tables ───────────────────────────────────────────
  { id: 'desk_small',    name: 'Petit bureau',    category: 'Tables', col: 0,  row: 5,  w: 2, h: 1 },
  { id: 'desk_large',    name: 'Grand bureau',    category: 'Tables', col: 4,  row: 5,  w: 2, h: 1 },
  { id: 'table_square',  name: 'Table carree',    category: 'Tables', col: 2,  row: 5,  w: 1, h: 1 },
  { id: 'table_round',   name: 'Table ronde',     category: 'Tables', col: 3,  row: 5,  w: 1, h: 1 },
  { id: 'table_long',    name: 'Table longue',    category: 'Tables', col: 6,  row: 5,  w: 3, h: 1 },
  { id: 'table_coffee',  name: 'Table basse',     category: 'Tables', col: 9,  row: 5,  w: 2, h: 1 },
  { id: 'counter',       name: 'Comptoir',        category: 'Tables', col: 11, row: 5,  w: 2, h: 1 },
  { id: 'desk_corner',   name: 'Bureau angle',    category: 'Tables', col: 0,  row: 6,  w: 2, h: 2 },

  // ─── Chaises ──────────────────────────────────────────
  { id: 'chair_office',  name: 'Chaise bureau',   category: 'Chaises', col: 0,  row: 7,  w: 1, h: 1 },
  { id: 'chair_simple',  name: 'Chaise simple',   category: 'Chaises', col: 1,  row: 7,  w: 1, h: 1 },
  { id: 'chair_comfy',   name: 'Fauteuil',        category: 'Chaises', col: 2,  row: 7,  w: 1, h: 1 },
  { id: 'sofa_small',    name: 'Petit canape',    category: 'Chaises', col: 0,  row: 10, w: 2, h: 1 },
  { id: 'sofa_large',    name: 'Grand canape',    category: 'Chaises', col: 2,  row: 10, w: 3, h: 1 },
  { id: 'stool',         name: 'Tabouret',        category: 'Chaises', col: 3,  row: 7,  w: 1, h: 1 },
  { id: 'bean_bag',      name: 'Pouf',            category: 'Chaises', col: 4,  row: 7,  w: 1, h: 1 },

  // ─── Rangement ────────────────────────────────────────
  { id: 'bookshelf_s',   name: 'Petite etagere',  category: 'Rangement', col: 0,  row: 3,  w: 1, h: 2 },
  { id: 'bookshelf_l',   name: 'Bibliotheque',    category: 'Rangement', col: 1,  row: 3,  w: 2, h: 2 },
  { id: 'cabinet',       name: 'Armoire',         category: 'Rangement', col: 3,  row: 3,  w: 1, h: 2 },
  { id: 'filing',        name: 'Classeur',        category: 'Rangement', col: 4,  row: 3,  w: 1, h: 1 },
  { id: 'drawer',        name: 'Commode',         category: 'Rangement', col: 5,  row: 3,  w: 1, h: 1 },
  { id: 'shelf_wall',    name: 'Etagere murale',  category: 'Rangement', col: 7,  row: 3,  w: 2, h: 1, depth: 2 },
  { id: 'crate',         name: 'Caisse',          category: 'Rangement', col: 9,  row: 3,  w: 1, h: 1 },

  // ─── Tech ─────────────────────────────────────────────
  { id: 'computer',      name: 'PC bureau',       category: 'Tech', col: 6,  row: 2,  w: 1, h: 1 },
  { id: 'laptop',        name: 'Laptop',          category: 'Tech', col: 7,  row: 2,  w: 1, h: 1 },
  { id: 'monitor',       name: 'Ecran',           category: 'Tech', col: 8,  row: 2,  w: 1, h: 1 },
  { id: 'tv_large',      name: 'Television',      category: 'Tech', col: 9,  row: 2,  w: 2, h: 1 },
  { id: 'printer',       name: 'Imprimante',      category: 'Tech', col: 11, row: 2,  w: 1, h: 1 },
  { id: 'phone',         name: 'Telephone',       category: 'Tech', col: 13, row: 2,  w: 1, h: 1 },

  // ─── Deco ─────────────────────────────────────────────
  { id: 'rug_small',     name: 'Petit tapis',     category: 'Deco', col: 0,  row: 15, w: 2, h: 2, depth: 1 },
  { id: 'rug_large',     name: 'Grand tapis',     category: 'Deco', col: 2,  row: 15, w: 3, h: 3, depth: 1 },
  { id: 'painting_s',    name: 'Petit tableau',   category: 'Deco', col: 0,  row: 0,  w: 1, h: 1, depth: 2 },
  { id: 'painting_l',    name: 'Grand tableau',   category: 'Deco', col: 1,  row: 0,  w: 2, h: 1, depth: 2 },
  { id: 'whiteboard',    name: 'Tableau blanc',   category: 'Deco', col: 4,  row: 0,  w: 2, h: 2, depth: 2 },
  { id: 'clock',         name: 'Horloge',         category: 'Deco', col: 3,  row: 0,  w: 1, h: 1, depth: 2 },
  { id: 'poster',        name: 'Poster',          category: 'Deco', col: 6,  row: 0,  w: 1, h: 2, depth: 2 },
  { id: 'trophy',        name: 'Trophee',         category: 'Deco', col: 7,  row: 0,  w: 1, h: 1 },
  { id: 'vase',          name: 'Vase',            category: 'Deco', col: 9,  row: 0,  w: 1, h: 1 },

  // ─── Plantes ──────────────────────────────────────────
  { id: 'plant_small',   name: 'Petite plante',   category: 'Plantes', col: 9,  row: 19, w: 1, h: 1 },
  { id: 'plant_tall',    name: 'Grande plante',   category: 'Plantes', col: 10, row: 18, w: 1, h: 2 },
  { id: 'plant_pot',     name: 'Plante en pot',   category: 'Plantes', col: 11, row: 19, w: 1, h: 1 },
  { id: 'cactus',        name: 'Cactus',          category: 'Plantes', col: 15, row: 19, w: 1, h: 1 },
  { id: 'flower_pot',    name: 'Pot de fleurs',   category: 'Plantes', col: 14, row: 19, w: 1, h: 1 },
  { id: 'tree_small',    name: 'Petit arbre',     category: 'Plantes', col: 13, row: 18, w: 1, h: 2 },

  // ─── Cuisine ──────────────────────────────────────────
  { id: 'fridge',        name: 'Refrigerateur',   category: 'Cuisine', col: 0,  row: 25, w: 1, h: 2 },
  { id: 'microwave',     name: 'Micro-ondes',     category: 'Cuisine', col: 1,  row: 25, w: 1, h: 1 },
  { id: 'coffee',        name: 'Machine cafe',    category: 'Cuisine', col: 2,  row: 25, w: 1, h: 1 },
  { id: 'water_cooler',  name: 'Fontaine eau',    category: 'Cuisine', col: 3,  row: 25, w: 1, h: 2 },
  { id: 'sink',          name: 'Evier',           category: 'Cuisine', col: 4,  row: 25, w: 1, h: 1 },
  { id: 'trash',         name: 'Poubelle',        category: 'Cuisine', col: 6,  row: 25, w: 1, h: 1 },
  { id: 'vending',       name: 'Distributeur',    category: 'Cuisine', col: 7,  row: 25, w: 1, h: 2 },
];

export const CATALOG_BY_ID = new Map(
  FURNITURE_CATALOG.map((item) => [item.id, item]),
);
