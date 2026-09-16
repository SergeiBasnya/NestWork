import { prisma } from '../lib/prisma';

export interface UnreadCountRow {
  channelId: string;
  unread: number;
  unreadMentions: number;
}

export interface UnreadCounts {
  unread: Map<string, number>;
  mentions: Map<string, number>;
}

export function mapUnreadCountRows(rows: readonly UnreadCountRow[]): UnreadCounts {
  return {
    unread: new Map(rows.map((row) => [row.channelId, Number(row.unread)])),
    mentions: new Map(rows.map((row) => [row.channelId, Number(row.unreadMentions)])),
  };
}

// One parameterized aggregation replaces the previous read-cursor query plus
// one count per channel and one mention count per public channel.
export async function loadUnreadCounts(
  userId: string,
  channelIds: readonly string[],
  publicChannelIds: readonly string[],
): Promise<UnreadCounts> {
  if (channelIds.length === 0) return mapUnreadCountRows([]);

  const rows = await prisma.$queryRaw<UnreadCountRow[]>`
    SELECT
      m."channelId" AS "channelId",
      COUNT(*)::int AS "unread",
      COUNT(*) FILTER (
        WHERE m."channelId" = ANY(${[...publicChannelIds]}::text[])
          AND u.name IS NOT NULL
          AND m.body ILIKE (
            '%@' || replace(replace(replace(u.name, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
          ) ESCAPE '\\'
      )::int AS "unreadMentions"
    FROM "Message" m
    LEFT JOIN "ChannelRead" r
      ON r."channelId" = m."channelId" AND r."userId" = ${userId}
    LEFT JOIN "User" u ON u.id = ${userId}
    WHERE m."channelId" = ANY(${[...channelIds]}::text[])
      AND m."userId" <> ${userId}
      AND m."createdAt" > COALESCE(r."lastReadAt", TIMESTAMP 'epoch')
    GROUP BY m."channelId"
  `;

  return mapUnreadCountRows(rows);
}
