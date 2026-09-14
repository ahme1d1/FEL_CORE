/**
 * Leaf module (no imports) — shares one in-flight promise across concurrent
 * callers instead of firing duplicate requests. Each call site owns its own
 * `cache` box (a plain `{ current: T | null }`) so independent callers never
 * share state through this module.
 */
export interface SingleFlightCache<T> {
  current: Promise<T> | null;
}

export function singleFlight<T>(cache: SingleFlightCache<T>, factory: () => Promise<T>): Promise<T> {
  if (cache.current) return cache.current;
  cache.current = factory().finally(() => {
    cache.current = null;
  });
  return cache.current;
}

/**
 * Keyed sibling of `singleFlight`, for endpoints that vary by a path param.
 *
 * `/fixtures/upcoming/{club}` was requested up to three times per club on a
 * single `/app/squad` load, because the batching composable of the day de-duped
 * only within one component and the page mounts `SquadPitch`, `SquadBench` and
 * `SquadListView` at once (the responsive variants are CSS-hidden, not
 * `v-if`-gated). Add `PlayerChip`'s own per-chip fetch and one squad view cost
 * ~8 wasted round-trips (QA-15). Those pitch callers have since moved to
 * `useGwOpponents`, which needs one request for the whole gameweek. Concurrent callers for the same key now share
 * one in-flight promise; the entry clears as soon as it settles, so this stays
 * a de-duplicator and never becomes a stale cache.
 */
export function keyedSingleFlight<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing;
  const p = factory().finally(() => cache.delete(key));
  cache.set(key, p);
  return p;
}
