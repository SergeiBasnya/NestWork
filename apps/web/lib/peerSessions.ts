export const MAX_NEAR_PEERS = 14;

export function orderedPeerTargets(myId: string, onlineIds: Iterable<string>, nearIds: Iterable<string>, limit = MAX_NEAR_PEERS): string[] {
  const ring = [...new Set([...onlineIds, myId])].sort((a, b) => a.localeCompare(b));
  const myIndex = ring.indexOf(myId);
  const near = new Set(nearIds);
  const eligible = ring.filter((id) => id !== myId && near.has(id));
  if (eligible.length <= limit) return eligible;
  const requestedLimit = Math.max(0, Math.min(limit, ring.length - 1));
  // A ring neighbourhood has an even degree. Round an odd custom cap down
  // rather than introduce a one-sided edge.
  const boundedLimit = requestedLimit === ring.length - 1
    ? requestedLimit
    : requestedLimit - (requestedLimit % 2);

  // Above the documented 15-person product ceiling, degrade to a symmetric
  // ring neighbourhood. A plain sorted slice is asymmetric:
  // A may select B while B excludes A, leaving perfect-negotiation peers unable
  // to agree who may create the connection. For the product limit (15 users),
  // everyone still selects everyone; denser rooms degrade to a bounded graph.
  return ring
    .filter((id, index) => {
      if (id === myId || !near.has(id)) return false;
      if (requestedLimit === ring.length - 1) return true;
      const clockwise = (index - myIndex + ring.length) % ring.length;
      const counterClockwise = (myIndex - index + ring.length) % ring.length;
      const distance = Math.min(clockwise, counterClockwise);
      return distance <= boundedLimit / 2;
    })
    .sort((a, b) => a.localeCompare(b))
    .slice(0, boundedLimit);
}

export function reconcilePeerTargets(currentIds: Iterable<string>, targetIds: Iterable<string>) {
  const current = new Set(currentIds);
  const target = new Set(targetIds);
  return {
    open: [...target].filter((id) => !current.has(id)),
    close: [...current].filter((id) => !target.has(id)),
  };
}

export function routePeerSignal<T>(sessions: ReadonlyMap<string, T>, from: string): T | null {
  return sessions.get(from) ?? null;
}

export async function fanoutLocalTrack<T>(sessions: Iterable<T>, replace: (session: T) => Promise<void>): Promise<void> {
  await Promise.all([...sessions].map(replace));
}
