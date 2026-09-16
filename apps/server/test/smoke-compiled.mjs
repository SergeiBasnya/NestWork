import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await access(path.resolve(serverDir, '../../packages/shared/dist/index.js'));
await access(path.resolve(serverDir, 'dist/index.js'));

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: '0',
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://smoke:smoke@127.0.0.1:9/smoke',
    DB_CONNECT_TIMEOUT_MS: '100',
    JWT_SECRET: 'smoke-access-secret-at-least-32-characters',
    JWT_REFRESH_SECRET: 'smoke-refresh-secret-at-least-32-characters-different',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const waitForExit = () => child.exitCode !== null || child.signalCode !== null
  ? Promise.resolve()
  : new Promise((resolve) => child.once('exit', resolve));

let output = '';
const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
try {
  const port = await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Listening on 0\.0\.0\.0:(\d+)/);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('exit', (code) => reject(new Error(`Compiled server exited early (${code}): ${output}`)));
  });
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ok');

  const readinessResponse = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(readinessResponse.status, 503);
  const readinessBody = await readinessResponse.json();
  assert.equal(readinessBody.status, 'unavailable');
  assert.equal(readinessBody.checks.database, 'unavailable');
} finally {
  clearTimeout(timeout);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await waitForExit();
}
