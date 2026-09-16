import axios, { isAxiosError } from 'axios';
import { disconnectSocket } from './socket';
import { useAuthStore, type AuthUser } from '../stores/auth';
import {
  AuthGeneration,
  disableSession,
  enableSession,
  isSessionDisabled,
  purgeLegacyAuthStorage,
  retryOnceOnConflict,
  runAuthBootstrap,
} from './authState';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const AUTH_CHANNEL = 'nestwork-auth-events';
const generation = new AuthGeneration();
let refreshing: Promise<string | null> | null = null;
let bootstrapping: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let localLockTail: Promise<void> = Promise.resolve();

function statusOf(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

async function rawRefresh(): Promise<string> {
  const response = await retryOnceOnConflict({
    request: () => axios.post<{ accessToken: string }>(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true }),
    statusOf,
    retryAfterOf: (error) => isAxiosError(error) ? error.response?.headers['retry-after']?.toString() : undefined,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });
  return response.data.accessToken;
}

async function withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('nestwork-auth-refresh', { mode: 'exclusive' }, operation);
  }
  const previous = localLockTail;
  let release: () => void = () => undefined;
  localLockTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function initializeAuthCoordination(): () => void {
  purgeLegacyAuthStorage(browserStorage());
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  try {
    channel = new BroadcastChannel(AUTH_CHANNEL);
  } catch {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type !== 'logout') return;
    generation.invalidate();
    disableSession(browserStorage());
    disconnectSocket();
    useAuthStore.getState().setAnonymous();
  };
  return () => {
    channel?.close();
    channel = null;
  };
}

async function runBootstrapSession(): Promise<void> {
  if (isSessionDisabled(browserStorage())) {
    useAuthStore.getState().setAnonymous();
    return;
  }
  const captured = generation.capture();
  const result = await runAuthBootstrap<AuthUser>({
    generation: captured,
    isCurrent: (value) => generation.isCurrent(value),
    refresh: () => withRefreshLock(rawRefresh),
    loadUser: async (accessToken) => {
      const response = await axios.get<{ user: AuthUser }>(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        withCredentials: true,
      });
      return response.data.user;
    },
    statusOf,
  });
  if (result.status === 'authenticated') useAuthStore.getState().setAuth(result.user, result.accessToken);
  else if (result.status === 'anonymous') useAuthStore.getState().setAnonymous();
  else if (result.status === 'unavailable') useAuthStore.getState().setUnavailable();
}

export function bootstrapSession(): Promise<void> {
  if (!bootstrapping) {
    bootstrapping = runBootstrapSession().finally(() => { bootstrapping = null; });
  }
  return bootstrapping;
}

export function establishSession(user: AuthUser, accessToken: string): void {
  generation.invalidate();
  enableSession(browserStorage());
  useAuthStore.getState().setAuth(user, accessToken);
}

export function refreshAccessToken(): Promise<string | null> {
  if (isSessionDisabled(browserStorage())) {
    useAuthStore.getState().setAnonymous();
    return Promise.resolve(null);
  }
  if (refreshing) return refreshing;
  const captured = generation.capture();
  refreshing = withRefreshLock(rawRefresh)
    .then((accessToken) => {
      if (!generation.isCurrent(captured)) return null;
      useAuthStore.getState().setAccessToken(accessToken);
      return accessToken;
    })
    .catch((error: unknown) => {
      if (!generation.isCurrent(captured)) return null;
      if (statusOf(error) === 401) useAuthStore.getState().setAnonymous();
      else {
        const state = useAuthStore.getState();
        // A transient refresh failure must not dismantle a workspace while the
        // current access token may still be valid. `unavailable` is reserved for
        // bootstrap, where no usable in-memory session exists yet.
        if (!state.user || !state.accessToken) state.setUnavailable();
      }
      return null;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function logoutSession(): Promise<void> {
  generation.invalidate();
  disableSession(browserStorage());
  disconnectSocket();
  useAuthStore.getState().setAnonymous();
  channel?.postMessage({ type: 'logout' });
  try {
    await withRefreshLock(() => axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true }));
  } catch {
    // Local logout is authoritative for this tab; the server cookie may only be
    // cleared once connectivity returns, but no credential remains in memory.
  }
}
