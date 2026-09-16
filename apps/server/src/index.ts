import dotenv from 'dotenv';
dotenv.config();

// Fail fast on misconfigured secrets rather than signing tokens with undefined.
function validateEnv() {
  const a = process.env.JWT_SECRET;
  const b = process.env.JWT_REFRESH_SECRET;
  if (!a || !b) {
    console.error('[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must be set');
    process.exit(1);
  }
  if (a === b) {
    console.error('[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must differ');
    process.exit(1);
  }
  if (a.length < 32 || b.length < 32) {
    const msg = '[WARN] JWT secrets should be ≥ 32 chars';
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] JWT secrets must be ≥ 32 chars in production');
      process.exit(1);
    }
    console.warn(msg);
  }

  if (process.env.NODE_ENV !== 'production') return;

  if (!process.env.DATABASE_URL) {
    console.error('[FATAL] DATABASE_URL must be set in production');
    process.exit(1);
  }

  const origins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    console.error('[FATAL] CLIENT_ORIGIN must contain at least one HTTPS origin in production');
    process.exit(1);
  }

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new Error();
    } catch {
      console.error(`[FATAL] CLIENT_ORIGIN contains an invalid production origin: ${origin}`);
      process.exit(1);
    }
  }

  const cookieSameSite = process.env.REFRESH_COOKIE_SAME_SITE?.toLowerCase();
  if (cookieSameSite && !['lax', 'strict', 'none'].includes(cookieSameSite)) {
    console.error('[FATAL] REFRESH_COOKIE_SAME_SITE must be lax, strict or none');
    process.exit(1);
  }
}
validateEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import type { HealthResponse, ReadinessResponse } from '@nestwork/shared';
import authRouter from './routes/auth';
import workspaceRouter from './routes/workspace';
import furnitureRouter from './routes/furniture';
import channelsRouter from './routes/channels';
import mapsRouter from './routes/maps';
import rtcRouter from './routes/rtc';
import imagesRouter from './routes/images';
import assetsRouter from './routes/assets';
import { setupSpaceHandler } from './socket/spaceHandler';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { prisma } from './lib/prisma';

const app = express();
const httpServer = createServer(app);

// Behind Render's proxy: trust 1 hop so rate-limit sees the real client IP.
app.set('trust proxy', 1);

// Allowed web origins (comma-separated; e.g. prod + Vercel preview URLs).
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Allow requests with no Origin (curl/health) and any whitelisted origin.
const corsOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
  cb(new Error('Not allowed by CORS'));
};

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'], credentials: true },
  // Allow inline chat images (base64 data URLs) — default is 1MB.
  maxHttpBufferSize: 5e6,
});

// Expose io so REST routes can broadcast (e.g. channel:created)
app.set('io', io);

// Middleware
app.use(helmet()); // HSTS, nosniff, frameguard, etc. (API serves JSON)
app.use(cors({ origin: corsOrigin, credentials: true }));
// gzip/brotli every JSON response. Message history and member lists are highly
// repetitive text, so this is a large win for a few bytes of config. Already
// -compressed payloads (the image route below) are skipped automatically by
// compression's content-type filter.
app.use(compression());

// Inline images, served from an opaque URL with bounded browser caching. Mounted
// before the JSON body parsers — it takes no body —
// and intentionally without auth (see routes/images.ts for why that's safe).
app.use('/api/images', imagesRouter);

// Everything else is per-user data that must never be served stale. `no-cache`
// still lets the browser *store* the response and revalidate it, so a repeat
// request costs a 304 with an empty body instead of the full payload — Express
// generates the ETag for us. `Vary` keeps two accounts on one browser separate.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) {
    res.setHeader('Cache-Control', 'no-store'); // tokens: never written to disk
  } else {
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('Vary', 'Authorization, Origin');
  }
  next();
});

// Map templates carry a thumbnail + a full decor snapshot, so they need a larger
// body than the rest of the API. Mounted with its own parser BEFORE the global
// 256kb one (which then stays tight for every other route).
app.use('/api/maps', express.json({ limit: '2mb' }), mapsRouter);
// Workspace asset images are uploaded as base64 JSON. Each decoded file is
// capped at 2.6 MB by the route; 4 MB accounts for base64 expansion.
app.use('/api/assets', express.json({ limit: '4mb' }), assetsRouter);

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser()); // reads the HttpOnly refresh-token cookie on /api/auth/*

// Health check
app.get('/health', (_req, res) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: Date.now(),
  };
  res.json(response);
});

// Readiness includes the critical persistence dependency. Platforms should use
// this endpoint before routing traffic to a freshly deployed instance.
app.get('/ready', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await prisma.$queryRaw`SELECT 1`;
    const response: ReadinessResponse = {
      status: 'ready',
      timestamp: Date.now(),
      checks: { database: 'ok' },
    };
    res.json(response);
  } catch {
    const response: ReadinessResponse = {
      status: 'unavailable',
      timestamp: Date.now(),
      checks: { database: 'unavailable' },
    };
    res.status(503).json(response);
  }
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/furniture', furnitureRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/rtc', rtcRouter);

// Keep these last: unmatched requests become JSON 404s and every error passed
// by a route (including rejected async handlers) receives one safe response.
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.io handlers
setupSpaceHandler(io);

// Start server — bind 0.0.0.0 so the platform (Render) can detect the open port.
const configuredPort = Number(process.env.PORT);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`[NestWork Server] Listening on 0.0.0.0:${boundPort}`);
  console.log(`[NestWork Server] Health: /health`);
});

// Exit cleanly on platform shutdown/restart (avoids a non-zero exit being read
// as a crash, which can trigger redeploy loops).
const shutdown = () => httpServer.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
