import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportPublicTree } from './lib/public-export.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedTarget = process.argv.slice(2).find((argument) => argument !== '--');

if (!requestedTarget) {
  console.error('Usage: pnpm public:export -- /absolute/path/to/empty/NestWork-public');
  process.exit(1);
}

const target = resolve(process.cwd(), requestedTarget);
await exportPublicTree(root, target);

console.log(`Public-safe tree exported to ${target}`);
console.log('Review it, then create a fresh Git history in that directory.');
