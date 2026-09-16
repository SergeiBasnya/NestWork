import { ORIGINAL_CHARACTER_NAMES } from '@nestwork/shared';

const originalCharacters = new Set<string>(ORIGINAL_CHARACTER_NAMES);
const licensedCharacterPattern = /^(Adam|Alex|Amelia|Bob|P(?:0[1-9]|1\d|20))$/;

export function isSupportedCharacter(value: unknown): value is string {
  return typeof value === 'string'
    && (originalCharacters.has(value) || licensedCharacterPattern.test(value));
}
