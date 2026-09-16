import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ORIGINAL_CHARACTER_NAMES } from '@nestwork/shared';
import { isSupportedCharacter } from '../src/services/characterSelection';

test('accepts every original character exposed by the web picker', () => {
  for (const character of ORIGINAL_CHARACTER_NAMES) {
    assert.equal(isSupportedCharacter(character), true, `${character} should be accepted by the server`);
  }
});

test('keeps licensed compatibility choices and rejects unknown values', () => {
  for (const character of ['Adam', 'Alex', 'Amelia', 'Bob', 'P01', 'P20']) {
    assert.equal(isSupportedCharacter(character), true);
  }
  for (const character of ['P00', 'P21', 'leo', '', null, undefined]) {
    assert.equal(isSupportedCharacter(character), false);
  }
});
