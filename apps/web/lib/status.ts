// Presence statuses a user can set (mirrors the server's VALID_STATUS / Prisma enum).
export const STATUSES = [
  { key: 'ONLINE', label: 'Disponible', dot: 'bg-green' },
  { key: 'BUSY', label: 'Occupé', dot: 'bg-red' },
  { key: 'AWAY', label: 'Absent', dot: 'bg-honey' },
] as const;

export type StatusKey = (typeof STATUSES)[number]['key'];

export function statusMeta(key?: string) {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}
