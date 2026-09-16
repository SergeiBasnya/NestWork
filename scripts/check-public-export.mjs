import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPublicTree, FORBIDDEN_PUBLIC_PATHS } from './lib/public-export.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--');
const temporaryRoot = requestedTarget ? null : await mkdtemp(join(tmpdir(), 'nestwork-public-check-'));
const target = requestedTarget ? resolve(process.cwd(), requestedTarget) : join(temporaryRoot, 'repo');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function privateAssetHashes() {
  const files = [];
  for (const path of FORBIDDEN_PUBLIC_PATHS) {
    const absolute = join(root, path);
    if (await exists(absolute)) {
      const info = await stat(absolute);
      if (info.isDirectory()) files.push(...(await walk(absolute)));
      else if (info.isFile()) files.push(absolute);
    }
  }
  const characters = join(root, 'apps/web/public/Characters');
  if (await exists(characters)) {
    for (const entry of await readdir(characters, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.png')) files.push(join(characters, entry.name));
    }
  }
  return new Set(await Promise.all(files.map(sha256)));
}

try {
  const privateHashes = await privateAssetHashes();
  if (!requestedTarget) await exportPublicTree(root, target);

  const violations = [];
  for (const path of FORBIDDEN_PUBLIC_PATHS) {
    if (await exists(join(target, path))) violations.push(path);
  }

  const characterRoot = join(target, 'apps/web/public/Characters');
  for (const path of await walk(characterRoot)) {
    const rel = relative(characterRoot, path).split(sep).join('/');
    if (!rel.startsWith('original/')) violations.push(`apps/web/public/Characters/${rel}`);
  }

  for (const required of ['LICENSE', 'LICENSE-ASSETS.md', 'THIRD_PARTY_NOTICES.md', 'README.md', 'SELF_HOSTING.md']) {
    if (!(await exists(join(target, required)))) violations.push(`missing ${required}`);
  }

  const credits = await readFile(join(target, 'CREDITS.md'), 'utf8');
  if (credits.includes("seuls les PNG nécessaires au produit sont extraits")) {
    violations.push('CREDITS.md still claims commercial PNG files are distributed');
  }

  if (privateHashes.size > 0) {
    for (const path of await walk(target)) {
      if (privateHashes.has(await sha256(path))) {
        violations.push(`commercial asset copied or renamed as ${relative(target, path)}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Public export is not safe:');
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log(`Public export check passed (${(await walk(target)).length} files).`);
  }
} finally {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}
