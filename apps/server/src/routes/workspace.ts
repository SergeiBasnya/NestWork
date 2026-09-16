import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Server } from 'socket.io';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { workspaceInviteRateLimit } from '../middleware/rateLimit';
import {
  canAssignInvitationRole,
  canChangeMemberRole,
  canManageInvitations,
  canRemoveMember,
  createInvitationToken,
  normalizeInviteEmail,
  type WorkspaceRole,
} from '../services/workspaceInvitations';

const router: Router = Router();

// All workspace routes are protected
router.use(authMiddleware);

const MAX_PILOT_MEMBERS = 12;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const invitationSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide').max(320),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});
const memberRoleSchema = z.object({ role: z.enum(['ADMIN', 'MEMBER']) });

async function getWorkspaceAccess(slug: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      members: { where: { userId }, select: { role: true } },
    },
  });
  const membership = workspace?.members[0];
  return workspace && membership ? { workspace, role: membership.role as WorkspaceRole } : null;
}

// GET /api/workspaces — spaces available to the signed-in account.
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: req.user!.userId },
    orderBy: { joinedAt: 'asc' },
    select: {
      role: true,
      joinedAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarUrl: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  res.json({ workspaces: memberships.map(({ workspace, ...membership }) => ({ ...workspace, ...membership })) });
}));

// GET /api/workspaces/:slug/invitations — active invitations for owners/admins.
router.get('/:slug/invitations', asyncHandler(async (req: Request, res: Response) => {
  const access = await getWorkspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!canManageInvitations(access.role)) {
    res.status(403).json({ error: 'Tu ne peux pas gérer les invitations de cet espace' });
    return;
  }

  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      workspaceId: access.workspace.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { id: true, name: true } },
    },
  });

  res.json({ invitations });
}));

// POST /api/workspaces/:slug/invitations — create a single-use invitation.
router.post('/:slug/invitations', workspaceInviteRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const parsed = invitationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const access = await getWorkspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!canAssignInvitationRole(access.role, parsed.data.role)) {
    res.status(403).json({ error: 'Tu ne peux pas attribuer ce rôle' });
    return;
  }

  const email = normalizeInviteEmail(parsed.data.email);
  const now = new Date();
  const [existingMember, memberCount, activeInvitationCount] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: { workspaceId: access.workspace.id, user: { email } },
      select: { id: true },
    }),
    prisma.workspaceMember.count({ where: { workspaceId: access.workspace.id } }),
    prisma.workspaceInvitation.count({
      where: {
        workspaceId: access.workspace.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);

  if (existingMember) {
    res.status(409).json({ error: 'Cette personne fait déjà partie de l’espace' });
    return;
  }
  if (memberCount + activeInvitationCount >= MAX_PILOT_MEMBERS) {
    res.status(409).json({ error: `Le pilote est limité à ${MAX_PILOT_MEMBERS} membres et invitations actives` });
    return;
  }

  const { token, tokenHash } = createInvitationToken();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.updateMany({
      where: {
        workspaceId: access.workspace.id,
        email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    return tx.workspaceInvitation.create({
      data: {
        workspaceId: access.workspace.id,
        email,
        role: parsed.data.role,
        tokenHash,
        expiresAt,
        invitedById: req.user!.userId,
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
  });

  // The raw token is returned exactly once and is never persisted.
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ invitation: { ...invitation, token } });
}));

// DELETE /api/workspaces/:slug/invitations/:invitationId — revoke a pending invitation.
router.delete('/:slug/invitations/:invitationId', asyncHandler(async (req: Request, res: Response) => {
  const access = await getWorkspaceAccess(req.params.slug, req.user!.userId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!canManageInvitations(access.role)) {
    res.status(403).json({ error: 'Tu ne peux pas gérer les invitations de cet espace' });
    return;
  }

  const revoked = await prisma.workspaceInvitation.updateMany({
    where: {
      id: req.params.invitationId,
      workspaceId: access.workspace.id,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) {
    res.status(404).json({ error: 'Invitation not found' });
    return;
  }
  res.status(204).send();
}));

// PATCH /api/workspaces/:slug/members/:memberId — owner-only role changes.
router.patch('/:slug/members/:memberId', asyncHandler(async (req: Request, res: Response) => {
  const parsed = memberRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const actorId = req.user!.userId;
  const access = await getWorkspaceAccess(req.params.slug, actorId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const target = await prisma.workspaceMember.findFirst({
    where: { id: req.params.memberId, workspaceId: access.workspace.id },
    select: { id: true, userId: true, role: true },
  });
  if (!target) {
    res.status(404).json({ error: 'Membre introuvable' });
    return;
  }
  if (!canChangeMemberRole(
    access.role,
    target.role as WorkspaceRole,
    parsed.data.role,
    target.userId === actorId,
  )) {
    res.status(403).json({ error: 'Tu ne peux pas modifier ce rôle' });
    return;
  }

  const updated = await prisma.workspaceMember.updateMany({
    where: {
      id: target.id,
      workspaceId: access.workspace.id,
      userId: { not: actorId },
      role: { not: 'OWNER' },
      workspace: { members: { some: { userId: actorId, role: 'OWNER' } } },
    },
    data: { role: parsed.data.role },
  });
  if (updated.count !== 1) {
    res.status(403).json({ error: 'Tu ne peux plus modifier ce rôle' });
    return;
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { id: target.id },
    select: { id: true, userId: true, role: true, joinedAt: true },
  });
  const io = req.app.get('io') as Server | undefined;
  io?.to(`ws:${access.workspace.slug}`).emit('workspace:members-changed');
  res.json({ member });
}));

// DELETE /api/workspaces/:slug/members/:memberId — remove access and live sessions.
router.delete('/:slug/members/:memberId', asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user!.userId;
  const access = await getWorkspaceAccess(req.params.slug, actorId);
  if (!access) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const target = await prisma.workspaceMember.findFirst({
    where: { id: req.params.memberId, workspaceId: access.workspace.id },
    select: { id: true, userId: true, role: true },
  });
  if (!target) {
    res.status(404).json({ error: 'Membre introuvable' });
    return;
  }
  if (!canRemoveMember(access.role, target.role as WorkspaceRole, target.userId === actorId)) {
    res.status(403).json({ error: 'Tu ne peux pas retirer ce membre' });
    return;
  }

  const removed = await prisma.workspaceMember.deleteMany({
    where: {
      id: target.id,
      workspaceId: access.workspace.id,
      userId: { not: actorId },
      role: { not: 'OWNER' },
      OR: [
        {
          role: { in: ['ADMIN', 'MEMBER'] },
          workspace: { members: { some: { userId: actorId, role: 'OWNER' } } },
        },
        {
          role: 'MEMBER',
          workspace: { members: { some: { userId: actorId, role: 'ADMIN' } } },
        },
      ],
    },
  });
  if (removed.count !== 1) {
    res.status(403).json({ error: 'Tu ne peux plus retirer ce membre' });
    return;
  }

  // Membership was the authorization source for every future request. Existing
  // sockets must also be severed now, otherwise their in-memory workspace state
  // would stay usable until token expiry or a manual reconnect.
  const io = req.app.get('io') as Server | undefined;
  if (io) {
    const sockets = await io.in(`user:${target.userId}`).fetchSockets();
    for (const socket of sockets) {
      if (socket.data.workspaceSlug !== access.workspace.slug) continue;
      socket.emit('workspace:access-revoked');
      socket.disconnect(true);
    }
    io.to(`ws:${access.workspace.slug}`).emit('workspace:members-changed');
  }

  res.status(204).send();
}));

// GET /api/workspaces/:slug — Workspace details (members + rooms)
router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true, status: true } },
        },
      },
      rooms: true,
    },
  });

  // Uniform 404 for both "missing" and "not a member" — don't reveal which
  // workspaces exist to non-members (multi-tenant info leak).
  if (!workspace || !workspace.members.some((m) => m.userId === userId)) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  res.json({ workspace });
}));

export default router;
