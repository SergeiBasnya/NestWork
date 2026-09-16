import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createServer, type Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { setupSpaceHandler } from '../src/socket/spaceHandler';

const JWT_SECRET = 'socket-integration-secret-at-least-32-characters';

interface Harness {
  http: HttpServer;
  io: Server;
  url: string;
  clients: Set<ClientSocket>;
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 1_500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, onEvent);
  });
}

async function waitUntil(condition: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for server state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function token(userId: string): string {
  return jwt.sign({ userId, email: `${userId}@example.test` }, JWT_SECRET, { expiresIn: '5m' });
}

function client(harness: Harness, authToken: string): ClientSocket {
  const socket = createClient(harness.url, {
    auth: { token: authToken },
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  harness.clients.add(socket);
  return socket;
}

async function connect(socket: ClientSocket): Promise<void> {
  const connected = waitForEvent<void>(socket, 'connect');
  socket.connect();
  await connected;
}

function emitWithAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} ack`)), 1_500);
    socket.emit(event, payload, (result: T) => { clearTimeout(timer); resolve(result); });
  });
}

describe('Socket.IO transport integration', () => {
  let harness: Harness;

  before(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    const http = createServer();
    const io = new Server(http, { transports: ['websocket'] });
    setupSpaceHandler(io);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Ephemeral server has no TCP address');
    harness = { http, io, url: `http://127.0.0.1:${address.port}`, clients: new Set() };
  });

  after(async () => {
    for (const socket of harness.clients) socket.disconnect();
    await new Promise<void>((resolve) => harness.io.close(() => resolve()));
  });

  test('accepts a valid JWT and rejects an invalid one at the handshake', async () => {
    const valid = client(harness, token('transport-auth-valid'));
    await connect(valid);
    assert.equal(valid.connected, true);
    valid.disconnect();

    const invalid = client(harness, 'not-a-jwt');
    const error = waitForEvent<Error>(invalid, 'connect_error');
    invalid.connect();
    assert.match((await error).message, /Invalid token/);
    assert.equal(invalid.connected, false);
  });

  test('caps one user at four sockets and releases the slot on disconnect', async () => {
    const authToken = token('transport-cap-user');
    const accepted = Array.from({ length: 4 }, () => client(harness, authToken));
    await Promise.all(accepted.map(connect));

    const rejected = client(harness, authToken);
    const rejection = waitForEvent<{ error: string }>(rejected, 'space:error');
    rejected.connect();
    assert.match((await rejection).error, /Trop de connexions actives/);
    await waitUntil(() => harness.io.of('/').sockets.size === 4);

    accepted[0].disconnect();
    await waitUntil(() => harness.io.of('/').sockets.size === 3);
    const replacement = client(harness, authToken);
    await connect(replacement);
    assert.equal(replacement.connected, true);

    [...accepted.slice(1), replacement].forEach((socket) => socket.disconnect());
  });

  test('returns explicit negative acknowledgements for DB commands before join', async () => {
    const socket = client(harness, token('transport-prejoin-user'));
    await connect(socket);
    const furniture = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'furniture:remove', { id: 'furniture-1' });
    const map = await emitWithAck<{ ok: boolean; error?: string }>(socket, 'map:apply', { templateId: 'map-1' });
    assert.deepEqual(furniture, { ok: false, error: 'Invalid furniture command' });
    assert.deepEqual(map, { ok: false, error: 'Connexion à l’espace introuvable.' });
    socket.disconnect();
  });

  test('ignores a malformed room change without breaking the connection', async () => {
    const socket = client(harness, token('transport-room-change-user'));
    await connect(socket);
    socket.emit('space:room-change', undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(socket.connected, true);
    socket.disconnect();
  });

  test('shares a command quota across two sockets of the same user', async () => {
    const authToken = token('transport-shared-quota-user');
    const first = client(harness, authToken);
    const second = client(harness, authToken);
    await Promise.all([connect(first), connect(second)]);

    const results = [];
    for (let index = 0; index < 3; index += 1) {
      results.push(await emitWithAck<{ ok: boolean; error?: string }>(first, 'map:apply', { templateId: `map-a-${index}` }));
    }
    for (let index = 0; index < 2; index += 1) {
      results.push(await emitWithAck<{ ok: boolean; error?: string }>(second, 'map:apply', { templateId: `map-b-${index}` }));
    }
    assert.equal(results.every((result) => result.error === 'Connexion à l’espace introuvable.'), true);
    const limited = await emitWithAck<{ ok: boolean; error?: string }>(second, 'map:apply', { templateId: 'map-over-limit' });
    assert.match(limited.error ?? '', /Trop de cartes appliquées/);
    first.disconnect();
    second.disconnect();
  });
});
