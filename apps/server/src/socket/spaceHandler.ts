import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { resolveChannelAccess, resolveMessageChannel, ChannelAccess } from '../lib/channelAccess';
import { storedImageId, storeDataUrl } from '../lib/images';
import type {
  FurnitureCommandAck,
  FurnitureDepthPayload,
  FurnitureMovePayload,
  FurniturePlacePayload,
  FurnitureRemovePayload,
  FurnitureTransformPayload,
  MapApplyAck,
  MapApplyPayload,
  RtcSignalPayload,
  MessageSendAck,
  MessageSendPayload,
} from '@nestwork/shared';
import { applyMap } from '../services/applyMap';
import {
  FurnitureServiceError,
  furnitureDepthSchema,
  furnitureMoveSchema,
  furniturePlaceSchema,
  furnitureRemoveSchema,
  furnitureService,
  furnitureTransformSchema,
} from '../services/furniture';
import { PresenceRegistry, proximityKey, resolveRtcTarget, type PlayerState } from '../services/presence';
import { sendAuthorizedMessage } from '../services/sendMessage';
import { SerialTaskQueue } from '../services/serialTaskQueue';
import { SOCKET_QUOTAS, UserQuotaRegistry } from '../services/socketQuotas';
import { scheduleImageGc } from '../services/imageGc';
import { isSupportedCharacter } from '../services/characterSelection';

// Allowed reaction emojis (kept small + validated server-side).
const REACTIONS = new Set(['👍', '❤️', '😄', '🎉', '🙏', '👀']);

// Author (user + select) and reactions to embed in a message payload.
const MSG_INCLUDE = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  reactions: { select: { emoji: true, userId: true } },
} as const;

// Socket rooms that should receive a channel's live events.
function channelRooms(access: ChannelAccess): string[] {
  return access.channel.type === 'DM'
    ? access.channel.members.map((m) => `user:${m.userId}`)
    : [`ws:${access.slug}`];
}

const VALID_STATUS = new Set(['ONLINE', 'BUSY', 'AWAY']);

// Socket-level presence with one stable, user-level representative per workspace.
const presence = new PresenceRegistry();

// Proximity (for audio/video). Tracks last near-state per ordered pair so we
// only emit on transitions.
// Hystérésis : on devient "proche" à AV_RADIUS_IN, mais on ne cesse de l'être
// qu'à AV_RADIUS_OUT (plus large). Sans cette marge, deux avatars posés pile à
// la frontière papillonnent near=true/false à chaque micro-déplacement (~40 Hz),
// ce qui détache/ré-attache le flux audio distant → "le son va et vient".
const AV_RADIUS_IN = 240;
const AV_RADIUS_OUT = 290;
const proximityState = new Map<string, boolean>();

// Costly Socket.IO commands share quotas across every tab/socket of one user.
// State is process-local by design; idle entries are removed opportunistically.
const userQuotas = new UserQuotaRegistry({
  maxSocketsPerUser: 4,
  idleTtlMs: 15 * 60_000,
  sweepEvery: 256,
  sweepLimit: 100,
});

// Reject NaN/Infinity/out-of-range coordinates from clients.
function clampCoord(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(-5000, Math.min(15000, n));
}

// Throttle position updates per user (avoid broadcast amplification / DoS).
const MOVE_MIN_INTERVAL_MS = 25; // ~40 Hz max
const lastMoveAt = new Map<string, number>();

const RTC_SIGNAL_MAX_BYTES = 64 * 1024;

async function persistOrLog<T>(event: string, userId: string, operation: Promise<T>): Promise<T | null> {
  try {
    return await operation;
  } catch (error) {
    console.error('[socket] persistence failed:', {
      event,
      userId,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

function recomputeProximity(io: Server, workspaceSlug: string, moverId: string) {
  const mover = presence.getPrimary(workspaceSlug, moverId);
  if (!mover) return;
  for (const other of presence.getUsers(workspaceSlug)) {
    if (other.userId === moverId) continue;
    const dx = mover.x - other.x;
    const dy = mover.y - other.y;
    const d2 = dx * dx + dy * dy;
    const key = proximityKey(workspaceSlug, moverId, other.userId);
    const wasNear = proximityState.get(key) ?? false;
    // Seuil dépendant de l'état courant (hystérésis) : il faut entrer dans
    // AV_RADIUS_IN pour devenir proche, et sortir au-delà d'AV_RADIUS_OUT pour
    // cesser de l'être.
    const radius = wasNear ? AV_RADIUS_OUT : AV_RADIUS_IN;
    // "Ne pas déranger": tant que l'un des deux a verrouillé son bureau, on ne se
    // voit jamais "proche" — la bulle visio ne se déclenche pas à l'approche.
    const near = !mover.dnd && !other.dnd && d2 <= radius * radius;
    if (proximityState.get(key) !== near) {
      proximityState.set(key, near);
      io.to(mover.socketId).emit('space:proximity', { userId: other.userId, near });
      io.to(other.socketId).emit('space:proximity', { userId: moverId, near });
    }
  }
}

function rosterFor(workspaceSlug: string) {
  return presence.getUsers(workspaceSlug).map((player) => ({
    userId: player.userId,
    name: player.name,
    x: player.x,
    y: player.y,
    direction: player.direction,
    character: player.character,
    status: player.status,
    dnd: player.dnd,
    lockX: player.lockX,
    lockY: player.lockY,
  }));
}

function isRtcSignalWithinLimit(signal: unknown): boolean {
  if (typeof signal !== 'object' || signal === null || Array.isArray(signal)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(signal), 'utf8') <= RTC_SIGNAL_MAX_BYTES;
  } catch {
    return false;
  }
}

export function setupSpaceHandler(io: Server) {
  // JWT auth middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload & { exp?: number };
      socket.data.user = payload;
      socket.data.tokenExp = payload.exp ?? 0; // unix seconds
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload;
    if (!userQuotas.registerSocket(user.userId, socket.id)) {
      socket.emit('space:error', { error: 'Trop de connexions actives pour ce compte.' });
      socket.disconnect(true);
      return;
    }
    const joinQueue = new SerialTaskQueue();
    const allowCommand = (key: keyof typeof SOCKET_QUOTAS): boolean => {
      const quota = SOCKET_QUOTAS[key];
      return userQuotas.allow(user.userId, key, quota.limit, quota.windowMs);
    };
    const rejectMutation = () => socket.emit('space:error', { error: 'Trop de requêtes, réessaie dans quelques instants.' });
    console.log(`[Socket] ${user.email} connected (${socket.id})`);

    // Personal room — used to target a user (e.g. DM delivery) wherever they are.
    socket.join(`user:${user.userId}`);

    // Enforce token expiry on the live channel: reject every event (and drop the
    // socket) once the access token has expired. The client refreshes proactively
    // via 'auth:refresh' below to keep a long session alive.
    socket.use((_packet, next) => {
      const exp = socket.data.tokenExp as number;
      if (exp && Date.now() / 1000 > exp) {
        socket.emit('auth:expired');
        socket.disconnect(true);
        return next(new Error('token expired'));
      }
      next();
    });

    // Client hands a freshly-refreshed access token to extend the session in place.
    socket.on('auth:refresh', (data: { token?: string }) => {
      if (!allowCommand('authRefresh')) return;
      try {
        const p = jwt.verify((data?.token ?? '').toString(), process.env.JWT_SECRET!) as AuthPayload & { exp?: number };
        if (p.userId === user.userId && p.exp) socket.data.tokenExp = p.exp;
      } catch {
        /* ignore bad token; session keeps its previous exp */
      }
    });

    // Join a workspace space
    socket.on('space:join', (data: { workspaceSlug?: unknown; x?: unknown; y?: unknown; direction?: unknown } | null) => {
      if (!allowCommand('join')) { rejectMutation(); return; }
      const requestedSlug = typeof data?.workspaceSlug === 'string' ? data.workspaceSlug.trim() : '';
      if (!requestedSlug || requestedSlug.length > 128) {
        socket.emit('space:error', { error: 'Espace invalide' });
        return;
      }
      let joinMutationStarted = false;
      void joinQueue.run(async () => {
      if (!socket.connected) return;
      const workspaceSlug = requestedSlug;
      const x = clampCoord(data?.x) ?? 0;
      const y = clampCoord(data?.y) ?? 0;
      const direction =
        data?.direction === 'up' || data?.direction === 'down' || data?.direction === 'left' || data?.direction === 'right'
          ? data.direction
          : 'down';

      // Verify user is a member of this workspace
      const workspace = await prisma.workspace.findUnique({
        where: { slug: workspaceSlug },
        include: { members: true },
      });

      if (!workspace || !workspace.members.some((m) => m.userId === user.userId)) {
        socket.emit('space:error', { error: 'Not a member of this workspace' });
        return;
      }

      // Get user name + chosen character
      const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
      const name = dbUser?.name || 'Unknown';
      const character = dbUser?.character ?? null;
      const status = dbUser?.status && VALID_STATUS.has(dbUser.status) ? dbUser.status : 'ONLINE';
      const dnd = dbUser?.dnd ?? false;
      if (!socket.connected) return;
      joinMutationStarted = true;

      // A socket belongs to at most one workspace. Remove a previous successful
      // join before binding the new one, so every later command is scoped to this
      // socket rather than whichever tab joined most recently for the user.
      const previousSlug = socket.data.workspaceSlug as string | undefined;
      if (previousSlug) {
        if (joinMutationStarted) removePlayer(io, socket, user.userId);
        await socket.leave(`space:${previousSlug}`);
        await socket.leave(`ws:${previousSlug}`);
      }

      // Join socket room
      const roomKey = `space:${workspaceSlug}`;
      socket.join(roomKey);
      // Dedicated messaging room (decoupled from avatar presence): receives
      // public-channel messages + channel:created for this workspace.
      socket.join(`ws:${workspaceSlug}`);

      const playerState: PlayerState = {
        userId: user.userId,
        name,
        socketId: socket.id,
        workspaceSlug,
        x,
        y,
        direction,
        roomId: null,
        character,
        status,
        dnd,
        // Reconnexion d'un bureau déjà verrouillé : la barrière se referme au point
        // de réapparition (= le bureau, puisque le spawn est la place revendiquée).
        lockX: dnd ? x : 0,
        lockY: dnd ? y : 0,
      };
      const { firstSocketForUser } = presence.join(playerState);
      socket.data.workspaceSlug = workspaceSlug;

      // Broadcast the full authoritative roster to the WHOLE room (the new player
      // included) on every join. Reliable room delivery means presence can't be
      // missed: a one-shot list sent only to the joiner is lost if their client
      // listener isn't mounted yet, and a lone 'player-joined' to others races the
      // simultaneous-join case (each peer's notice goes out before the other is in
      // the room). Re-syncing everyone on each join closes both holes — this is the
      // race that left a 1:1 call started on only one side ("on se voit une fois
      // sur deux"). The clients' space:players handlers filter out their own id.
      const roster = rosterFor(workspaceSlug);
      io.to(roomKey).emit('space:players', roster);

      // Notify others (incremental — drives the join animation/spawn position).
      if (firstSocketForUser) {
        socket.to(roomKey).emit('space:player-joined', {
          userId: user.userId,
          name,
          x,
          y,
          direction,
          character,
          status,
          dnd,
          lockX: dnd ? x : 0,
          lockY: dnd ? y : 0,
        });
        recomputeProximity(io, workspaceSlug, user.userId);
      }
      console.log(`[Space] ${name} joined ${workspaceSlug} (${roster.length} users)`);
      }).catch(async (error: unknown) => {
        // Roll back any partial room/presence binding. A failed join leaves the
        // socket unbound instead of retaining half of the requested workspace.
        if (joinMutationStarted) removePlayer(io, socket, user.userId);
        const workspaceSlug = requestedSlug;
        if (workspaceSlug) {
          await socket.leave(`space:${workspaceSlug}`);
          await socket.leave(`ws:${workspaceSlug}`);
        }
        console.error('[space] join failed:', {
          socketId: socket.id,
          userId: user.userId,
          workspaceSlug,
          error: error instanceof Error ? error.message : error,
        });
        socket.emit('space:error', { error: 'Impossible de rejoindre cet espace' });
      });
    });

    // Player movement
    socket.on('space:move', (data: { x: number; y: number; direction?: unknown }) => {
      const x = clampCoord(data?.x);
      const y = clampCoord(data?.y);
      if (x === null || y === null) return; // reject NaN/Infinity/out-of-range
      const current = presence.getSocket(socket.id);
      const direction =
        data?.direction === 'up' || data?.direction === 'down' || data?.direction === 'left' || data?.direction === 'right'
          ? data.direction
          : current?.direction ?? 'down';
      const now = Date.now();
      const positionChanged = !current || current.x !== x || current.y !== y;
      const directionChanged = !current || current.direction !== direction;
      const positionAllowed = positionChanged && now - (lastMoveAt.get(socket.id) ?? 0) >= MOVE_MIN_INTERVAL_MS;
      // A turn-in-place must survive the position throttle. If a packet arrives
      // too soon, keep the authoritative coordinates and apply only its facing.
      if (!positionAllowed && !directionChanged) return;
      const acceptedX = positionAllowed ? x : current?.x ?? x;
      const acceptedY = positionAllowed ? y : current?.y ?? y;
      if (positionAllowed) lastMoveAt.set(socket.id, now);
      const player = presence.updateSocket(socket.id, { x: acceptedX, y: acceptedY, direction });
      if (!player || !presence.isPrimary(socket.id)) return;
      socket.to(`space:${player.workspaceSlug}`).emit('space:player-moved', {
        userId: user.userId,
        x: acceptedX,
        y: acceptedY,
        direction,
      });
      if (positionAllowed) recomputeProximity(io, player.workspaceSlug, user.userId);
    });

    // Re-send the authoritative presence list to a client that asks (manual
    // refresh / recovery after a missed join/leave event).
    socket.on('space:refresh-presence', () => {
      if (!allowCommand('presenceRead')) return;
      const me = presence.getSocket(socket.id);
      if (me) socket.emit('space:players', rosterFor(me.workspaceSlug));
    });

    // "My desk": persist the player's current position as their spawn, and tell
    // everyone so they can show the 🏠 marker. desk:clear forgets it.
    const findMySlug = (): string | null => presence.getSocket(socket.id)?.workspaceSlug ?? null;

    // (Screen-share routing no longer needs a socket flag: the screen travels on
    // its own WebRTC transceiver, so peers detect it from the media itself.)
    socket.on('desk:claim', async (data: { x: number; y: number }) => {
      if (!allowCommand('desk')) { rejectMutation(); return; }
      const x = clampCoord(data?.x);
      const y = clampCoord(data?.y);
      if (x === null || y === null) return;
      const slug = findMySlug();
      if (!slug) return;
      const ws = await persistOrLog('desk:claim:workspace', user.userId, prisma.workspace.findUnique({ where: { slug }, select: { id: true } }));
      if (!ws) return;
      const saved = await persistOrLog('desk:claim', user.userId, prisma.workspaceMember
        .update({ where: { userId_workspaceId: { userId: user.userId, workspaceId: ws.id } }, data: { deskX: Math.round(x), deskY: Math.round(y) } }));
      if (!saved) return;
      io.to(`space:${slug}`).emit('space:desk', { userId: user.userId, x: Math.round(x), y: Math.round(y) });
    });
    socket.on('desk:clear', async () => {
      if (!allowCommand('desk')) { rejectMutation(); return; }
      const slug = findMySlug();
      if (!slug) return;
      const ws = await persistOrLog('desk:clear:workspace', user.userId, prisma.workspace.findUnique({ where: { slug }, select: { id: true } }));
      if (!ws) return;
      const saved = await persistOrLog('desk:clear', user.userId, prisma.workspaceMember
        .update({ where: { userId_workspaceId: { userId: user.userId, workspaceId: ws.id } }, data: { deskX: null, deskY: null } }));
      if (!saved) return;
      io.to(`space:${slug}`).emit('space:desk', { userId: user.userId, x: null, y: null });
    });

    // Room change (for proximity features)
    socket.on('space:room-change', (data: { roomId?: unknown } | null | undefined) => {
      if (!allowCommand('roomChange')) return;
      if (data?.roomId !== null && typeof data?.roomId !== 'string') return;
      presence.updateSocket(socket.id, { roomId: data.roomId });
    });

    // ─── WebRTC signaling relay (P2P audio/video) ──────────
    socket.on('rtc:signal', (data: RtcSignalPayload) => {
      if (!allowCommand('rtc') || !isRtcSignalWithinLimit(data?.signal)) return;
      const target = resolveRtcTarget(presence, proximityState, socket.id, (data?.to ?? '').toString());
      if (!target) return;
      io.to(target.socketId).emit('rtc:signal', { from: user.userId, signal: data.signal });
    });

    // ─── Avatar / character selection ──────────────────────
    socket.on('space:set-skin', async (data: { character: string }) => {
      if (!allowCommand('profile')) { rejectMutation(); return; }
      if (!isSupportedCharacter(data?.character)) return;

      if (!await persistOrLog('space:set-skin', user.userId, prisma.user.update({ where: { id: user.userId }, data: { character: data.character } }))) return;

      const slug = findMySlug();
      if (!slug) return;
      presence.updateUser(slug, user.userId, { character: data.character });
      io.to(`space:${slug}`).emit('space:player-skin', { userId: user.userId, character: data.character });
    });

    // ─── Nickname (display name) change ────────────────────
    socket.on('space:set-name', async (data: { name: string }) => {
      if (!allowCommand('profile')) { rejectMutation(); return; }
      const name = (data?.name ?? '').toString().trim().slice(0, 24);
      if (!name) return;

      if (!await persistOrLog('space:set-name', user.userId, prisma.user.update({ where: { id: user.userId }, data: { name } }))) return;

      const slug = findMySlug();
      if (!slug) return;
      presence.updateUser(slug, user.userId, { name });
      io.to(`space:${slug}`).emit('space:player-name', { userId: user.userId, name });
    });

    // ─── Presence status (Disponible / Occupé / Absent) ────
    socket.on('space:set-status', async (data: { status: string }) => {
      if (!allowCommand('profile')) { rejectMutation(); return; }
      const status = (data?.status ?? '').toString();
      if (!VALID_STATUS.has(status)) return;

      if (!await persistOrLog('space:set-status', user.userId, prisma.user.update({ where: { id: user.userId }, data: { status: status as never } }))) return;

      const slug = findMySlug();
      if (!slug) return;
      presence.updateUser(slug, user.userId, { status });
      io.to(`space:${slug}`).emit('space:player-status', { userId: user.userId, status });
    });

    // ─── "Ne pas déranger" / bureau verrouillé ─────────────
    // Verrouiller coupe la visio de proximité (côté serveur, recomputeProximity
    // force "pas proche") et fait apparaître un cadenas chez les autres.
    socket.on('space:set-dnd', async (data: { dnd: boolean }) => {
      if (!allowCommand('profile')) { rejectMutation(); return; }
      const dnd = !!data?.dnd;

      if (!await persistOrLog('space:set-dnd', user.userId, prisma.user.update({ where: { id: user.userId }, data: { dnd } }))) return;

      const slug = findMySlug();
      if (!slug) return;
      const primary = presence.getPrimary(slug, user.userId);
      if (!primary) return;
      const lockX = dnd ? primary.x : 0;
      const lockY = dnd ? primary.y : 0;
      presence.updateUser(slug, user.userId, { dnd, lockX, lockY });
      io.to(`space:${slug}`).emit('space:player-dnd', { userId: user.userId, dnd, x: lockX, y: lockY });
      recomputeProximity(io, slug, user.userId);
    });

    // ─── Reaction emotes (ephemeral) ───────────────────────
    socket.on('space:emote', (data: { emote: string }) => {
      if (!allowCommand('ephemeral')) return;
      const valid = /^(heart|excl|question|music|sleep|sun)$/.test(data?.emote ?? '');
      if (!valid) return;
      const slug = findMySlug();
      if (slug) io.to(`space:${slug}`).emit('space:player-emote', { userId: user.userId, emote: data.emote });
    });

    // ─── Persistent messaging (channels + DMs) ─────────────
    socket.on('message:send', async (
      data: MessageSendPayload,
      ack?: (result: MessageSendAck) => void,
    ) => {
      if (!allowCommand('messageSend')) {
        ack?.({ ok: false, error: 'Trop de messages, réessaie dans quelques secondes.' });
        return;
      }

      try {
        const result = await sendAuthorizedMessage(user.userId, data, {
          authorize: resolveChannelAccess,
          storeImage: storeDataUrl,
          createMessage: (messageData) => prisma.message.create({
            data: { ...messageData, imageId: storedImageId(messageData.imageUrl) },
            include: MSG_INCLUDE,
          }),
          publish: (access, message) => io.to(channelRooms(access)).emit('message:new', { message }),
        });
        ack?.(result);
      } catch (error) {
        console.error('[message] send failed:', {
          userId: user.userId,
          channelId: data?.channelId,
          error: error instanceof Error ? error.message : error,
        });
        ack?.({ ok: false, error: 'Impossible d’envoyer le message.' });
      }
    });

    // Mark a channel read up to now (drives persistent unread counts).
    socket.on('message:read', async (data: { channelId: string }) => {
      if (!allowCommand('messageRead')) return;
      const channelId = (data?.channelId ?? '').toString();
      if (!channelId) return;
      const access = await persistOrLog('message:read:access', user.userId, resolveChannelAccess(channelId, user.userId));
      if (!access) return;
      await persistOrLog('message:read', user.userId, prisma.channelRead.upsert({
          where: { channelId_userId: { channelId, userId: user.userId } },
          create: { channelId, userId: user.userId },
          update: { lastReadAt: new Date() },
        }));
    });

    // Add / remove an emoji reaction on a message.
    socket.on('reaction:add', async (data: { messageId: string; emoji: string }) => {
      if (!allowCommand('reaction')) { rejectMutation(); return; }
      const emoji = (data?.emoji ?? '').toString();
      if (!REACTIONS.has(emoji)) return;
      const res = await persistOrLog('reaction:add:access', user.userId,
        resolveMessageChannel((data?.messageId ?? '').toString(), user.userId));
      if (!res) return;
      const saved = await persistOrLog('reaction:add', user.userId, prisma.messageReaction.upsert({
          where: { messageId_userId_emoji: { messageId: res.message.id, userId: user.userId, emoji } },
          create: { messageId: res.message.id, userId: user.userId, emoji },
          update: {},
        }));
      if (!saved) return;
      io.to(channelRooms(res)).emit('reaction:update', {
        messageId: res.message.id, channelId: res.message.channelId, emoji, userId: user.userId, added: true,
      });
    });

    socket.on('reaction:remove', async (data: { messageId: string; emoji: string }) => {
      if (!allowCommand('reaction')) { rejectMutation(); return; }
      const emoji = (data?.emoji ?? '').toString();
      const res = await persistOrLog('reaction:remove:access', user.userId,
        resolveMessageChannel((data?.messageId ?? '').toString(), user.userId));
      if (!res) return;
      const removed = await persistOrLog('reaction:remove', user.userId, prisma.messageReaction
        .deleteMany({ where: { messageId: res.message.id, userId: user.userId, emoji } }));
      if (!removed) return;
      io.to(channelRooms(res)).emit('reaction:update', {
        messageId: res.message.id, channelId: res.message.channelId, emoji, userId: user.userId, added: false,
      });
    });

    // Edit / delete — only the author may touch their own message.
    socket.on('message:edit', async (data: { messageId: string; body: string }) => {
      if (!allowCommand('messageMutate')) { rejectMutation(); return; }
      const body = (data?.body ?? '').toString().trim().slice(0, 4000);
      if (!body) return;
      const res = await persistOrLog('message:edit:access', user.userId,
        resolveMessageChannel((data?.messageId ?? '').toString(), user.userId));
      if (!res || res.message.userId !== user.userId) return;
      const editedAt = new Date();
      const ok = await persistOrLog('message:edit', user.userId, prisma.message
        .update({ where: { id: res.message.id }, data: { body, editedAt } }));
      if (!ok) { socket.emit('space:error', { error: 'Impossible de modifier ce message.' }); return; }
      io.to(channelRooms(res)).emit('message:edited', {
        messageId: res.message.id, channelId: res.message.channelId, body, editedAt,
      });
    });

    socket.on('message:delete', async (data: { messageId: string }) => {
      if (!allowCommand('messageMutate')) { rejectMutation(); return; }
      const res = await persistOrLog('message:delete:access', user.userId,
        resolveMessageChannel((data?.messageId ?? '').toString(), user.userId));
      if (!res || res.message.userId !== user.userId) return;
      const ok = await persistOrLog('message:delete', user.userId, prisma.message.delete({ where: { id: res.message.id } }));
      if (!ok) { socket.emit('space:error', { error: 'Impossible de supprimer ce message.' }); return; }
      scheduleImageGc();
      io.to(channelRooms(res)).emit('message:deleted', {
        messageId: res.message.id, channelId: res.message.channelId,
      });
    });

    // Resolve which workspace the current socket belongs to (used by several handlers).
    function callerSlug(): string | null {
      const player = presence.getSocket(socket.id);
      const slug = socket.data.workspaceSlug as string | undefined;
      return slug && player?.workspaceSlug === slug ? slug : null;
    }

    // ─── Furniture decorator events ─────────────────────────

    type FurnitureAck = (result: FurnitureCommandAck) => void;

    async function executeFurnitureCommand<T>(
      event: string,
      ack: FurnitureAck | undefined,
      command: () => Promise<T>,
      publish: (result: T) => void,
    ): Promise<void> {
      try {
        const result = await command();
        publish(result);
        ack?.({ ok: true });
      } catch (error) {
        if (!(error instanceof FurnitureServiceError)) {
          console.error('[furniture] command failed:', {
            event,
            userId: user.userId,
            error: error instanceof Error ? error.message : error,
          });
        }
        ack?.({
          ok: false,
          error: error instanceof FurnitureServiceError ? error.message : 'Furniture command failed',
        });
      }
    }

    function rejectInvalidFurniture(ack: FurnitureAck | undefined): void {
      ack?.({ ok: false, error: 'Invalid furniture command' });
    }

    socket.on('furniture:place', (data: FurniturePlacePayload, ack?: FurnitureAck) => {
      if (!allowCommand('furniture')) { ack?.({ ok: false, error: 'Too many furniture commands' }); return; }
      const slug = callerSlug();
      const parsed = furniturePlaceSchema.safeParse(data);
      if (!slug || !parsed.success) {
        rejectInvalidFurniture(ack);
        return;
      }
      void executeFurnitureCommand(
        'furniture:place',
        ack,
        () => furnitureService.place(slug, user.userId, parsed.data),
        (item) => io.to(`space:${slug}`).emit('furniture:placed', item),
      );
    });

    socket.on('furniture:transform', (data: FurnitureTransformPayload, ack?: FurnitureAck) => {
      if (!allowCommand('furniture')) { ack?.({ ok: false, error: 'Too many furniture commands' }); return; }
      const slug = callerSlug();
      const parsed = furnitureTransformSchema.safeParse(data);
      if (!slug || !parsed.success) {
        rejectInvalidFurniture(ack);
        return;
      }
      void executeFurnitureCommand(
        'furniture:transform',
        ack,
        () => furnitureService.transform(slug, user.userId, parsed.data),
        (item) => io.to(`space:${slug}`).emit('furniture:transformed', { id: item.id, flip: item.flip }),
      );
    });

    socket.on('furniture:move', (data: FurnitureMovePayload, ack?: FurnitureAck) => {
      if (!allowCommand('furniture')) { ack?.({ ok: false, error: 'Too many furniture commands' }); return; }
      const slug = callerSlug();
      const parsed = furnitureMoveSchema.safeParse(data);
      if (!slug || !parsed.success) {
        rejectInvalidFurniture(ack);
        return;
      }
      void executeFurnitureCommand(
        'furniture:move',
        ack,
        () => furnitureService.move(slug, user.userId, parsed.data),
        (item) => io.to(`space:${slug}`).emit('furniture:moved', { id: item.id, x: item.x, y: item.y }),
      );
    });

    socket.on('furniture:remove', (data: FurnitureRemovePayload, ack?: FurnitureAck) => {
      if (!allowCommand('furniture')) { ack?.({ ok: false, error: 'Too many furniture commands' }); return; }
      const slug = callerSlug();
      const parsed = furnitureRemoveSchema.safeParse(data);
      if (!slug || !parsed.success) {
        rejectInvalidFurniture(ack);
        return;
      }
      void executeFurnitureCommand(
        'furniture:remove',
        ack,
        () => furnitureService.remove(slug, user.userId, parsed.data),
        (item) => io.to(`space:${slug}`).emit('furniture:removed', { id: item.id }),
      );
    });

    socket.on('furniture:depth', (data: FurnitureDepthPayload, ack?: FurnitureAck) => {
      if (!allowCommand('furniture')) { ack?.({ ok: false, error: 'Too many furniture commands' }); return; }
      const slug = callerSlug();
      const parsed = furnitureDepthSchema.safeParse(data);
      if (!slug || !parsed.success) {
        rejectInvalidFurniture(ack);
        return;
      }
      void executeFurnitureCommand(
        'furniture:depth',
        ack,
        () => furnitureService.setDepth(slug, user.userId, parsed.data),
        (item) => io.to(`space:${slug}`).emit('furniture:depth', { id: item.id, depth: item.depth }),
      );
    });

    // Apply a saved map template: replace the workspace's furniture, then
    // broadcast the fresh state so every connected client re-syncs. The client
    // confirms a separate REST backup before sending this destructive command;
    // that backup is deliberately not presented as part of this DB transaction.
    socket.on('map:apply', async (data: MapApplyPayload, ack?: (result: MapApplyAck) => void) => {
      const reply = (result: MapApplyAck) => ack?.(result);
      if (!allowCommand('mapApply')) { reply({ ok: false, error: 'Trop de cartes appliquées, réessaie plus tard.' }); return; }
      const slug = callerSlug();
      if (!slug) {
        reply({ ok: false, error: 'Connexion à l’espace introuvable.' });
        return;
      }
      const templateId = (data?.templateId ?? '').toString();
      if (!templateId) {
        reply({ ok: false, error: 'Carte invalide.' });
        return;
      }

      try {
        const ws = await prisma.workspace.findUnique({
          where: { slug },
          select: { id: true, members: { where: { userId: user.userId }, select: { id: true, role: true } }, rooms: { select: { id: true } } },
        });
        // Applying a shared map is intentional co-editing for every member; the
        // destructive command is protected by backup, ack and rate limiting.
        if (!ws || ws.members.length === 0) {
          reply({ ok: false, error: 'Carte introuvable.' });
          return;
        }
        const room = ws.rooms[0];
        if (!room) {
          reply({ ok: false, error: 'Aucune pièce disponible dans cet espace.' });
          return;
        }

        const tpl = await prisma.mapTemplate.findFirst({
          where: { id: templateId, workspaceId: ws.id },
          select: { data: true },
        });
        if (!tpl) {
          reply({ ok: false, error: 'Carte introuvable.' });
          return;
        }

        type SnapF = { catalogId: string; col: number; row: number; w: number; h: number; x: number; y: number; depth?: number; flip?: boolean };
        const snap = (tpl.data ?? {}) as { furniture?: SnapF[] };
        const furnitureData = Array.isArray(snap.furniture) ? snap.furniture : [];
        const roomIds = ws.rooms.map((r) => r.id);

        await applyMap({
          replaceFurniture: async () => {
            await prisma.$transaction([
              prisma.furniture.deleteMany({ where: { roomId: { in: roomIds } } }),
              prisma.furniture.createMany({
                data: furnitureData.map((f) => ({
                  roomId: room.id,
                  placedBy: user.userId,
                  catalogId: String(f.catalogId),
                  col: f.col, row: f.row, w: f.w, h: f.h, x: f.x, y: f.y,
                  depth: f.depth ?? 3, flip: !!f.flip,
                })),
              }),
            ]);
          },
          readFurniture: () => prisma.furniture.findMany({
            where: { roomId: { in: roomIds } },
            orderBy: { createdAt: 'asc' },
          }),
          publishFurniture: (furniture) => {
            io.to(`space:${slug}`).emit('furniture:reset', furniture);
          },
        });

        reply({ ok: true });
      } catch (error) {
        console.error('[map] apply failed:', {
          workspaceSlug: slug,
          templateId,
          userId: user.userId,
          error: error instanceof Error ? error.message : error,
        });
        reply({ ok: false, error: 'Impossible d’appliquer cette carte.' });
      }
    });

    // Leave space
    socket.on('space:leave', () => {
      const slug = findMySlug();
      removePlayer(io, socket, user.userId);
      if (slug) {
        void socket.leave(`space:${slug}`);
        void socket.leave(`ws:${slug}`);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      removePlayer(io, socket, user.userId);
      userQuotas.unregisterSocket(user.userId, socket.id);
      console.log(`[Socket] ${user.email} disconnected`);
    });
  });
}

function removePlayer(io: Server, socket: Socket, userId: string) {
  const result = presence.leave(socket.id);
  socket.data.workspaceSlug = undefined;
  lastMoveAt.delete(socket.id);
  if (!result) return;

  const slug = result.state.workspaceSlug;
  if (result.wasPrimary) {
    for (const other of presence.getUsers(slug)) {
      if (other.userId === userId) continue;
      const key = proximityKey(slug, userId, other.userId);
      if (proximityState.delete(key)) {
        io.to(other.socketId).emit('space:proximity', { userId, near: false });
      }
    }
  }

  if (!result.userStillOnline) {
    socket.to(`space:${slug}`).emit('space:player-left', { userId });
  } else if (result.promoted) {
    io.to(`space:${slug}`).emit('space:players', rosterFor(slug));
    // Give clients one event turn to tear down the old peer before negotiating
    // against the promoted socket for the same user id.
    setTimeout(() => recomputeProximity(io, slug, userId), 0);
  }

  console.log(`[Space] ${result.state.name} left ${slug} (${result.workspaceUserCount} users)`);
}
