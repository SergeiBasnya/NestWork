export type BootstrapStatus = 'authenticated' | 'anonymous' | 'unavailable' | 'stale';

export class AuthGeneration {
  private value = 0;

  capture(): number {
    return this.value;
  }

  invalidate(): number {
    this.value += 1;
    return this.value;
  }

  isCurrent(generation: number): boolean {
    return generation === this.value;
  }
}

interface RemovableStorage {
  removeItem(key: string): void;
}

interface SessionStorage extends RemovableStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SESSION_DISABLED_KEY = 'nestwork-session-disabled';

export function purgeLegacyAuthStorage(storage: RemovableStorage | undefined): void {
  // Deliberately never read or deserialize the old token-bearing value.
  try {
    storage?.removeItem('nestwork-auth');
  } catch {
    // Storage can be disabled by browser privacy policy; auth remains memory-only.
  }
}

export function isSessionDisabled(storage: Pick<SessionStorage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(SESSION_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function disableSession(storage: Pick<SessionStorage, 'setItem'> | undefined): void {
  try {
    storage?.setItem(SESSION_DISABLED_KEY, '1');
  } catch {
    // Memory state still logs out when storage is unavailable.
  }
}

export function enableSession(storage: RemovableStorage | undefined): void {
  try {
    storage?.removeItem(SESSION_DISABLED_KEY);
  } catch {
    // Explicit login still establishes the current in-memory session.
  }
}

export function retryDelayMs(retryAfter: string | undefined): number {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? Math.max(250, Math.min(seconds * 1_000, 5_000)) : 1_000;
}

export async function retryOnceOnConflict<T>(options: {
  request: () => Promise<T>;
  statusOf: (error: unknown) => number | undefined;
  retryAfterOf: (error: unknown) => string | undefined;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<T> {
  try {
    return await options.request();
  } catch (error) {
    if (options.statusOf(error) !== 409) throw error;
    await options.sleep(retryDelayMs(options.retryAfterOf(error)));
    return options.request();
  }
}

export async function runAuthBootstrap<User>(options: {
  generation: number;
  isCurrent: (generation: number) => boolean;
  refresh: () => Promise<string>;
  loadUser: (accessToken: string) => Promise<User>;
  statusOf: (error: unknown) => number | undefined;
}): Promise<
  | { status: 'authenticated'; accessToken: string; user: User }
  | { status: Exclude<BootstrapStatus, 'authenticated'> }
> {
  try {
    const accessToken = await options.refresh();
    if (!options.isCurrent(options.generation)) return { status: 'stale' };
    const user = await options.loadUser(accessToken);
    if (!options.isCurrent(options.generation)) return { status: 'stale' };
    return { status: 'authenticated', accessToken, user };
  } catch (error) {
    if (!options.isCurrent(options.generation)) return { status: 'stale' };
    return { status: options.statusOf(error) === 401 ? 'anonymous' : 'unavailable' };
  }
}
