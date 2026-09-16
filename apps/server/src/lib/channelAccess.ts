import type { Channel, ChannelMember } from '@prisma/client';
import { prisma } from './prisma';

// Deterministic key for a 1-to-1 DM, independent of who initiates it.
export function dmKeyFor(workspaceId: string, a: string, b: string): string {
  return `${workspaceId}|${[a, b].sort().join('|')}`;
}

export interface ChannelAccess {
  channel: Channel & { members: ChannelMember[] };
  slug: string;
}

// Single source of truth for channel authorization, shared by REST and socket.
// Re-derives workspaceId/membership from the DB — never trusts a client-supplied
// userId or slug (anti-IDOR). Returns null when the user must not see the channel.
//   • CHANNEL (public) → requester must be a member of the channel's workspace.
//   • DM               → requester must be one of the channel's members.
export async function resolveChannelAccess(
  channelId: string,
  userId: string,
): Promise<ChannelAccess | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      members: true,
      workspace: {
        select: { slug: true, members: { where: { userId }, select: { id: true } } },
      },
    },
  });
  if (!channel) return null;

  if (channel.type === 'DM') {
    if (!channel.members.some((m) => m.userId === userId)) return null;
  } else if (channel.workspace.members.length === 0) {
    // Not a member of the workspace this public channel belongs to.
    return null;
  }

  const { workspace, ...rest } = channel;
  return { channel: rest, slug: workspace.slug };
}

// Resolve a message + verify the caller may access its channel. Used by
// reactions / edit / delete to authorize and to find the broadcast audience.
export async function resolveMessageChannel(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return null;
  const access = await resolveChannelAccess(message.channelId, userId);
  if (!access) return null;
  return { message, ...access };
}

// Find or create the DM between two users, race-safe. The unique dmKey makes the
// upsert atomic; createMany(skipDuplicates) guarantees exactly the 2 member rows
// even if two requests interleave. Both ids must already be workspace co-members
// (the caller verifies that before calling this).
export async function findOrCreateDm(workspaceId: string, a: string, b: string): Promise<Channel> {
  const key = dmKeyFor(workspaceId, a, b);
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.upsert({
      where: { dmKey: key },
      create: { workspaceId, type: 'DM', createdBy: a, dmKey: key },
      update: {},
    });
    await tx.channelMember.createMany({
      data: [
        { channelId: channel.id, userId: a },
        { channelId: channel.id, userId: b },
      ],
      skipDuplicates: true,
    });
    return channel;
  });
}
