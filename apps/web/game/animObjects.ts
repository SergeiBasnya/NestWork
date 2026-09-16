import { LICENSED_ASSETS_ENABLED } from './assetLibrary';

// Animated decorator objects — looping spritesheets sliced from LimeZu's
// animated_objects pack (see public/AnimObjects/). Shared by DecoratorBar
// (thumbnail picker) and SpaceScene (rendering + looping animation).
//
// A placed animated object has catalogId `anim_<key>` (key has no underscore).
// Footprint (tilesW × tilesH) is stored in the Furniture w/h columns.

export interface AnimObjectDef {
  key: string;
  label: string;
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
  tilesW: number;
  tilesH: number;
  fps: number;
}

export const ANIM_OBJECTS: AnimObjectDef[] = [
  { key: 'tv', label: 'Télé', file: '/AnimObjects/tv.png', frameW: 64, frameH: 64, frames: 6, tilesW: 2, tilesH: 2, fps: 6 },
  { key: 'coffee', label: 'Machine à café', file: '/AnimObjects/coffee.png', frameW: 32, frameH: 64, frames: 6, tilesW: 1, tilesH: 2, fps: 6 },
  { key: 'aquarium', label: 'Aquarium', file: '/AnimObjects/aquarium.png', frameW: 64, frameH: 64, frames: 8, tilesW: 2, tilesH: 2, fps: 6 },
  { key: 'aquarium2', label: 'Aquarium rouge', file: '/AnimObjects/aquarium2.png', frameW: 64, frameH: 64, frames: 8, tilesW: 2, tilesH: 2, fps: 6 },
  { key: 'clock', label: 'Horloge', file: '/AnimObjects/clock.png', frameW: 32, frameH: 64, frames: 10, tilesW: 1, tilesH: 2, fps: 5 },
];

export const AVAILABLE_ANIM_OBJECTS: readonly AnimObjectDef[] = LICENSED_ASSETS_ENABLED ? ANIM_OBJECTS : [];

const BY_KEY = new Map(ANIM_OBJECTS.map((o) => [o.key, o]));

// catalogId `anim_<key>` → its definition (null if not an animated object).
export function animObjectForCatalog(catalogId: string): AnimObjectDef | null {
  if (!catalogId.startsWith('anim_')) return null;
  return BY_KEY.get(catalogId.slice('anim_'.length)) ?? null;
}
