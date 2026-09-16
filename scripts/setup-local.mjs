import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFiles = [
  ['apps/server/.env.example', 'apps/server/.env'],
  ['apps/web/.env.local.example', 'apps/web/.env.local'],
];

for (const [example, destination] of envFiles) {
  const from = resolve(root, example);
  const to = resolve(root, destination);
  if (existsSync(to)) {
    console.log(`keep ${destination} (already exists)`);
  } else {
    copyFileSync(from, to);
    console.log(`create ${destination}`);
  }
}

if (process.argv.includes('--env-only')) {
  console.log('Environment files are ready. Database setup was skipped.');
  process.exit(0);
}

function run(command, args, failureHelp) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    if (failureHelp) console.error(`\n${failureHelp}`);
    process.exit(result.status ?? 1);
  }
}

if (!process.argv.includes('--skip-docker')) {
  run(
    'docker',
    ['compose', 'up', '-d', '--wait', 'postgres'],
    'Docker Compose is required for the automatic setup. Install Docker, or start PostgreSQL manually and rerun with --skip-docker.',
  );
  console.log('PostgreSQL is ready.');
}

run('pnpm', ['--filter', '@nestwork/server', 'db:deploy']);
run('pnpm', ['--filter', '@nestwork/server', 'db:seed']);

console.log('\nNestWork is ready. Run: pnpm dev');
console.log('Development accounts are listed in apps/server/.env.');
