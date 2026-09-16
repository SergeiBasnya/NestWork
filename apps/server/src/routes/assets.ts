import { Router, type Request, type Response } from 'express';
import type { Server } from 'socket.io';
import type { WorkspaceAssetDTO } from '@nestwork/shared';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { parseDataUrl, storedImageId, storeDataUrl } from '../lib/images';
import { scheduleImageGc } from '../services/imageGc';
import {
  hasSupportedWorkspaceAssetSignature,
  workspaceAssetCreateSchema,
  workspaceAssetIdsInSnapshot,
} from '../services/workspaceAssets';

const router: Router = Router();
router.use(authMiddleware);

const MAX_ASSETS_PER_WORKSPACE = 100;
const MAX_ASSET_BYTES_PER_WORKSPACE = 50 * 1024 * 1024;

const ASSET_SELECT = {
  id: true,
  name: true,
  source: true,
  kind: true,
  cols: true,
  rows: true,
  depth: true,
  createdAt: true,
} as const;

async function workspaceAccess(slug: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      members: { where: { userId }, select: { role: true } },
    },
  });
  const role = workspace?.members[0]?.role;
  return workspace && role ? { id: workspace.id, role } : null;
}

function canManage(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

function toDto(slug: string, asset: {
  id: string;
  name: string;
  source: WorkspaceAssetDTO['source'];
  kind: WorkspaceAssetDTO['kind'];
  cols: number;
  rows: number;
  depth: number;
  createdAt: Date;
}): WorkspaceAssetDTO {
  return {
    ...asset,
    fileUrl: `/assets/${encodeURIComponent(slug)}/${asset.id}/file`,
    createdAt: asset.createdAt.toISOString(),
  };
}

function notifyLibraryChanged(req: Request, slug: string): void {
  const io = req.app.get('io') as Server | undefined;
  io?.to(`ws:${slug}`).emit('assets:changed');
}

router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const access = await workspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const assets = await prisma.workspaceAsset.findMany({
    where: { workspaceId: access.id },
    orderBy: { createdAt: 'asc' },
    select: ASSET_SELECT,
  });
  res.json({ assets: assets.map((asset) => toDto(req.params.slug, asset)) });
}));

router.get('/:slug/:assetId/file', asyncHandler(async (req: Request, res: Response) => {
  const access = await workspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).end();
    return;
  }
  const asset = await prisma.workspaceAsset.findFirst({
    where: { id: req.params.assetId, workspaceId: access.id },
    select: { id: true, image: { select: { mime: true, bytes: true } } },
  });
  if (!asset) {
    res.status(404).end();
    return;
  }
  // Never expose the backing Image id: /api/images treats that id as a public
  // capability for chat thumbnails. Workspace assets stay on this authenticated
  // route even when a member inspects response headers.
  const etag = `"workspace-asset-${asset.id}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Vary', 'Authorization, Origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.type(asset.image.mime);
  res.send(Buffer.from(asset.image.bytes));
}));

router.post('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const access = await workspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!canManage(access.role)) {
    res.status(403).json({ error: 'Only workspace owners and admins can import assets' });
    return;
  }
  const parsed = workspaceAssetCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const image = parseDataUrl(parsed.data.dataUrl);
  if (!image || !hasSupportedWorkspaceAssetSignature(image.mime, image.bytes)) {
    res.status(400).json({ error: 'Only valid PNG and WebP images are accepted' });
    return;
  }
  const existing = await prisma.workspaceAsset.findMany({
    where: { workspaceId: access.id },
    select: { image: { select: { size: true } } },
  });
  const storedBytes = existing.reduce((sum, asset) => sum + asset.image.size, 0);
  if (existing.length >= MAX_ASSETS_PER_WORKSPACE || storedBytes + image.bytes.length > MAX_ASSET_BYTES_PER_WORKSPACE) {
    res.status(413).json({ error: 'Workspace asset quota exceeded' });
    return;
  }
  const storedUrl = await storeDataUrl(parsed.data.dataUrl);
  const imageId = storedImageId(storedUrl);
  if (!storedUrl || !imageId) {
    res.status(400).json({ error: 'Image could not be stored' });
    return;
  }
  const asset = await prisma.workspaceAsset.create({
    data: {
      workspaceId: access.id,
      createdBy: req.user!.userId,
      imageId,
      name: parsed.data.name,
      source: parsed.data.source,
      kind: parsed.data.kind,
      cols: parsed.data.cols,
      rows: parsed.data.rows,
      depth: parsed.data.depth,
      licenseConfirmedAt: parsed.data.source === 'MODERN_INTERIORS' ? new Date() : null,
    },
    select: ASSET_SELECT,
  });
  notifyLibraryChanged(req, req.params.slug);
  res.status(201).json({ asset: toDto(req.params.slug, asset) });
}));

router.delete('/:slug/:assetId', asyncHandler(async (req: Request, res: Response) => {
  const access = await workspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!canManage(access.role)) {
    res.status(403).json({ error: 'Only workspace owners and admins can remove assets' });
    return;
  }
  const asset = await prisma.workspaceAsset.findFirst({
    where: { id: req.params.assetId, workspaceId: access.id },
    select: { id: true },
  });
  if (!asset) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  const prefix = `wa:${asset.id}_`;
  const [placedCount, templates] = await Promise.all([
    prisma.furniture.count({ where: { room: { workspaceId: access.id }, catalogId: { startsWith: prefix } } }),
    prisma.mapTemplate.findMany({ where: { workspaceId: access.id }, select: { data: true } }),
  ]);
  const usedByTemplate = templates.some((template) => workspaceAssetIdsInSnapshot(template.data).has(asset.id));
  if (placedCount > 0 || usedByTemplate) {
    res.status(409).json({ error: 'Asset is still used by furniture or a saved map' });
    return;
  }
  await prisma.workspaceAsset.delete({ where: { id: asset.id } });
  scheduleImageGc();
  notifyLibraryChanged(req, req.params.slug);
  res.json({ message: 'Asset removed' });
}));

export default router;
