import crypto from 'crypto';
import { prisma } from './prisma';
import { scheduleImageGc } from '../services/imageGc';

// Inline images (chat attachments, map thumbnails) used to travel as base64 data
// URLs embedded in the JSON. That made payloads huge and — worse — uncacheable:
// a data URL can never be stored by the browser cache, so re-opening a
// conversation re-downloaded every picture. We now store the bytes once and put
// only an opaque, immutable URL in the row.

// Accepted upload formats, mirroring what the client can produce.
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

// Decoded ceiling. The client downscales before sending; this is the backstop.
export const MAX_IMAGE_BYTES = 2_600_000;
// Base64 inflates by ~4/3, plus the scheme prefix — reject before decoding so a
// multi-MB string can't be expanded into memory just to be thrown away.
const MAX_DATA_URL_CHARS = Math.ceil(MAX_IMAGE_BYTES * 1.37) + 64;

export const IMAGE_URL_PREFIX = '/api/images/';

/** True for a URL we minted (as opposed to a legacy inline data URL). */
export function isStoredImageUrl(s: string): boolean {
  return s.startsWith(IMAGE_URL_PREFIX);
}

/** Extract a valid opaque id from one of our stored URLs; legacy URLs return null. */
export function storedImageId(url: string | null | undefined): string | null {
  const value = (url ?? '').toString();
  if (!value.startsWith(IMAGE_URL_PREFIX)) return null;
  const id = value.slice(IMAGE_URL_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : null;
}

/** Decode a base64 image data URL. Null if it isn't one, is empty, or is too big. */
// Return type is left to inference: Prisma's Bytes field wants the narrower
// `Uint8Array<ArrayBuffer>`, which a bare `Uint8Array` annotation would widen.
export function parseDataUrl(input: string) {
  if (input.length > MAX_DATA_URL_CHARS) return null;
  const m = DATA_URL_RE.exec(input);
  if (!m) return null;
  // Copied into a plain Uint8Array: Prisma's Bytes field rejects Buffer's wider
  // ArrayBufferLike backing store.
  const buf = Buffer.from(m[2], 'base64');
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  return { mime: m[1], bytes };
}

/**
 * Persist a base64 data URL and return the cacheable path to serve it from.
 *
 * Returns null when the input is absent or isn't a valid image, and passes a URL
 * we already minted straight through — so re-saving a template (or copying a
 * public map) reuses the existing bytes instead of duplicating them.
 */
export async function storeDataUrl(input: string | null | undefined): Promise<string | null> {
  scheduleImageGc();
  const s = (input ?? '').toString();
  if (!s) return null;
  if (isStoredImageUrl(s)) {
    const id = storedImageId(s);
    if (!id) return null;
    // Claim the row before a new FK reference is written. Updating the cutoff
    // timestamp and the GC's guarded DELETE serialize on the same row lock.
    const claimed = await prisma.image.updateMany({ where: { id }, data: { createdAt: new Date() } });
    return claimed.count === 1 ? s : null;
  }

  const parsed = parseDataUrl(s);
  if (!parsed) return null;

  const sha256 = crypto.createHash('sha256').update(parsed.bytes).digest('hex');
  const id = crypto.randomBytes(24).toString('base64url');
  // One atomic upsert both deduplicates and claims an old orphan. If GC races,
  // PostgreSQL row locking makes either the touch or the delete win cleanly;
  // a delete winner is followed by this insert, never by a dangling URL.
  const created = await prisma.image.upsert({
      where: { sha256 },
      update: { createdAt: new Date() },
      create: { id, mime: parsed.mime, bytes: parsed.bytes, sha256, size: parsed.bytes.length },
      select: { id: true },
    }).catch(() => null);

  return created ? IMAGE_URL_PREFIX + created.id : null;
}

/**
 * Inverse of storeDataUrl: resolve a stored URL back to a base64 data URL.
 * Used only where the bytes must be self-contained (exporting a map to a file);
 * everything else should serve the URL and let the browser cache it.
 */
export async function inlineStoredImage(url: string | null | undefined): Promise<string | null> {
  const s = (url ?? '').toString();
  if (!s) return null;
  if (!isStoredImageUrl(s)) return s; // already inline (legacy row) — pass through
  const id = s.slice(IMAGE_URL_PREFIX.length);
  const img = await prisma.image.findUnique({ where: { id }, select: { mime: true, bytes: true } }).catch(() => null);
  if (!img) return null;
  return `data:${img.mime};base64,${Buffer.from(img.bytes).toString('base64')}`;
}
