import { LICENSED_ASSETS_ENABLED } from './assetLibrary';
import { ORIGINAL_CHARACTER_NAMES } from '@nestwork/shared';

// Tile size — matches Room_Builder tileset (32x32)
export const TILE_SIZE = 32;

// Character sprite frame size — LimeZu characters are 16 wide × 32 tall
// (each frame spans 2 tiles vertically). Slicing at 16×16 only shows the
// top half (head) — that was the "brown blob" bug.
export const CHAR_FRAME_SIZE = 16; // frame width
export const CHAR_FRAME_HEIGHT = 32; // frame height

// Player speed in pixels per second
export const PLAYER_SPEED = 120;
// Speed while holding Shift (sprint).
export const PLAYER_SPEED_SPRINT = 215;

// The full list stays available for private deployments and compatibility
// checks. The public picker/runtime only loads commercial characters when the
// optional full asset library is explicitly enabled.
export const NAMED_CHARACTERS = ['Adam', 'Alex', 'Amelia', 'Bob'];
export const PREMADE_CHARACTERS = Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
export const ORIGINAL_CHARACTERS: readonly string[] = ORIGINAL_CHARACTER_NAMES;
export const ALL_CHARACTER_NAMES: string[] = [...ORIGINAL_CHARACTERS, ...NAMED_CHARACTERS, ...PREMADE_CHARACTERS];
export const CHARACTER_NAMES: string[] = LICENSED_ASSETS_ENABLED ? ALL_CHARACTER_NAMES : [...ORIGINAL_CHARACTERS];
export type CharacterName = string;

export function availableCharacter(name?: string | null): string {
  return name && CHARACTER_NAMES.includes(name) ? name : defaultCharacterFor('');
}

export function characterDir(name: string): string {
  if (ORIGINAL_CHARACTERS.includes(name)) return '/Characters/original';
  return NAMED_CHARACTERS.includes(name) ? '/Characters/named' : '/Characters';
}

// Both formats retain 24 frames: six per direction, right/up/left/down.
// Keep the same 48px world height for furniture, nameplates and video anchors.
export function characterSpriteSpec(name: string) {
  const original = ORIGINAL_CHARACTERS.includes(name);
  const dir = characterDir(name);
  return {
    frameWidth: original ? 48 : CHAR_FRAME_SIZE,
    frameHeight: original ? 64 : CHAR_FRAME_HEIGHT,
    scale: original ? 0.75 : 1.5,
    walkFile: `${dir}/${name}_${original ? 'walk' : 'run_16x16'}.png`,
    idleFile: `${dir}/${name}_${original ? 'idle' : 'idle_anim_16x16'}.png`,
    // Hold the relaxed pose; blink briefly once per cycle, not six times/sec.
    idleDurations: original ? [1200, 180, 180, 180, 100, 360] : undefined,
  };
}

// Human label for the avatar picker.
export function characterLabel(name: string): string {
  return ORIGINAL_CHARACTERS.includes(name) || NAMED_CHARACTERS.includes(name) ? name : `Perso ${parseInt(name.slice(1), 10)}`;
}

// Existing explicit choices remain intact; new/unset avatars use NestWork art.
export function defaultCharacterFor(_userId: string): string {
  return 'Aurore';
}

// LimeZu spritesheet layout (384x32 = 24 frames of 16×32, one row).
// Verified IN-APP (not just on the sheet — the side profiles are deceptive):
// right(0-5), up/back(6-11), left(12-17), down/front(18-23). 6 frames/direction.
export const CHAR_ANIMS = {
  walk_right: { start: 0,  end: 5 },
  walk_up:    { start: 6,  end: 11 },
  walk_left:  { start: 12, end: 17 },
  walk_down:  { start: 18, end: 23 },
} as const;

export const CHAR_IDLE_ANIMS = {
  idle_right: { start: 0,  end: 5 },
  idle_up:    { start: 6,  end: 11 },
  idle_left:  { start: 12, end: 17 },
  idle_down:  { start: 18, end: 23 },
} as const;

// Room_Builder_free_32x32.png tile indices (17 cols x 23 rows)
// Floors start around row 5+. We pick nice wooden/tile floors per room type.
export const FLOOR_TILES: Record<string, { col: number; row: number }> = {
  OPEN:    { col: 0, row: 9 },   // light wood floor
  MEETING: { col: 0, row: 11 },  // darker wood floor
  FOCUS:   { col: 0, row: 13 },  // orange wood floor
  CHILL:   { col: 0, row: 15 },  // grey floor
};

// Wall tile positions in Room_Builder
export const WALL_TILES = {
  top:    { col: 1, row: 0 },
  left:   { col: 0, row: 1 },
  right:  { col: 2, row: 1 },
  bottom: { col: 1, row: 2 },
  corner_tl: { col: 0, row: 0 },
  corner_tr: { col: 2, row: 0 },
  corner_bl: { col: 0, row: 2 },
  corner_br: { col: 2, row: 2 },
};

// Colors for accents (kept for text/labels)
export const COLORS = {
  purple: 0x8b6cff,
  green: 0x50e88e,
  blue: 0x56b8ff,
  red: 0xff6b6b,
  yellow: 0xffd556,
} as const;

// Room accent colors for labels + walls
export const ROOM_ACCENTS: Record<string, number> = {
  OPEN: COLORS.green,
  MEETING: COLORS.blue,
  FOCUS: COLORS.yellow,
  CHILL: COLORS.purple,
};

// Clean solid floor tints per room type (soft, minimalist — no texture seams)
export const ROOM_FLOORS: Record<string, number> = {
  OPEN: 0xe6f4ec,
  MEETING: 0xe7f0fb,
  FOCUS: 0xfaf4e2,
  CHILL: 0xf1ecfb,
};
