type CacheEntry<T> = {
  ts: number;
  data: T;
};

const cache = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.ts < ttlMs) {
    return entry.data as T;
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const data = await fetcher();
    cache.set(key, { ts: Date.now(), data });
    return data;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function buildCacheKey(prefix: string, url: string) {
  try {
    const parsed = new URL(url);
    const search = parsed.searchParams.toString();
    return search ? `${prefix}:${parsed.pathname}?${search}` : `${prefix}:${parsed.pathname}`;
  } catch {
    return `${prefix}:${url}`;
  }
}
