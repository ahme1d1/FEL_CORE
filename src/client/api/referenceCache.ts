// Explicit import (unlike sibling files in this directory) because Vitest has
// no Nuxt auto-import transform — this file is reached by suites like
// squadSwap.test.ts via app/lib/squadSwap.ts, and dropping it breaks them with a
// `ReferenceError: ref is not defined` even though it's inert in the real app.
import { cell } from '../platform/reactivity.js';

import {
  clubName,
  clubShort,
  clubCity,
  clubVenue,
  type Club,
  type EmblemId,
  type Kit,
  type KitPattern,
} from '../data/clubs.js';
import {
  ptsPerMatch,
  type Player,
  type FormHistoryEntry,
  type PlayerRank,
  type RankableStat,
} from '../data/players.js';

import { getClubs } from './clubsService.js';
import { hydrated as rulesHydrated } from './rulesCache.js';
import { ensureRules } from './rulesBoot.js';
import { listPlayers } from './playersService.js';
import { singleFlight, type SingleFlightCache } from './singleFlight.js';

export type { Club, EmblemId, Kit, KitPattern, Player, FormHistoryEntry, PlayerRank, RankableStat };
export { clubName, clubShort, clubCity, clubVenue, ptsPerMatch };

/**
 * Unified live reference-data cache for players + clubs — the API is the ONLY
 * source. There is no static fallback dataset anymore: the frontend ships zero
 * season data, so `MARKET`/`CLUBS` start empty and stay empty until
 * `hydrateReferenceCache()` succeeds. Consumers gate on `hydrated` (skeletons)
 * and surface `hydrationError` with a retry — never render the empty arrays as
 * if they were data.
 *
 * ## Two populations, deliberately not one list
 *
 * This module used to export a single `PLAYERS` array hydrated from `GET /players`, and
 * every consumer read it for one of two unrelated jobs:
 *
 *   - **browse/buy** — "what may this manager transfer in?"
 *   - **resolve** — "the API just handed me player id 15; who is that?"
 *
 * `GET /players` is the transfer market and is filtered `isActive: true`, correctly. Using
 * it for the second job is what broke: the 2026/27 roster rebuild delisted 170 players, and
 * every squad still holding one rendered *short* — `pBy()` missed, and the pitch components
 * drop a tile whose player won't resolve. The squad value silently lost that player's sell
 * price too, and the transfer list couldn't offer the one action that would fix it.
 *
 * So the cache now hydrates with `scope: 'all'` and the two jobs get two names:
 *
 *   - `pBy(id)` — resolves ANY id the API can hand back, delisted included. Total by design.
 *   - `MARKET` — the buyable subset. Every browse/buy surface reads this.
 *
 * There is deliberately no exported "all players as an array". Removing it is what makes the
 * inverse hazard — a delisted player leaking into a buy surface — a compile error rather than
 * something each call site has to remember.
 *
 * `MARKET`/`CLUBS` are `let` bindings, not `const` — ES module bindings are
 * live references, so reassigning them here (on successful hydration) is
 * visible to every importer with no reactivity plumbing needed on the data
 * itself. Only the hydration *gate* (`hydrated`) needs to be a real Vue ref.
 *
 * ⚠️ That last part used to end "so no consumer's computed ever runs before
 * `hydrated` opens", on the grounds that pages gate their `ready` computed on a
 * `hydrated` flag. Pages do. The overlays `AppOverlayHost` mounts
 * unconditionally at boot do not, and a `computed` calling `pBy()` there
 * resolves to `undefined` and never recovers, because a plain `Map` read is
 * invisible to Vue. Inside a `computed`, use `pByLive`/`clubByLive`.
 */
export let MARKET: Player[] = [];
export let CLUBS: Club[] = [];

let playerById: ReadonlyMap<number, Player> = new Map();
let clubById: ReadonlyMap<string, Club> = new Map();

/**
 * Resolve a player id to a record — including delisted players, who stay owned and on the
 * pitch. Never use the result as evidence that a player is buyable; check `isActive` (or
 * read `MARKET`) for that.
 */
export function pBy(id: number): Player | undefined {
  return playerById.get(id);
}

export function clubBy(id: string): Club | undefined {
  return clubById.get(id);
}

/**
 * `pBy`/`clubBy` as REACTIVE reads — use these inside a `computed`.
 *
 * The plain lookups above read a module-scoped `Map` that Vue cannot track, so a
 * `computed(() => pBy(id))` has no dependency on hydration at all: on a cold load it evaluates to
 * `undefined`, caches, and is never invalidated when the data arrives. These touch the `hydrated`
 * gate — the one genuinely reactive thing here — so the computed re-runs when it opens.
 *
 * The doc above this section used to claim no consumer's computed could run before hydration,
 * because pages gate their `ready` on a `hydrated` flag. That holds for pages. It does not hold
 * for the overlays `AppOverlayHost` mounts unconditionally at boot, and a deep link to
 * `?overlay=playerProfile&playerId=N` rendered «لاعب غير موجود» permanently as a result — the
 * template's own hydration gate made it worse, deferring the wrong answer rather than preventing
 * it. The dependency lives in here rather than in each call site so it cannot be forgotten again.
 *
 * `null`/`undefined` ids answer `undefined`: an overlay's `playerId` prop is absent until the
 * route query is read.
 */
export function pByLive(id: number | null | undefined): Player | undefined {
  void hydrated.value;
  return id == null ? undefined : playerById.get(id);
}

export function clubByLive(id: string | null | undefined): Club | undefined {
  void hydrated.value;
  return id == null ? undefined : clubById.get(id);
}

// `recentFormHistory()` was removed here (QA-44). It manufactured a player's
// last N gameweeks — opponent, home/away and a points total — from a seeded
// pseudo-random function anchored to a hardcoded GW 14, with no network call,
// and the player sheets rendered the result as completed matches. Real
// per-gameweek history comes from match events; see `PlayerProfileContent`.

export function playerRanking(playerId: number, key: RankableStat): PlayerRank {
  const target = pBy(playerId);
  if (!target) return { rank: 0, total: 0 };
  // A delisted player has no place in a ranking of players you could buy. `total: 0` is the
  // "no rank" signal the sheets already honour (`v-if="s.rank.total > 0"`); returning a real
  // denominator with a rank of 0 printed "0 / 124" on their sheet, which reads as last place
  // rather than as not-applicable.
  if (!target.isActive) return { rank: 0, total: 0 };
  // Ranked against the market: a manager comparing players is comparing buyable ones, and
  // padding the denominator with delisted players would quietly deflate every rank.
  const peers = MARKET.filter((p) => p.pos === target.pos);
  const sorted = [...peers].sort((a, b) => b[key] - a[key]);
  const idx = sorted.findIndex((p) => p.id === playerId);
  return { rank: idx >= 0 ? idx + 1 : 0, total: peers.length };
}

/** Opens once `MARKET`/`CLUBS` hold real API data. Never opens on failure. */
export const hydrated = cell(false, 'referenceCache.hydrated');

/**
 * Set when a hydration attempt fails end-to-end (and cleared by the next
 * successful one). `hydrated === false && hydrationError !== null` is the
 * app-zone error state: no data to render, show retry.
 */
export const hydrationError = cell<string | null>(null, 'referenceCache.hydrationError');

const cache: SingleFlightCache<void> = { current: null };

async function doHydrate(): Promise<void> {
  // `scope: 'all'` is the whole point: this cache backs `pBy()`, which must resolve every id
  // the API can hand back in a squad, snapshot, score or ledger — not just the ones still on
  // sale. `MARKET` is derived from it below.
  //
  // `ensureRules()` joins the same wait and is normally a no-op: `GET /bootstrap` carries the
  // rules, and it JOINS that request rather than adding one, so by the time the player read
  // finishes they are already in hand. It fires `GET /rules` only when they are not — a bootstrap
  // that failed, or a surface reached without one — and it is the reason no consumer has to hold a
  // fallback constant of its own. It used to live here; `rulesBoot.ts` explains why it moved, and
  // why this caller takes the UNBOUNDED twin.
  const [playersRes, clubsRes] = await Promise.all([
    listPlayers({ scope: 'all' }),
    getClubs(),
    ensureRules(),
  ]);
  // All-or-nothing: swapping only one of the player/club halves on a partial failure
  // would pair live player rows against missing club IDs (or vice versa), and
  // `clubBy()`/`pBy()` would silently miss for the live half.
  // Rules join the all-or-nothing condition. A squad screen that renders with players but no
  // rules would validate against nothing at all, which is worse than a skeleton.
  if (playersRes.success && playersRes.data && clubsRes.success && clubsRes.data && rulesHydrated.value) {
    playerById = new Map(playersRes.data.map((p) => [p.id, p]));
    MARKET = playersRes.data.filter((p) => p.isActive);
    CLUBS = clubsRes.data;
    clubById = new Map(CLUBS.map((c) => [c.id, c]));
    hydrated.value = true;
    hydrationError.value = null;
    return;
  }
  hydrationError.value =
    (!playersRes.success ? playersRes.error : null) ??
    (!clubsRes.success ? clubsRes.error : null) ??
    (!rulesHydrated.value ? 'RULES_HYDRATION_FAILED' : null) ??
    'REFERENCE_HYDRATION_FAILED';
}

/**
 * Single-flighted boot hydration — `/players` and `/clubs` need no auth
 * (`OptionalJwtAuthGuard`), so this can and should start immediately on
 * client boot regardless of session state. Called once from
 * `app/plugins/api-client.client.ts`, fire-and-forget (not awaited) so it
 * never delays marketing/auth pages that don't read this cache.
 *
 * Safe to call again after a failure: `singleFlight` clears its slot when the
 * attempt settles, so a later call starts a fresh attempt (that's what
 * `retryHydration` is).
 */
export function hydrateReferenceCache(): Promise<void> {
  return singleFlight(cache, doHydrate);
}

/** User-triggered retry from the error state. */
export function retryHydration(): Promise<void> {
  return hydrateReferenceCache();
}

/**
 * Test-only seam: Vitest suites (squadSwap/transfers/autoCaptain/…) need deterministic
 * reference data without a network. Never call from app code.
 */
export function __setReferenceDataForTests(players: Player[], clubs: Club[]): void {
  // Mirrors `doHydrate` exactly — `players` is the FULL reference set (the `scope: 'all'`
  // payload), and `MARKET` is derived from it. A suite that wants a delisted player passes
  // one with `isActive: false` and gets the real production behaviour: resolvable by id,
  // absent from the market.
  playerById = new Map(players.map((p) => [p.id, p]));
  MARKET = players.filter((p) => p.isActive);
  CLUBS = clubs;
  clubById = new Map(clubs.map((c) => [c.id, c]));
  hydrated.value = true;
  hydrationError.value = null;
}

/**
 * Test-only seam: return the cache to its cold, pre-hydration state. Needed to exercise the
 * boot-race the reactive lookups exist for — a suite cannot observe hydration landing if the
 * previous test left the cache full. Never call from app code.
 */
export function __resetReferenceCacheForTests(): void {
  playerById = new Map();
  MARKET = [];
  CLUBS = [];
  clubById = new Map();
  hydrated.value = false;
  hydrationError.value = null;
}
