/**
 * A very small request cache: freshness window + in-flight deduplication.
 *
 * Every list in the workspace used to be refetched from scratch each time its
 * panel was opened (and once more on every tab switch), with nothing stopping
 * two rapid clicks from racing — last response wins, even if it was the older
 * one. This gives those loaders a memory without pulling in a full data-fetching
 * library for the handful of GETs the app actually makes.
 *
 * Deliberately not persisted: it's a per-tab cache, and the HTTP layer
 * (ETag + Cache-Control, see the server) handles reloads.
 */

interface Entry<T> {
  value?: T;
  fetchedAt: number;
  inflight?: Promise<T>;
}

const entries = new Map<string, Entry<unknown>>();

/** Default freshness window: long enough to cover panel open/close churn. */
export const DEFAULT_STALE_MS = 30_000;

/**
 * Run `fetcher` unless a fresh-enough result is already cached, and collapse
 * concurrent calls for the same key onto a single request.
 *
 * `force` bypasses the freshness check but still joins an in-flight request, so
 * an explicit refresh can't stampede either.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { staleMs?: number; force?: boolean } = {},
): Promise<T> {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const entry = entries.get(key) as Entry<T> | undefined;

  if (entry?.inflight) return entry.inflight;
  if (!opts.force && entry && entry.value !== undefined && Date.now() - entry.fetchedAt < staleMs) {
    return entry.value;
  }

  const inflight = fetcher()
    .then((value) => {
      entries.set(key, { value, fetchedAt: Date.now() });
      return value;
    })
    .catch((err) => {
      // Drop the failed attempt rather than caching it: keep any previous value
      // so a transient blip doesn't blank a panel, but let the next call retry.
      const prev = entries.get(key) as Entry<T> | undefined;
      entries.set(key, { value: prev?.value, fetchedAt: 0 });
      throw err;
    });

  entries.set(key, { ...(entry ?? { fetchedAt: 0 }), inflight });
  return inflight;
}

/**
 * Mark cached data as stale so the next read refetches. Called after a mutation
 * that we know changed the underlying list. Pass a prefix to invalidate a group.
 */
export function invalidate(keyOrPrefix: string) {
  for (const key of entries.keys()) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) entries.delete(key);
  }
}

/** Wipe everything — used on logout so the next account starts clean. */
export function clearCache() {
  entries.clear();
}
