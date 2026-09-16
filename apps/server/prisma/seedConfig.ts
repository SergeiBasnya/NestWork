import { z } from 'zod';

export interface SeedAccount {
  email: string;
  name: string;
  password: string;
  role: 'OWNER' | 'MEMBER';
}

export interface SeedConfig {
  databaseUrl: string;
  accounts: [SeedAccount, SeedAccount];
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required seed environment variable: ${key}`);
  return value;
}

const emailSchema = z.string().email();

export function readSeedConfig(env: NodeJS.ProcessEnv): SeedConfig {
  if (env.NODE_ENV === 'production' && env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Production seed blocked. Set ALLOW_PRODUCTION_SEED=true explicitly to proceed.');
  }

  const password1 = required(env, 'SEED_USER1_PASSWORD');
  const password2 = required(env, 'SEED_USER2_PASSWORD');
  if (password1.length < 12 || password2.length < 12) {
    throw new Error('Seed passwords must contain at least 12 characters.');
  }
  if (password1 === password2) throw new Error('Seed accounts must use distinct passwords.');
  const email1 = emailSchema.parse(required(env, 'SEED_USER1_EMAIL')).toLowerCase();
  const email2 = emailSchema.parse(required(env, 'SEED_USER2_EMAIL')).toLowerCase();
  if (email1 === email2) throw new Error('Seed accounts must use distinct email addresses.');

  return {
    databaseUrl: required(env, 'DATABASE_URL'),
    accounts: [
      {
        email: email1,
        name: env.SEED_USER1_NAME?.trim() || 'Propriétaire',
        password: password1,
        role: 'OWNER',
      },
      {
        email: email2,
        name: env.SEED_USER2_NAME?.trim() || 'Membre',
        password: password2,
        role: 'MEMBER',
      },
    ],
  };
}
