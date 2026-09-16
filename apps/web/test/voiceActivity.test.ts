import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachVoiceActivityDetector } from '../lib/voiceActivity';

test('keeps remote audio usable when AudioContext creation fails', () => {
  const originalWindow = globalThis.window;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let speaking = true;

  class RefusedAudioContext {
    constructor() {
      throw new Error('AudioContext quota exceeded');
    }
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: RefusedAudioContext },
  });
  globalThis.requestAnimationFrame = (() => 1) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

  try {
    const stream = { getAudioTracks: () => [{}] } as unknown as MediaStream;
    const cleanup = attachVoiceActivityDetector(stream, (value) => { speaking = value; });
    assert.equal(typeof cleanup, 'function');
    assert.equal(speaking, false);
    assert.doesNotThrow(cleanup);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});
