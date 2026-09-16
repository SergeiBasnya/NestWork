import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readSeedConfig } from '../prisma/seedConfig';

const validEnv = {
  DATABASE_URL: 'postgresql://local/test',
  SEED_USER1_EMAIL: 'owner@example.test',
  SEED_USER1_PASSWORD: 'owner-secret-123',
  SEED_USER2_EMAIL: 'member@example.test',
  SEED_USER2_PASSWORD: 'member-secret-456',
};

describe('readSeedConfig', () => {
  test('requires explicit, distinct credentials before seeding', () => {
    assert.throws(() => readSeedConfig({ DATABASE_URL: validEnv.DATABASE_URL }), /SEED_USER1_PASSWORD/);
    assert.throws(
      () => readSeedConfig({ ...validEnv, SEED_USER2_PASSWORD: validEnv.SEED_USER1_PASSWORD }),
      /distinct passwords/,
    );
  });

  test('requires valid and distinct email addresses', () => {
    assert.throws(() => readSeedConfig({ ...validEnv, SEED_USER1_EMAIL: 'not-an-email' }));
    assert.throws(() => readSeedConfig({ ...validEnv, SEED_USER2_EMAIL: validEnv.SEED_USER1_EMAIL }), /distinct email/i);
  });

  test('blocks production unless explicitly acknowledged', () => {
    assert.throws(() => readSeedConfig({ ...validEnv, NODE_ENV: 'production' }), /Production seed blocked/);
    assert.equal(
      readSeedConfig({ ...validEnv, NODE_ENV: 'production', ALLOW_PRODUCTION_SEED: 'true' }).accounts.length,
      2,
    );
  });
});
