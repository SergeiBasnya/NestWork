import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { internalRedirect } from '../lib/internalRedirect';

describe('internalRedirect', () => {
  test('accepts only an internal absolute path', () => {
    assert.equal(internalRedirect('/workspace/team?tab=chat#latest'), '/workspace/team?tab=chat#latest');
    assert.equal(internalRedirect('https://evil.test'), '/workspace/nestwork');
    assert.equal(internalRedirect('//evil.test/path'), '/workspace/nestwork');
    assert.equal(internalRedirect('/%2f%2fevil.test'), '/workspace/nestwork');
    assert.equal(internalRedirect('/\\evil.test'), '/workspace/nestwork');
    assert.equal(internalRedirect('javascript:alert(1)'), '/workspace/nestwork');
  });
});
