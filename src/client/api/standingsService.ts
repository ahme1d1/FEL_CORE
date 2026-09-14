import type { Standing } from '../data/standings.js';

import { apiFetch, ok } from './client.js';
import { singleFlight, type SingleFlightCache } from './singleFlight.js';
import type { ApiResponse } from './types.js';

export type { Standing };

const cache: SingleFlightCache<ApiResponse<Standing[]>> = { current: null };

/**
 * `GET /standings` — the real Egyptian league table, field-for-field identical
 * to the website's local `Standing`. Distinct from the fantasy leaderboard
 * (`GET /leagues/global`). Two consumers: `/app/standings` renders the table,
 * `/app/fixtures` needs it for FixtureRow's difficulty dots.
 *
 * Single-flighted so those two never double-fetch when they overlap. Not memoized
 * beyond that on purpose — unlike `referenceCache`'s reference data, the table
 * moves as matches settle, so each visit must see a fresh one.
 */
export function getStandings(): Promise<ApiResponse<Standing[]>> {
  return singleFlight(cache, async () => {
    const res = await apiFetch<Standing[]>('/standings');
    if (!res.success || !res.data) {
      return { success: false, data: null, error: res.error, code: res.code };
    }
    return ok(res.data);
  });
}

/** Tier used when the table cannot yet rank anyone — also what an unknown club gets. */
const NEUTRAL_DIFFICULTY = 2;

/**
 * Fixture difficulty for a given opponent club (1 = easiest, 5 = hardest).
 * Derived from league position: top 3 → 5, 4-6 → 4, 7-12 → 3, 13-18 → 2,
 * bottom → 1. Pure function over a passed-in table (not a module constant)
 * so callers can feed it the live-fetched table once available.
 *
 * A partly-played table is not a ranking. `GET /standings` now returns every club
 * from the opening day, and clubs level on zero are ordered alphabetically — so
 * position only carries meaning once every club has a result to be ordered by.
 * Until then the whole table stays neutral, exactly as it read when the endpoint
 * returned nothing at all.
 *
 * The test is "everyone has played", not "someone has": after the first match of
 * the season, one 0-0 draw put two clubs on a point and left the other eighteen
 * in alphabet order — and the dots on /app/fixtures dutifully painted that
 * alphabet as a difficulty curve. Verified in the browser, which is the only
 * reason this is `every` and not `some`.
 */
export function difficulty(standings: Standing[], clubId: string): number {
  if (standings.length === 0 || !standings.every((s) => s.p > 0)) return NEUTRAL_DIFFICULTY;
  const idx = standings.findIndex((s) => s.club === clubId);
  if (idx === -1) return NEUTRAL_DIFFICULTY;
  if (idx < 3) return 5;
  if (idx < 6) return 4;
  if (idx < 12) return 3;
  if (idx < 18) return NEUTRAL_DIFFICULTY;
  return 1;
}
