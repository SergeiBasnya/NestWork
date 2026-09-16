import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { storeDataUrl, inlineStoredImage, storedImageId } from '../lib/images';
import { asyncHandler } from '../middleware/errors';
import { FURNITURE_DEPTH_MAX, FURNITURE_DEPTH_MIN } from '@nestwork/shared';
import { mapSaveRateLimit } from '../middleware/rateLimit';
import { scheduleImageGc } from '../services/imageGc';

const router: Router = Router();

router.use(authMiddleware);

// ─── Validation ──────────────────────────────────────────
// A template snapshots a space's decorations (ids/roomIds stripped); applying it
// re-creates them. Bounds mirror the furniture socket handler.
const snapFurniture = z.object({
  catalogId: z.string().min(1).max(80),
  col: z.number().int().min(0).max(4096),
  row: z.number().int().min(0).max(4096),
  w: z.number().int().min(1).max(64),
  h: z.number().int().min(1).max(64),
  x: z.number().int(),
  y: z.number().int(),
  depth: z.number().min(FURNITURE_DEPTH_MIN).max(FURNITURE_DEPTH_MAX).default(3), // fractional: unique stacking planes
  flip: z.boolean().default(false),
});

const saveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['user', 'backup']).default('user'),
  // base64 PNG data URL as captured by the client; stored as bytes and replaced
  // by a cacheable URL before it ever reaches the row (see lib/images.ts).
  preview: z.string().max(800_000).nullable().optional(),
  data: z.object({
    furniture: z.array(snapFurniture).max(5000),
  }),
});
const visibilitySchema = z.object({ isPublic: z.boolean() });

// ─── Helpers ─────────────────────────────────────────────

async function getWorkspace(slug: string) {
  return prisma.workspace.findUnique({ where: { slug }, include: { members: true } });
}

// A lightweight DTO — never ship the (potentially large) `data` blob in lists.
function toListItem(t: { id: string; name: string; kind: string; isPublic: boolean; preview: string | null; createdBy: string; createdAt: Date }) {
  return { id: t.id, name: t.name, kind: t.kind, isPublic: t.isPublic, preview: t.preview, createdBy: t.createdBy, createdAt: t.createdAt };
}

const LIST_SELECT = { id: true, name: true, kind: true, isPublic: true, preview: true, createdBy: true, createdAt: true } as const;

// ─── Routes ──────────────────────────────────────────────

// GET /api/maps/public — the community gallery: every published map, any author,
// any workspace (newest first). Defined BEFORE /:slug so "public" isn't read as a
// slug. Returns author names; never returns the heavy `data` blob.
router.get('/public', asyncHandler(async (req: Request, res: Response) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit !== 0
    ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
    : 60;
  const rows = await prisma.mapTemplate.findMany({
    where: { isPublic: true, kind: 'user' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: LIST_SELECT,
  });
  // Resolve author names in one query.
  const authorIds = [...new Set(rows.map((r) => r.createdBy))];
  const users = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  // The gallery is the same for everyone and changes rarely: a short private
  // max-age spares a round-trip when the panel is reopened, without letting a
  // freshly published map stay hidden for long.
  res.setHeader('Cache-Control', 'private, max-age=30');
  res.json({
    templates: rows.map((t) => ({ ...toListItem(t), authorName: nameById.get(t.createdBy) ?? 'Anonyme' })),
  });
}));

// GET /api/maps/:slug — my saved templates for this workspace (newest first).
router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const templates = await prisma.mapTemplate.findMany({
    where: { workspaceId: workspace.id, createdBy: userId },
    orderBy: { createdAt: 'desc' },
    select: LIST_SELECT,
  });

  res.json({ templates: templates.map(toListItem) });
}));

// PATCH /api/maps/:slug/:id — publish / unpublish one of my own templates.
router.patch('/:slug/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug, id } = req.params;
  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { isPublic } = parsed.data;

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  // Only the author can change visibility, and backups are never publishable.
  const upd = await prisma.mapTemplate.updateMany({
    where: { id, workspaceId: workspace.id, createdBy: userId, kind: 'user' },
    data: { isPublic },
  });
  if (upd.count === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  res.json({ id, isPublic });
}));

// POST /api/maps/:slug/use/:id — copy a PUBLIC template into my own library
// (a private copy I can then apply/edit). Works across workspaces/authors.
router.post('/:slug/use/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug, id } = req.params;

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const src = await prisma.mapTemplate.findFirst({
    where: { id, isPublic: true, kind: 'user' },
    select: { name: true, preview: true, previewImageId: true, data: true },
  });
  if (!src) {
    res.status(404).json({ error: 'Public map not found' });
    return;
  }

  const preview = await storeDataUrl(src.preview);
  const copy = await prisma.mapTemplate.create({
    data: {
      workspaceId: workspace.id,
      createdBy: userId,
      name: src.name,
      kind: 'user',
      isPublic: false, // my private copy
      // Already a stored URL → the copy just points at the same bytes.
      preview,
      previewImageId: src.previewImageId ?? storedImageId(preview),
      data: src.data as object,
    },
    select: LIST_SELECT,
  });

  res.status(201).json({ template: toListItem(copy) });
}));

// GET /api/maps/:slug/:id — one of my templates WITH its full snapshot (for export
// to a file). The list route omits `data` for weight; this returns it.
router.get('/:slug/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug, id } = req.params;

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const t = await prisma.mapTemplate.findFirst({
    where: { id, workspaceId: workspace.id, createdBy: userId },
    select: { id: true, name: true, kind: true, preview: true, data: true, createdAt: true },
  });
  if (!t) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  // Export only: inline the thumbnail back into the payload so the downloaded
  // .json stands on its own (a /api/images/… URL would dangle on someone else's
  // instance). Every other route serves the URL and lets the browser cache it.
  res.json({ template: { ...t, preview: await inlineStoredImage(t.preview) } });
}));

// POST /api/maps/:slug — save the current decor as a template (or auto-backup).
router.post('/:slug', mapSaveRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  const preview = await storeDataUrl(parsed.data.preview);
  const t = await prisma.mapTemplate.create({
    data: {
      workspaceId: workspace.id,
      createdBy: userId,
      name: parsed.data.name,
      kind: parsed.data.kind,
      preview,
      previewImageId: storedImageId(preview),
      data: parsed.data.data,
    },
    select: LIST_SELECT,
  });

  res.status(201).json({ template: toListItem(t) });
}));

// DELETE /api/maps/:slug/:id — remove one of my own templates.
router.delete('/:slug/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug, id } = req.params;

  const workspace = await getWorkspace(slug);
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  // Scope the delete to the caller's own template in this workspace (anti-IDOR).
  const del = await prisma.mapTemplate.deleteMany({ where: { id, workspaceId: workspace.id, createdBy: userId } });
  if (del.count === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  scheduleImageGc();
  res.json({ message: 'Template deleted' });
}));

export default router;
