interface WindowCounter {
  count: number;
  windowStart: number;
}

interface UserQuotaState {
  counters: Map<string, WindowCounter>;
  sockets: Set<string>;
  lastSeenAt: number;
}

export class UserQuotaRegistry {
  private readonly users = new Map<string, UserQuotaState>();
  private operations = 0;
  private sweepIterator: MapIterator<[string, UserQuotaState]> | null = null;

  constructor(
    private readonly options: { maxSocketsPerUser: number; idleTtlMs: number; sweepEvery?: number; sweepLimit?: number },
  ) {}

  registerSocket(userId: string, socketId: string, now = Date.now()): boolean {
    const state = this.stateFor(userId, now);
    if (state.sockets.has(socketId)) return true;
    if (state.sockets.size >= this.options.maxSocketsPerUser) return false;
    state.sockets.add(socketId);
    return true;
  }

  unregisterSocket(userId: string, socketId: string, now = Date.now()): void {
    const state = this.users.get(userId);
    if (!state) return;
    state.sockets.delete(socketId);
    state.lastSeenAt = now;
    this.maybeSweep(now);
  }

  allow(userId: string, key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const state = this.stateFor(userId, now);
    const counter = state.counters.get(key);
    if (!counter || now - counter.windowStart >= windowMs) {
      state.counters.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (counter.count >= limit) return false;
    counter.count += 1;
    return true;
  }

  activeSocketCount(userId: string): number {
    return this.users.get(userId)?.sockets.size ?? 0;
  }

  userCount(): number {
    return this.users.size;
  }

  sweep(now = Date.now(), limit = this.options.sweepLimit ?? 100): number {
    let removed = 0;
    let inspected = 0;
    while (inspected < limit && this.users.size > 0) {
      if (!this.sweepIterator) this.sweepIterator = this.users.entries();
      let entry = this.sweepIterator.next();
      if (entry.done) {
        this.sweepIterator = this.users.entries();
        entry = this.sweepIterator.next();
        if (entry.done) break;
      }
      const [userId, state] = entry.value;
      inspected += 1;
      if (state.sockets.size === 0 && now - state.lastSeenAt >= this.options.idleTtlMs) {
        this.users.delete(userId);
        removed += 1;
      }
    }
    return removed;
  }

  private stateFor(userId: string, now: number): UserQuotaState {
    this.maybeSweep(now);
    let state = this.users.get(userId);
    if (!state) {
      state = { counters: new Map(), sockets: new Set(), lastSeenAt: now };
      this.users.set(userId, state);
    }
    state.lastSeenAt = now;
    return state;
  }

  private maybeSweep(now: number): void {
    this.operations += 1;
    if (this.operations % (this.options.sweepEvery ?? 256) === 0) this.sweep(now);
  }
}

export const SOCKET_QUOTAS = {
  authRefresh: { limit: 30, windowMs: 60_000 },
  join: { limit: 10, windowMs: 60_000 },
  presenceRead: { limit: 30, windowMs: 10_000 },
  roomChange: { limit: 120, windowMs: 60_000 },
  ephemeral: { limit: 30, windowMs: 10_000 },
  desk: { limit: 20, windowMs: 60_000 },
  profile: { limit: 30, windowMs: 60_000 },
  messageSend: { limit: 10, windowMs: 10_000 },
  messageRead: { limit: 120, windowMs: 60_000 },
  messageMutate: { limit: 60, windowMs: 60_000 },
  reaction: { limit: 120, windowMs: 60_000 },
  furniture: { limit: 120, windowMs: 60_000 },
  mapApply: { limit: 5, windowMs: 60_000 },
  // A 15-user mesh can legitimately emit >120 ICE/SDP messages during startup.
  rtc: { limit: 300, windowMs: 10_000 },
} as const;
