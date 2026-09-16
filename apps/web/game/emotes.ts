// Reaction emotes shared by the picker UI and Phaser. The public edition uses
// original NestWork SVGs; licensed private deployments retain their historical
// PNG paths so existing visual behaviour remains available.

import { LICENSED_ASSETS_ENABLED } from './assetLibrary';

export interface EmoteDef {
  key: string;
  label: string;
}

export const EMOTES: EmoteDef[] = [
  { key: 'heart', label: 'Cœur' },
  { key: 'excl', label: 'Oh !' },
  { key: 'question', label: 'Hein ?' },
  { key: 'music', label: 'Musique' },
  { key: 'sleep', label: 'Absent' },
  { key: 'sun', label: 'Content' },
];

export const EMOTE_KEYS = EMOTES.map((e) => e.key);
export const emoteFile = (key: string) =>
  LICENSED_ASSETS_ENABLED ? `/Emotes/${key}.png` : `/NestWork/emotes/${key}.svg`;
