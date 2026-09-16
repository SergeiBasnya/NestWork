import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildContentSecurityPolicy,
  validateProductionRuntimeConfig,
  PRODUCTION_API_FALLBACK,
}: {
  buildContentSecurityPolicy: (options?: { isDevelopment?: boolean; apiUrl?: string; wsUrl?: string }) => string;
  validateProductionRuntimeConfig: (options?: { apiUrl?: string; wsUrl?: string }) => {
    apiOrigin: string;
    wsOrigin: string;
  };
  PRODUCTION_API_FALLBACK: string;
} = require('../csp.js');

function directive(policy: string, name: string): string {
  return policy.split('; ').find((entry) => entry.startsWith(`${name} `) || entry === name) ?? '';
}

describe('static Content Security Policy', () => {
  test('production is exact, revokes attributes/frames and never permits eval', () => {
    const policy = buildContentSecurityPolicy({
      isDevelopment: false,
      apiUrl: 'https://api.example.com',
      wsUrl: 'wss://realtime.example.com',
    });
    assert.equal(directive(policy, 'script-src'), "script-src 'self' 'unsafe-inline'");
    assert.equal(directive(policy, 'script-src-attr'), "script-src-attr 'none'");
    assert.equal(directive(policy, 'img-src'), "img-src 'self' data: blob: https://api.example.com");
    assert.equal(directive(policy, 'connect-src'), "connect-src 'self' https://api.example.com wss://realtime.example.com");
    assert.equal(directive(policy, 'frame-src'), "frame-src 'none'");
    assert.equal(directive(policy, 'manifest-src'), "manifest-src 'self'");
    assert.equal(directive(policy, 'base-uri'), "base-uri 'none'");
    assert.equal(directive(policy, 'upgrade-insecure-requests'), 'upgrade-insecure-requests');
    assert.equal(policy.includes("'unsafe-eval'"), false);
    assert.equal(directive(policy, 'connect-src').split(' ').includes('https:'), false);
  });

  test('development permits Next eval and localhost HTTP/WebSocket only as broad dev sources', () => {
    const policy = buildContentSecurityPolicy({ isDevelopment: true, apiUrl: 'http://localhost:4000' });
    assert.match(directive(policy, 'script-src'), /'unsafe-eval'/);
    assert.match(directive(policy, 'connect-src'), /http:\/\/localhost:\*/);
    assert.match(directive(policy, 'connect-src'), /ws:\/\/localhost:\*/);
    assert.equal(policy.includes('upgrade-insecure-requests'), false);
  });

  test('rejects hostile protocols, credentials, paths and insecure production origins', () => {
    for (const apiUrl of [
      'javascript:alert(1)',
      'data:text/plain,evil',
      'https://user:pass@evil.example',
      'https://evil.example/path',
      'http://api.example.com',
    ]) {
      const policy = buildContentSecurityPolicy({ isDevelopment: false, apiUrl, wsUrl: 'https://wrong-protocol.example' });
      assert.equal(directive(policy, 'img-src'), `img-src 'self' data: blob: ${PRODUCTION_API_FALLBACK}`);
      assert.equal(directive(policy, 'connect-src'), `connect-src 'self' ${PRODUCTION_API_FALLBACK} wss://api.nestwork.site`);
      assert.equal(policy.includes('evil.example'), false);
    }
  });
});

describe('production runtime configuration', () => {
  test('accepts public HTTPS/WSS origins and derives WSS from the API when omitted', () => {
    assert.deepEqual(validateProductionRuntimeConfig({ apiUrl: 'https://api.example.com' }), {
      apiOrigin: 'https://api.example.com',
      wsOrigin: 'wss://api.example.com',
    });
    assert.deepEqual(validateProductionRuntimeConfig({
      apiUrl: 'https://api.example.com',
      wsUrl: 'wss://realtime.example.com',
    }), {
      apiOrigin: 'https://api.example.com',
      wsOrigin: 'wss://realtime.example.com',
    });
  });

  test('fails a production build instead of silently targeting localhost', () => {
    assert.throws(() => validateProductionRuntimeConfig(), /NEXT_PUBLIC_API_URL/);
    assert.throws(
      () => validateProductionRuntimeConfig({ apiUrl: 'http://localhost:4000' }),
      /NEXT_PUBLIC_API_URL/,
    );
    assert.throws(
      () => validateProductionRuntimeConfig({
        apiUrl: 'https://api.example.com',
        wsUrl: 'ws://api.example.com',
      }),
      /NEXT_PUBLIC_WS_URL/,
    );
  });
});
