import type { Player } from '../data/players.js';
import type { PositionCode } from '../data/positions.js';

import { asFailure, mapPage, type PaginatedRaw } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

export type PlayerSortKey = 'price' | 'form' | 'sel' | 'total';

/**
 * `market` (the API's default) is what a manager may buy — active players only.
 * `all` is the complete reference set, delisted players included. Only the boot-time
 * reference hydration asks for `all`; every browse/buy read stays on the market.
 */
export type PlayerScope = 'market' | 'all';

export interface PlayerFilters {
  pos?: PositionCode;
  club?: string;
  search?: string;
  maxPrice?: number;
  sortBy?: PlayerSortKey;
  limit?: number;
  scope?: PlayerScope;
}

/**
 * ⛔ **Never add `fields: 'slim'` here.** The API serves that projection
 * (`capabilities.playersSlim`, step 26) and it is 25% smaller, but it is for the mobile app's market
 * list — not for this. Two reasons, both load-bearing:
 *
 *  - This read backs `referenceCache`, whose job is to resolve EVERY id the API can hand back. Slim
 *    drops `photoUrl`, so `PlayerPortrait` would fall back to its procedural drawing for all ~600
 *    players and the real headshots would simply stop appearing.
 *  - The market list prints the metric it is sorted on (`TransferListPane.sortColText`) and
 *    `playerRanking`/`ptsPerMatch` rank on `form`/`total`/`sel`. Slim keeps those, so that half would
 *    survive — which is exactly what makes this a tempting change with a silent cost.
 *
 * The cold-start win here came from asking for ONE page, not from a smaller row. See
 * `FULL_LIST_PAGE_SIZE`.
 */
function buildQuery(filters: PlayerFilters): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (filters.pos) q.pos = filters.pos;
  if (filters.club) q.club = filters.club;
  if (filters.search) q.search = filters.search;
  if (typeof filters.maxPrice === 'number') q.maxPrice = filters.maxPrice;
  if (filters.sortBy) q.sortBy = filters.sortBy;
  // Omitted rather than sent as 'market': the API already defaults to the market, and not
  // sending it keeps the cache key identical to every request made before this existed.
  if (filters.scope === 'all') q.scope = 'all';
  return q;
}

/**
 * What to ASK for, which is not what will necessarily be served.
 *
 * 1000 covers the whole roster in one page against the API's raised ceiling
 * (`PLAYERS_MAX_PER_PAGE`, step 26) — this read is the app zone's boot gate, and at 200 it was
 * **four serial round trips before anything rendered**: fine behind a browser's HTTP cache, about a
 * second of dead time on a phone at 200-400ms RTT.
 *
 * ⚠️ It is a REQUEST, not an assumption. `resolvePerPage` on the server clamps rather than refusing,
 * so an older deployment answers this with 200 rows and says so in `meta.per_page`. The walk below
 * reads it back, which is what makes this change need no capability key at all.
 */
const FULL_LIST_PAGE_SIZE = 1000;
/**
 * Runaway guard, not a page budget — the real page count comes from the response's own
 * `total`. It sits far above any plausible roster because the walk now backs the reference
 * cache, and a *silently* truncated reference set is the exact bug this whole change exists to
 * kill: ids past the cut would stop resolving and their tiles would vanish off the pitch again.
 * Hitting it fails loudly instead.
 *
 * Still 20 rather than falling with the page size: it has to stay a ceiling for the page size the
 * SERVER picks, not the one we asked for, and against a 200-row server 20 pages is 4,000 players.
 */
const FULL_LIST_MAX_PAGES = 20;

/**
 * Walks `GET /players` to return the full matching roster in one call — normally in one request.
 *
 * **Every stop condition is the server's own arithmetic, never the page size we asked for.** That
 * distinction is the whole correctness of this function under deploy skew. Asking for 1000 and
 * treating a 200-row answer as "short page, therefore the end" would take the first 200 players and
 * then fail `PLAYER_LIST_TRUNCATED` — so a website release reaching production ahead of the API
 * release that raised the ceiling would take the app zone down, loudly but completely.
 */
async function fetchAllPages(query: Record<string, unknown>): Promise<ApiResponse<Player[]>> {
  let all: Player[] = [];
  let total = 0;
  for (let page = 1; page <= FULL_LIST_MAX_PAGES; page++) {
    const res = await apiFetch<PaginatedRaw<Player>>('/players', {
      query: { ...query, per_page: FULL_LIST_PAGE_SIZE, page },
    });
    if (!res.success || !res.data) return asFailure<Player[]>(res);
    const mapped = mapPage(res.data);
    total = mapped.total;
    all = all.concat(mapped.items);
    // Covered the set the server counted.
    if (all.length >= total) break;
    // A page shorter than the one the server says it SERVES (`meta.per_page`, not our request) is
    // the last page.
    if (mapped.items.length < mapped.limit) break;
    // And an empty page is the end whatever the numbers claim — the one guard that holds even if a
    // server reports no page size at all.
    if (mapped.items.length === 0) break;
  }
  if (all.length < total) {
    return {
      success: false,
      data: null,
      error: `Player list truncated at ${all.length} of ${total}`,
      code: 'PLAYER_LIST_TRUNCATED',
    };
  }
  return ok(all);
}

/**
 * `GET /players` — server filters/sorts/paginates. `filters.limit` maps
 * straight onto the wire's own `limit` param (a bounded top-N read); with no
 * `limit`, the full matching roster is fetched via a bounded page walk
 * (`fetchAllPages`) so the market list and the reference-cache boot
 * hydration can both request "everything" in one call.
 */
export async function listPlayers(filters: PlayerFilters = {}): Promise<ApiResponse<Player[]>> {
  const query = buildQuery(filters);
  if (typeof filters.limit === 'number') {
    const res = await apiFetch<PaginatedRaw<Player>>('/players', { query: { ...query, limit: filters.limit } });
    if (!res.success || !res.data) return asFailure<Player[]>(res);
    return ok(mapPage(res.data).items);
  }
  return fetchAllPages(query);
}

export async function getPlayer(id: number): Promise<ApiResponse<Player | null>> {
  const res = await apiFetch<Player>(`/players/${id}`);
  if (!res.success || !res.data) {
    if (res.code === 'PLAYER_NOT_FOUND') return ok(null);
    return asFailure<Player | null>(res);
  }
  return ok(res.data);
}

export interface PlayerHistoryEntry {
  gw: number;
  minutes: number;
  points: number;
  goals: number;
  assists: number;
  bonus: number;
  /** Defensive Contribution award, 0 or 2. `points` above already includes it. */
  defconPoints: number;
}

export interface PlayerHistory {
  playerId: number;
  history: PlayerHistoryEntry[];
}

/** `GET /players/:id/history` */
export async function getPlayerHistory(id: number): Promise<ApiResponse<PlayerHistory>> {
  const res = await apiFetch<PlayerHistory>(`/players/${id}/history`);
  if (!res.success || !res.data) return asFailure<PlayerHistory>(res);
  return ok(res.data);
}

/**
 * One player's season so far, summed across every gameweek he has played.
 *
 * `cleanSheets` is a count, not a per-match flag. Points are summed per gameweek by the server,
 * never scored from these totals — appearance points are a per-MATCH term, so two 90-minute games
 * pay two appearances and an aggregated 180-minute "match" would pay one.
 */
export interface SeasonPlayerStats {
  playerId: number;
  name: string;
  club: string;
  pos: PositionCode;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  bonus: number;
  cleanSheets: number;
}

/**
 * `GET /players/season-stats` — every player's season totals, in ONE request.
 *
 * Replaces `TransferListPane.warmAggregates`, which called `getPlayerHistory` once per player so
 * the list could sort by goals, assists and minutes — ~682 requests to answer something the
 * database answers once. Only players with at least one appearance come back; the client already
 * holds everyone's identity from `GET /players`.
 *
 * Includes the gameweek in play, deliberately. Sorting the transfer list by goals used to stop at
 * `displayGW - 1`, so a manager comparing players mid-round was shown numbers that excluded the
 * round they were watching — the same omission the متعب report started from.
 */
export async function getSeasonStats(): Promise<ApiResponse<SeasonPlayerStats[]>> {
  const res = await apiFetch<SeasonPlayerStats[]>('/players/season-stats');
  if (!res.success || !res.data) return asFailure<SeasonPlayerStats[]>(res);
  return ok(res.data);
}

/** `GET /players/injuries` — active injury/doubt/suspension news. */
export async function getInjuries(): Promise<ApiResponse<Player[]>> {
  const res = await apiFetch<Player[]>('/players/injuries');
  if (!res.success || !res.data) return asFailure<Player[]>(res);
  return ok(res.data);
}

export interface PriceChangeEntry {
  id: number;
  name: string;
  club: string;
  pos: PositionCode;
  price: number;
  change: number;
  changedAt: string;
}

export interface PriceChanges {
  risers: PriceChangeEntry[];
  fallers: PriceChangeEntry[];
}

const DEFAULT_PRICE_WINDOW_HOURS = 24;

/**
 * `GET /players/price-changes?window=` — backed by a nightly admin job on
 * the server; an empty `{risers:[],fallers:[]}` on a fresh/unseeded DB is a
 * normal result, not a failure.
 */
export async function getPriceChanges(windowHours = DEFAULT_PRICE_WINDOW_HOURS): Promise<ApiResponse<PriceChanges>> {
  const res = await apiFetch<PriceChanges>('/players/price-changes', { query: { window: `${windowHours}h` } });
  if (!res.success || !res.data) return asFailure<PriceChanges>(res);
  return ok(res.data);
}
