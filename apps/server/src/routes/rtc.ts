import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

const router: Router = Router();
router.use(authMiddleware);

// STUN alone lets two peers discover their public address and try a *direct*
// connection — free and enough on friendly networks. TURN is a media *relay*
// for when a direct path is impossible (symmetric NAT, corporate firewall, some
// mobile networks): the call falls back to routing through it. Without TURN
// those peers get no audio/video at all, so we hand the client both.
const STUN_FALLBACK = [{ urls: 'stun:stun.l.google.com:19302' }];

// Cloudflare mints TURN credentials on demand, valid for TTL seconds. We cache
// the minted set server-side and reuse it until shortly before it expires — a
// handful of users sharing one short-lived credential is fine and keeps us well
// under Cloudflare's API limits. The secret API token never leaves the server.
const TTL = 86400; // 24h
let cache: { iceServers: unknown[]; expiry: number } | null = null;
// Shared in-flight mint: on a cold cache (server start, post-expiry, Render free
// dyno wake) a burst of clients would each fire their own Cloudflare POST. Share
// one promise so concurrent misses collapse into a single API call — keeping us
// well under Cloudflare's limits, which is the whole reason we cache.
let inflight: Promise<unknown[] | null> | null = null;

async function mintCloudflareIce(): Promise<unknown[] | null> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return null; // TURN not configured → STUN-only
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL }),
    // Bound the call: a hung Cloudflare request would otherwise leave the client's
    // GET /ice pending for minutes. On timeout the catch below serves STUN-only.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
  const data = (await res.json()) as { iceServers?: unknown };
  if (!data.iceServers) throw new Error('Cloudflare TURN returned no iceServers');
  // Cloudflare returns a single iceServers object (its own STUN + TURN); pair it
  // with Google STUN as a redundant fallback.
  return [data.iceServers, ...STUN_FALLBACK];
}

// GET /api/rtc/ice — ICE servers (STUN + Cloudflare TURN) for the WebRTC peer
// connection. Always succeeds: on missing config or a Cloudflare error it serves
// STUN-only so calls still work on friendly networks (just no relay fallback).
router.get('/ice', asyncHandler(async (_req: Request, res: Response) => {
  try {
    if (cache && Date.now() < cache.expiry) {
      res.json({ iceServers: cache.iceServers, ttl: Math.round((cache.expiry - Date.now()) / 1000) });
      return;
    }
    if (!inflight) inflight = mintCloudflareIce().finally(() => { inflight = null; });
    const iceServers = await inflight;
    if (iceServers) {
      // Refresh an hour before the credentials actually expire.
      cache = { iceServers, expiry: Date.now() + (TTL - 3600) * 1000 };
      res.json({ iceServers, ttl: TTL - 3600 });
      return;
    }
    res.json({ iceServers: STUN_FALLBACK, ttl: 3600 });
  } catch (e) {
    console.warn('[rtc] TURN unavailable, serving STUN only:', (e as Error).message);
    res.json({ iceServers: STUN_FALLBACK, ttl: 300 });
  }
}));

export default router;
