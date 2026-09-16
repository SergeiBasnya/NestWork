import { api } from './api';

// STUN-only fallback: used until the server responds, and if the request fails
// or TURN isn't configured. Direct connections still work on friendly networks.
const STUN_ONLY: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// The server mints short-lived TURN credentials; cache them client-side and
// refresh a little before they expire so a long session keeps a working relay.
let cache: { servers: RTCIceServer[]; expiry: number } | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cache && Date.now() < cache.expiry) return cache.servers;
  try {
    // Hard timeout: the peer connection waits on this before it can offer/answer,
    // so a slow /rtc/ice (cold serverless start, Cloudflare latency) would stall
    // the whole call. Bound it and fall back to STUN — a direct connection still
    // works on friendly networks, and the peer is ready in seconds either way.
    const { data } = await api.get<{ iceServers: RTCIceServer[]; ttl: number }>('/rtc/ice', { timeout: 4000 });
    if (Array.isArray(data.iceServers) && data.iceServers.length) {
      cache = { servers: data.iceServers, expiry: Date.now() + (data.ttl ?? 3600) * 1000 * 0.9 };
      return cache.servers;
    }
  } catch {
    /* offline / unauthorized / server down / timeout — fall back to STUN */
  }
  return STUN_ONLY;
}
