import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Bound the pool explicitly: Neon (free) caps connections, and a single Render
// instance shouldn't open the pg default of 10. Tune via DB_POOL_MAX if needed.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 5,
  // Keep readiness checks below the hosting platform's HTTP probe timeout.
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 3_000,
  idleTimeoutMillis: 30_000,
  // Keep idle TCP sockets warm so NAT/idle timeouts don't silently drop pooled
  // connections (a frequent source of Neon "Connection terminated" blips).
  keepAlive: true,
});
const adapter = new PrismaPg(pool);

// Neon (serverless) drops idle connections and cold-starts, so pooled clients
// die under us ("Connection terminated unexpectedly"). node-postgres surfaces
// this as an 'error' event ON THE POOL — and per its docs, a pool that emits
// 'error' with NO listener makes Node throw an uncaught exception and crash the
// whole process (Render then restarts it, dropping every socket + HTTP request
// for a few seconds — this is what made the chat/history briefly "stop working").
// Swallow + log instead: pg discards the dead client and opens a fresh one on the
// next query, so the blip costs one request, not the server.
pool.on('error', (err) => {
  console.error('[db] idle pool client error (recovered):', err.message);
});

export const prisma = new PrismaClient({ adapter });
