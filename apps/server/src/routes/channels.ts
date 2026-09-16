import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { channelCreateRateLimit } from '../middleware/rateLimit';
import { resolveChannelAccess, findOrCreateDm } from '../lib/channelAccess';
import { asyncHandler } from '../middleware/errors';
import { loadUnreadCounts } from '../services/unreadCounts';

const router: Router = Router();

router.use(authMiddleware);

// ─── Validation ──────────────────────────────────────────

const createChannelSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

const openDmSchema = z.object({
  userId: z.string().min(1),
});

// ─── Helpers ─────────────────────────────────────────────

const userSelect = { id: true, name: true, avatarUrl: true } as const;
const lastMessageInclude = {
  messages: { take: 1, orderBy: { createdAt: 'desc' as const }, include: { user: { select: userSelect } } },
};

async function getWorkspaceWithMembers(slug: string) {
  return prisma.workspace.findUnique({ where: { slug }, include: { members: true } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLastMessage(channel: { messages: any[] }) {
  const m = channel.messages[0];
  return m ? { id: m.id, body: m.body, createdAt: m.createdAt, user: m.user } : null;
}

// ─── Routes ──────────────────────────────────────────────

// GET /api/channels/:slug — public channels of the workspace + the caller's DMs
router.get('/:slug', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const workspace = await getWorkspaceWithMembers(slug);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!workspace.members.some((m) => m.userId === userId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const [channels, dms] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId: workspace.id, type: 'CHANNEL' },
      include: lastMessageInclude,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.channel.findMany({
      where: { workspaceId: workspace.id, type: 'DM', members: { some: { userId } } },
      include: { members: { include: { user: { select: userSelect } } }, ...lastMessageInclude },
    }),
  ]);

  // Unread = messages from others created after the caller's read cursor.
  const ids = [...channels, ...dms].map((c) => c.id);
  const { unread, mentions } = await loadUnreadCounts(userId, ids, channels.map((channel) => channel.id));

  res.json({
    channels: channels.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      createdAt: c.createdAt,
      lastMessage: toLastMessage(c),
      unread: unread.get(c.id) ?? 0,
      unreadMentions: mentions.get(c.id) ?? 0,
    })),
    dms: dms.map((c) => ({
      id: c.id,
      type: c.type,
      otherUser: c.members.find((m) => m.userId !== userId)?.user ?? null,
      lastMessage: toLastMessage(c),
      unread: unread.get(c.id) ?? 0,
    })),
  });
}));

// POST /api/channels/:slug/channels — intentional team co-creation: any member
// can create a public channel (rate-limited above).
router.post('/:slug/channels', channelCreateRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const parsed = createChannelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const workspace = await getWorkspaceWithMembers(slug);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!workspace.members.some((m) => m.userId === userId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const channel = await prisma.channel.create({
    data: { workspaceId: workspace.id, type: 'CHANNEL', name: parsed.data.name, createdBy: userId },
  });

  const dto = { id: channel.id, type: channel.type, name: channel.name, createdAt: channel.createdAt, lastMessage: null };

  // Tell other connected members so their channel list updates live.
  const io = req.app.get('io') as Server | undefined;
  io?.to(`ws:${slug}`).emit('channel:created', { channel: dto });

  res.status(201).json({ channel: dto });
}));

// POST /api/channels/:slug/dm — find or create a 1-to-1 DM with a co-member
router.post('/:slug/dm', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug } = req.params;

  const parsed = openDmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const otherId = parsed.data.userId;
  if (otherId === userId) {
    res.status(400).json({ error: 'On ne peut pas se DM soi-même' });
    return;
  }

  const workspace = await getWorkspaceWithMembers(slug);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!workspace.members.some((m) => m.userId === userId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (!workspace.members.some((m) => m.userId === otherId)) {
    res.status(400).json({ error: "Cet utilisateur n'est pas membre de l'espace" });
    return;
  }

  const channel = await findOrCreateDm(workspace.id, userId, otherId);
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: userSelect });

  res.status(201).json({ channel: { id: channel.id, type: channel.type, otherUser: other, lastMessage: null } });
}));

// GET /api/channels/:slug/channels/:channelId/messages?before=<id>&limit=<n>
router.get('/:slug/channels/:channelId/messages', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { slug, channelId } = req.params;

  const access = await resolveChannelAccess(channelId, userId);
  if (!access || access.slug !== slug) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;

  const rows = await prisma.message
    .findMany({
      where: { channelId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: { user: { select: userSelect }, reactions: { select: { emoji: true, userId: true } } },
    })
    .catch(() => null);

  if (rows === null) {
    res.status(400).json({ error: 'Invalid cursor' });
    return;
  }

  // Returned newest-first from the DB; client wants oldest-first for display.
  res.json({ messages: rows.reverse(), hasMore: rows.length === limit });
}));

export default router;
