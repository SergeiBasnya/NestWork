import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { shouldToggleMicFromKeyboard } from '../lib/mediaShortcuts';

function keyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: 'm',
    metaKey: false,
    repeat: false,
    target: null,
    ...overrides,
  } as KeyboardEvent;
}

describe('media keyboard shortcuts', () => {
  test('uses M to toggle the microphone', () => {
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent()), true);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ key: 'M' })), true);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ key: 'v' })), false);
  });

  test('does not toggle while typing or using a modified shortcut', () => {
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ target: { tagName: 'INPUT' } as unknown as EventTarget })), false);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ target: { isContentEditable: true } as unknown as EventTarget })), false);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ ctrlKey: true })), false);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ metaKey: true })), false);
    assert.equal(shouldToggleMicFromKeyboard(keyboardEvent({ repeat: true })), false);
  });
});
