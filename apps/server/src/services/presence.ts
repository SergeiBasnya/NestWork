export interface PlayerState {
  userId: string;
  name: string;
  socketId: string;
  workspaceSlug: string;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  roomId: string | null;
  character: string | null;
  status: string;
  dnd: boolean;
  lockX: number;
  lockY: number;
}

export interface PresenceLeaveResult {
  state: PlayerState;
  wasPrimary: boolean;
  userStillOnline: boolean;
  promoted: PlayerState | null;
  workspaceUserCount: number;
}

export class PresenceRegistry {
  private readonly workspaces = new Map<string, Map<string, Map<string, PlayerState>>>();
  private readonly sockets = new Map<string, PlayerState>();

  join(state: PlayerState): { firstSocketForUser: boolean } {
    if (this.sockets.has(state.socketId)) {
      throw new Error(`Socket ${state.socketId} is already registered`);
    }
    let users = this.workspaces.get(state.workspaceSlug);
    if (!users) {
      users = new Map();
      this.workspaces.set(state.workspaceSlug, users);
    }
    let userSockets = users.get(state.userId);
    const firstSocketForUser = !userSockets;
    if (!userSockets) {
      userSockets = new Map();
      users.set(state.userId, userSockets);
    }
    userSockets.set(state.socketId, state);
    this.sockets.set(state.socketId, state);
    return { firstSocketForUser };
  }

  getSocket(socketId: string): PlayerState | null {
    return this.sockets.get(socketId) ?? null;
  }

  getPrimary(workspaceSlug: string, userId: string): PlayerState | null {
    const sockets = this.workspaces.get(workspaceSlug)?.get(userId);
    return sockets?.values().next().value ?? null;
  }

  isPrimary(socketId: string): boolean {
    const state = this.getSocket(socketId);
    return !!state && this.getPrimary(state.workspaceSlug, state.userId)?.socketId === socketId;
  }

  getUsers(workspaceSlug: string): PlayerState[] {
    const users = this.workspaces.get(workspaceSlug);
    if (!users) return [];
    return [...users.values()].flatMap((sockets) => {
      const primary = sockets.values().next().value as PlayerState | undefined;
      return primary ? [primary] : [];
    });
  }

  getUserSocketIds(workspaceSlug: string, userId: string): string[] {
    return [...(this.workspaces.get(workspaceSlug)?.get(userId)?.keys() ?? [])];
  }

  updateSocket(socketId: string, update: Partial<Omit<PlayerState, 'socketId' | 'userId' | 'workspaceSlug'>>): PlayerState | null {
    const state = this.getSocket(socketId);
    if (!state) return null;
    Object.assign(state, update);
    return state;
  }

  updateUser(
    workspaceSlug: string,
    userId: string,
    update: Partial<Omit<PlayerState, 'socketId' | 'userId' | 'workspaceSlug'>>,
  ): PlayerState | null {
    const sockets = this.workspaces.get(workspaceSlug)?.get(userId);
    if (!sockets) return null;
    sockets.forEach((state) => Object.assign(state, update));
    return this.getPrimary(workspaceSlug, userId);
  }

  leave(socketId: string): PresenceLeaveResult | null {
    const state = this.sockets.get(socketId);
    if (!state) return null;
    const users = this.workspaces.get(state.workspaceSlug);
    const userSockets = users?.get(state.userId);
    if (!users || !userSockets) return null;

    const wasPrimary = userSockets.values().next().value?.socketId === socketId;
    userSockets.delete(socketId);
    this.sockets.delete(socketId);
    const promoted = userSockets.values().next().value as PlayerState | undefined;
    const userStillOnline = userSockets.size > 0;
    if (!userStillOnline) users.delete(state.userId);
    if (users.size === 0) this.workspaces.delete(state.workspaceSlug);

    return {
      state,
      wasPrimary,
      userStillOnline,
      promoted: promoted ?? null,
      workspaceUserCount: users.size,
    };
  }
}

export function proximityKey(workspaceSlug: string, firstUserId: string, secondUserId: string): string {
  return `${workspaceSlug}\u0000${[firstUserId, secondUserId].sort().join('\u0000')}`;
}

export function resolveRtcTarget(
  registry: PresenceRegistry,
  nearPairs: ReadonlyMap<string, boolean>,
  senderSocketId: string,
  targetUserId: string,
): PlayerState | null {
  const sender = registry.getSocket(senderSocketId);
  if (!sender || sender.userId === targetUserId || !registry.isPrimary(senderSocketId) || sender.dnd) return null;
  const target = registry.getPrimary(sender.workspaceSlug, targetUserId);
  if (!target || target.dnd) return null;
  return nearPairs.get(proximityKey(sender.workspaceSlug, sender.userId, targetUserId)) ? target : null;
}
