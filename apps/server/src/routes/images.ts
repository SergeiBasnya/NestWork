import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/errors';

const router: Router = Router();

// GET /api/images/:id — serve a stored inline image (chat attachment, map thumb).
//
// Deliberately NOT behind authMiddleware: an <img src> can't carry a Bearer
// token, and gating on a cookie would defeat the browser cache, which is the
// entire point of this route. Instead the id is 24 random bytes (see
// lib/images.ts) — the URL *is* the capability, and it only ever reaches someone
// who can already read the message or template carrying it.
//
// Bytes are immutable for a given id, but orphan collection can revoke the URL.
// A one-hour freshness window limits how long a deleted capability remains hot.

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const IMAGE_MAX_AGE = 3_600;

function setCacheHeaders(res: Response, etag: string) {
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE}`);
  // helmet defaults Cross-Origin-Resource-Policy to same-origin. The web app is
  // on a different origin than this API (Vercel ↔ Render), so without this the
  // browser would fetch the image and then refuse to render it.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) {
    res.status(404).end();
    return;
  }

  // The id is a content validator, but GC can revoke it. A conditional request
  // therefore verifies that the row still exists before returning 304.
  const etag = `"${id}"`;
  if (req.headers['if-none-match'] === etag) {
    const exists = await prisma.image.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
    if (!exists) {
      res.status(404).end();
      return;
    }
    setCacheHeaders(res, etag);
    res.status(304).end();
    return;
  }

  const image = await prisma.image
    .findUnique({ where: { id }, select: { mime: true, bytes: true } })
    .catch(() => null);
  if (!image) {
    res.status(404).end();
    return;
  }

  setCacheHeaders(res, etag);
  res.type(image.mime);
  res.send(Buffer.from(image.bytes));
}));

export default router;
