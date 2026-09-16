import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const PRIVATE_PREFIXES = [
  'DEPLOY.md',
  'apps/web/public/Rsc',
  'apps/web/public/Modern',
  'apps/web/public/AnimObjects',
  'apps/web/public/Emotes',
  'apps/web/public/Characters/named',
  'apps/web/public/product/screenshots',
  'apps/web/public/og.png',
];

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.agents',
  '.codex',
  '.next',
  '.pnpm-store',
  '.turbo',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'uploads',
]);

function normalizedRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function isPrivateCharacterFile(path) {
  return /^apps\/web\/public\/Characters\/[^/]+\.png$/i.test(path);
}

function isLocalEnvironmentFile(path) {
  const name = path.split('/').at(-1) ?? '';
  if (name === '.env.example' || name === '.env.local.example') return false;
  return name === '.env' || name.startsWith('.env.');
}

export function publicExportIncludes(root, sourcePath) {
  const path = normalizedRelative(root, sourcePath);
  if (!path) return true;
  if (path.split('/').some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))) return false;
  if (isLocalEnvironmentFile(path) || isPrivateCharacterFile(path)) return false;
  if (path.endsWith('.log') || path.endsWith('.tsbuildinfo')) return false;
  return !PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export async function assertEmptyOrMissing(target) {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) throw new Error(`Export target is not a directory: ${target}`);
    const entries = await readdir(target);
    if (entries.length > 0) throw new Error(`Export target must be empty: ${target}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

export async function exportPublicTree(root, target) {
  const sourceRoot = resolve(root);
  const destination = resolve(target);
  if (destination === sourceRoot || destination.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error('Export outside the source repository to avoid copying the export into itself.');
  }

  await assertEmptyOrMissing(destination);
  await mkdir(destination, { recursive: true });
  await cp(sourceRoot, destination, {
    recursive: true,
    preserveTimestamps: true,
    filter: (sourcePath) => publicExportIncludes(sourceRoot, sourcePath),
  });
}

export const FORBIDDEN_PUBLIC_PATHS = [
  'DEPLOY.md',
  'apps/web/public/Rsc',
  'apps/web/public/Modern',
  'apps/web/public/AnimObjects',
  'apps/web/public/Emotes',
  'apps/web/public/Characters/named',
  'apps/web/public/product/screenshots',
  'apps/web/public/og.png',
];
