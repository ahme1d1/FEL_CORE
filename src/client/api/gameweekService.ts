import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';
import { rules } from './rulesCache.js';

// There is deliberately no DEFAULT_GW. It existed as a fetch-failure fallback
// and told every user it was "Gameweek 14" during any backend hiccup (QA-10).
// An unknown gameweek is represented by `useGameweekStore().hydrated === false`.

/**
 * The highest gameweek this season has — the bound every stepper and route check clamps to.
 *
 * Read from the server, which counts it out of the `Gameweek` table. It used to be `MAX_GW = 20`
 * written here and hand-raised when rounds were created; the API's own `SEASON_GAMEWEEKS` constant
 * says 38, a Premier League count this competition has never had, and reading a season bound from
 * a constant rather than the table is what took `GET /leagues/:id/h2h` down permanently for every
 * league.
 *
 * Distinct from `firstStageStop()` below: this is how far you can NAVIGATE, that is how long the
 * season currently is. Home prints the second one.
 */
export function maxGw(): number {
  return rules().season.gameweeks;
}

/**
 * The last gameweek of the first stage — what «الجولة n / 19» counts against.
 *
 * The league splits into championship/relegation groups after it and those rounds do not exist
 * yet, so this is the only honest denominator for a season progress figure. Printing `maxGw()`
 * there would claim a gameweek that has not been created.
 */
export function firstStageStop(): number {
  return rules().season.firstStageLastGw;
}

export interface GWSnapshot {
  gw: number;
  points: number;
  captain: number;
  totalPoints: number;
  rank: number;
  ts: number;
}

export interface GWDeadline {
  gw: number;
  /** Deadline ISO — exactly DEADLINE_LEAD_MS before the first kickoff. */
  iso: string;
  /** First match kickoff ISO (the GW anchor everything else derives from). */
  firstKickoffIso: string;
  /** When the last match ends — the live → finished boundary. */
  liveEndIso: string;
  label: string;
  isLocked: boolean;
}

/**
 * Gameweek lifecycle — server-owned:
 *  - open     → before the deadline: squad/transfers editable
 *  - locked   → deadline passed, first match not yet kicked off (the ~2h
 *               pre-kickoff window): editing frozen, nothing live yet
 *  - live     → matches in progress: frozen lineup scoring
 *  - finished → all matches over, points final
 */
export type GWPhase = 'open' | 'locked' | 'live' | 'finished';

export interface GWState {
  gw: number;
  deadline: GWDeadline;
  phase: GWPhase;
  /**
   * Whether this gameweek has been scored. The client must not infer it from
   * the gameweek number: a gameweek settled out of order sits *above*
   * `currentGW` while holding real points (QA-41).
   */
  settled: boolean;
}

/**
 * Whether a match of the watched gameweek is being played right now.
 *
 * Two clauses, because either alone is wrong. `inPlayUntilIso` is a server snapshot and goes
 * stale in a tab left open; `nextKickoffIso` lets that tab flip to live on its own clock the
 * moment a kickoff passes, without waiting for a refetch — the same concern as the gameweek
 * rollover fix.
 */
export function isMatchInPlay(matches: GwMatches, now: number = Date.now()): boolean {
  const until = matches.inPlayUntilIso ? Date.parse(matches.inPlayUntilIso) : NaN;
  if (!Number.isNaN(until) && now < until) return true;
  const next = matches.nextKickoffIso ? Date.parse(matches.nextKickoffIso) : NaN;
  return !Number.isNaN(next) && now >= next;
}

/** Derive the live phase from the anchor boundaries and the current clock. */
export function phaseFromDeadline(deadline: GWDeadline, now: number = Date.now()): GWPhase {
  if (now < Date.parse(deadline.iso)) return 'open';
  if (now < Date.parse(deadline.firstKickoffIso)) return 'locked';
  if (now < Date.parse(deadline.liveEndIso)) return 'live';
  return 'finished';
}

/** FEL_API's `ClientGwMeta`/`ClientGwDeadline` (`GET /gameweeks/:gw`) — field names already match `GWDeadline` 1:1. */
interface LiveGwMeta {
  gw: number;
  deadline: GWDeadline;
  displayPhase: string;
  settled?: boolean;
}

const GW_PHASES: readonly GWPhase[] = ['open', 'locked', 'live', 'finished'];

function toGWPhase(value: string): GWPhase {
  if ((GW_PHASES as readonly string[]).includes(value)) return value as GWPhase;
  throw new Error(`Unknown gameweek phase from API: ${value}`);
}

/**
 * "The gameweek is not known yet" — never a real gameweek number.
 *
 * Lives here rather than in `stores/gameweek.ts` so the stores that revalidate on a ROLL can read
 * it without importing each other: `stores/transfers.ts` and `stores/squad.ts` both need to tell a
 * roll from this resolving, and importing the gameweek STORE from either one is a cycle that fails
 * at runtime as a TDZ error inside a watcher — silently, since Vue only logs it.
 */
export const UNKNOWN_GW = 0;

export async function getGWState(gw: number): Promise<ApiResponse<GWState>> {
  const res = await apiFetch<LiveGwMeta>(`/gameweeks/${gw}`);
  if (!res.success || !res.data) return { success: false, data: null, error: res.error, code: res.code };
  try {
    return ok({
      gw: res.data.gw,
      deadline: res.data.deadline,
      phase: toGWPhase(res.data.displayPhase),
      settled: res.data.settled === true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown gameweek data from API';
    return { success: false, data: null, error: message };
  }
}

/** `GET /gameweeks/history` — server-derived `@CurrentUser`, no params needed. */
export async function getHistory(): Promise<ApiResponse<GWSnapshot[]>> {
  const res = await apiFetch<GWSnapshot[]>('/gameweeks/history');
  if (!res.success || !res.data) return { success: false, data: null, error: res.error, code: res.code };
  return ok(res.data);
}

/**
 * `GET /gameweeks/current` — the whole `ClientGwCurrent` payload, and the only reader of that
 * endpoint. A `getCurrentGW()` that unwrapped `.currentGW` alone stood beside this and made the
 * store request the same URL twice on every boot; it is gone. The server computes
 * `displayGW` from settlement state directly, so `gameweek.ts` reads it
 * straight off this instead of inferring it client-side.
 */
export interface GwCurrentFull {
  currentGW: number;
  displayGW: number;
  deadline: GWDeadline;
  /** Phase of the WATCHED gameweek (`displayGW`), not the editing one. */
  displayPhase: GWPhase;
  /** Whether `displayGW` has been scored. */
  displaySettled: boolean;
  /**
   * Every gameweek of the current season whose deadline has passed, ascending — the ones that have
   * actually started, and so the only ones with a leaderboard worth showing.
   *
   * Server-derived, never inferred here. `1..displayGW` looks equivalent and is not: gameweek
   * numbers are globally unique ACROSS seasons, so that range would drag last season's gameweeks
   * along from season two onward, and `displayGW` falls back to the still-open editing gameweek
   * before any deadline has passed — which would advertise GW1 hours before it exists. Same
   * client-side inference QA-41 already rejected once for `settled`.
   */
  startedGWs: number[];
  /**
   * Real match state for `displayGW` — whether a fixture is being played *right now*, and when
   * the next one starts.
   *
   * `displayPhase` cannot answer that. It derives from three timestamp columns and never looks
   * at a fixture, so it reports `live` for the entire window between first kickoff and
   * `liveEndAt` — ~56h for a gameweek spread over three match days, most of it with no football
   * being played. Every «مباشر» badge in the app hung off that.
   */
  matches: GwMatches;
}

export interface GwMatches {
  /** End of the in-play window of the match on now, else null. */
  inPlayUntilIso: string | null;
  /** Kickoff of the next fixture yet to start, else null. */
  nextKickoffIso: string | null;
}

interface LiveGwCurrentFull {
  currentGW: number;
  displayGW: number;
  deadline: GWDeadline;
  displayPhase: string;
  displaySettled?: boolean;
  startedGWs?: number[];
  matches?: Partial<GwMatches>;
}

export async function getGwCurrentFull(): Promise<ApiResponse<GwCurrentFull>> {
  const res = await apiFetch<LiveGwCurrentFull>('/gameweeks/current');
  if (!res.success || !res.data) return { success: false, data: null, error: res.error, code: res.code };
  try {
    return ok({
      ...res.data,
      displayPhase: toGWPhase(res.data.displayPhase),
      displaySettled: res.data.displaySettled === true,
      // `?? []` so a client running against an API that predates step 15 simply shows no gameweek
      // boards, rather than throwing on a missing field.
      startedGWs: res.data.startedGWs ?? [],
      // An API predating this field simply never reports a live match, which is the safe
      // direction: no badge beats a badge that lies.
      matches: {
        inPlayUntilIso: res.data.matches?.inPlayUntilIso ?? null,
        nextKickoffIso: res.data.matches?.nextKickoffIso ?? null,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown gameweek data from API';
    return { success: false, data: null, error: message };
  }
}

