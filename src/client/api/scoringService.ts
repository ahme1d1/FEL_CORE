import type { ChipKind } from '../data/chips.js';
import type { Squad } from '../data/initialSquad.js';
import type { BreakdownRow, PlayerMatchEvents } from '../lib/scoring.js';

import { asFailure, toChipKind } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { GWSquadSnapshot } from './snapshotsService.js';
import type { ApiResponse } from './types.js';

export interface PlayerGWScore {
  playerId: number;
  events: PlayerMatchEvents;
  rows: BreakdownRow[];
  /** Raw points before captaincy multiplier. */
  points: number;
  multiplier: 1 | 2 | 3;
  effectivePoints: number;
}

export interface SquadGWScore {
  gw: number;
  /**
   * Net of the transfer hit (`grossPoints - transferCost`) — matches
   * FEL_API's `ClientGwScore.totalPoints` semantics exactly, so consumers
   * can read this field unchanged once scoring flips to the live API.
   */
  totalPoints: number;
  /** Raw squad points before any transfer-hit deduction. */
  grossPoints: number;
  /** Transfer-hit cost already subtracted out of `totalPoints`. */
  transferCost: number;
  xi: PlayerGWScore[];
  bench: PlayerGWScore[];
  autoSubs: { out: number; in: number }[];
  /** The armband as submitted for this gameweek, before any vice promotion. */
  captain: number;
  /** The vice as submitted. Becomes `effectiveCaptain` when the captain plays no minutes. */
  vice: number;
  /**
   * Who actually took the multiplier. Distinct from `captain` whenever the captain blanked and
   * the vice was promoted — which only happens once every fixture in the gameweek has finished.
   */
  effectiveCaptain: number;
  chip: ChipKind | null;
  /** Settled-only — `null` on a live/provisional score. */
  rank: number | null;
  overallRank: number | null;
  /**
   * Transfers made in this gameweek, Wildcard and Free Hit excluded — FPL's own rule, applied
   * server-side because a client counting its own history would include the chip weeks.
   *
   * `null`, not `0`, when the API has not sent it: the website can ship ahead of the API, and a
   * zero would claim the manager made none. The points screen renders `—` for null.
   */
  transfers: number | null;
  /** True for a persisted settlement result; false for a live/provisional compute. */
  isSettled: boolean;
  /**
   * Who this score belongs to, and the shape they lined up in — sent only by the two RIVAL score
   * reads (`GET /managers/:id/score`, `GET /leagues/:id/members/:memberId/score`), which is why
   * both are nullable. Your own `GET /gameweeks/:gw/score` carries neither and has no reason to:
   * you know your own name, and nothing on the points screen draws a formation.
   *
   * `manager` is what folded the rival team sheet's two requests into one — it was the only thing
   * the squad read carried that the score did not. `null` means the server predates step 25, and
   * the sheet answers by falling back to `GET /managers/:id/squad` for the name alone.
   */
  manager: { name: string; teamName: string } | null;
  formation: string | null;
}

/**
 * FEL_API's `ClientGwNotEntered` — the other thing a gameweek score read can answer.
 *
 * A manager holds no frozen snapshot for a gameweek that has already locked, so they were never
 * in it: they signed up after its deadline, or their squad was incomplete when it locked. Either
 * way settlement scores them 0, which is why the server refuses to score their CURRENT squad
 * against it — it used to, and a brand-new account was shown real points from fixtures that had
 * already finished, for a gameweek it was never in.
 */
export interface GwNotEntered {
  gw: number;
  entered: false;
  /** Which gameweek IS theirs, so the screen can say so. Null for accounts that predate the
   *  column, where the copy falls back to a gameweek-less sentence. */
  firstEligibleGw: number | null;
  /**
   * Same rival-only field as on the entered arm, and the arm where it matters most: there is no
   * payload to inspect here, so a sheet with no name and no fallback would have nothing to title
   * itself with. `null` on your own score and on a server that predates step 25.
   */
  manager: { name: string; teamName: string } | null;
}

/** What every gameweek score read returns. Narrow with `isNotEntered` before reading points. */
export type GwScoreResult = SquadGWScore | GwNotEntered;

export function isNotEntered(result: GwScoreResult): result is GwNotEntered {
  return (result as GwNotEntered).entered === false;
}

/**
 * The entered arm of a score read, or `null` — for the surfaces that render a bare number and
 * already show `—` when there isn't one (the home tiles, the squad sidebar).
 *
 * Collapsing "the request failed" and "they weren't in this gameweek" into the same `null` is
 * deliberate HERE and nowhere else: both mean this tile has no number to show, and a tile is too
 * small to explain which. The screens with room to explain — the points page, the manager team
 * sheet — narrow with `isNotEntered` themselves and say so in words.
 */
export function enteredScore(res: ApiResponse<GwScoreResult>): SquadGWScore | null {
  if (!res.success || !res.data || isNotEntered(res.data)) return null;
  return res.data;
}

/**
 * Resolve which squad + chip to score for a gameweek. A locked/live/finished
 * GW has a frozen snapshot (captured at its deadline) — score that. Only the
 * still-open editing GW, which has no snapshot yet, scores the live squad.
 * This is what keeps past-GW points stable when the current team changes.
 *
 * Takes the already-resolved snapshot for the GW in question (fetched via
 * `squadStore.getSnapshot(gw)`) rather than a full map — FEL_API only
 * exposes a single-GW snapshot read, so callers await just the GW they need.
 */
export function resolveSquadForGW(
  snapshot: GWSquadSnapshot | null,
  liveSquad: Squad,
  liveChip: ChipKind | null
): { squad: Squad; chip: ChipKind | null } {
  if (snapshot) return { squad: snapshot.squad, chip: snapshot.chip };
  return { squad: liveSquad, chip: liveChip };
}

/** FEL_API's `ClientPlayerScore` (`GET /gameweeks/:gw/score`, `/live`) — `rows` is the same `BreakdownRow[]` shape as the local rules engine, nested per-player (not a top-level `playerScores[].breakdownJson`, despite an earlier assumption). */
interface ClientPlayerScoreDTO {
  playerId: number;
  events: PlayerMatchEvents;
  rows: BreakdownRow[];
  points: number;
  multiplier: number;
  effectivePoints: number;
}

/**
 * FEL_API's `ClientGwScore`. Exported — `leaguesService.ts`'s `getMemberScore`
 * hits a sibling endpoint (`GET /leagues/:id/members/:memberId/score`) that
 * returns this identical shape, so it reuses this DTO + `mapClientGwScore`
 * instead of duplicating the parsing.
 */
export interface ClientGwScoreEnteredDTO {
  gw: number;
  entered?: undefined;
  totalPoints: number;
  grossPoints: number;
  transferCost: number;
  xi: ClientPlayerScoreDTO[];
  bench: ClientPlayerScoreDTO[];
  autoSubs: { out: number; in: number }[];
  captain: number;
  vice: number;
  effectiveCaptain: number;
  chip: string | null;
  rank: number | null;
  overallRank: number | null;
  /** Absent from an API that predates it — see `SquadGWScore.transfers`. */
  transfers?: number;
  isSettled: boolean;
  /** Rival score reads only, and absent from an API that predates them — see `SquadGWScore.manager`. */
  manager?: { name: string; teamName: string };
  formation?: string;
}

/** FEL_API's `ClientGwNotEntered` on the wire. A separate arm rather than optional fields on the
 *  one above, so nothing can read `totalPoints` off a payload that does not carry it. */
export interface ClientGwNotEnteredDTO {
  gw: number;
  entered: false;
  firstEligibleGw: number | null;
  /** Rival score reads only — see `GwNotEntered.manager`. */
  manager?: { name: string; teamName: string };
}

/** What `GET /gameweeks/:gw/{score,live}` and the two manager-scoped score reads return. */
export type ClientGwScoreDTO = ClientGwScoreEnteredDTO | ClientGwNotEnteredDTO;

// Throws (like `toChipOrNull`) rather than silently coercing an out-of-range
// wire value to `1` — a malformed multiplier is a server/contract bug worth
// surfacing as a failure, not one that should quietly read as "no multiplier."
function toMultiplier(n: number): 1 | 2 | 3 {
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error(`Unrecognized multiplier from API: ${n}`);
}

function toChipOrNull(value: string | null): ChipKind | null {
  return value == null ? null : toChipKind(value);
}

/**
 * A played-nothing score.
 *
 * Its meaning is the CALLER'S to decide, which is why it is separate from the reads below. The
 * player profile uses it for a gameweek with no row, because a blank row in a season-long list is
 * survivable; Team of the Week must NOT, because a 0-point card under a shirt the same screen just
 * credited with 13 points is a contradiction, not a gap.
 *
 * `rows: []` and `points: 0` are stated outright rather than derived. They used to come from
 * running the client scoring mirror over an all-zero event set, which took the engine's
 * `minutes <= 0` early return — so this is the same answer, now written down instead of computed.
 * It takes no position for the same reason: with no minutes, nothing position-dependent applies.
 */
export function emptyPlayerGWScore(gw: number, playerId: number): PlayerGWScore {
  const events: PlayerMatchEvents = {
    playerId, gw, minutes: 0, goals: 0, assists: 0, cleanSheet: false, goalsConceded: 0,
    saves: 0, penSaved: 0, penMissed: 0, yellow: 0, red: 0, ownGoals: 0, bps: 0, bonus: 0,
    defconPoints: 0, defconActions: 0,
  };
  return { playerId, events, rows: [], points: 0, multiplier: 1, effectivePoints: 0 };
}

/**
 * `GET /players/:playerId/breakdown` — how one player earned his points, gameweek by gameweek,
 * scored BY THE SERVER.
 *
 * This used to run a hand-kept copy of the rules engine (`app/lib/scoring.ts`) over the player's
 * raw events, because the server explained a MANAGER'S OWN squad and nobody else. A rule added
 * there and not here did not fail — it silently made the player profile disagree with the points
 * screen by the missing term, which is how Defensive Contribution under-counted every qualifying
 * match by 2 until 2026-09-03. The endpoint exists so that copy could be deleted.
 *
 * `null` means the read did not answer. An empty array is a different fact — a player with no rows
 * yet — and callers that must not draw a fabricated blank have to branch on it themselves.
 */
export async function getPlayerSeasonScores(
  playerId: number
): Promise<PlayerGWScore[] | null> {
  const res = await apiFetch<ClientPlayerScoreDTO[]>(`/players/${playerId}/breakdown`);
  if (!res.success || !res.data) return null;
  try {
    return res.data.map(toPlayerGWScore);
  } catch {
    return null;
  }
}

/**
 * One gameweek of the above.
 *
 * `null` covers both "the read was refused" and "this player has no row for that gameweek", which
 * is what the previous client-scored version returned too — Team of the Week opens the profile
 * instead of drawing a 0-point card, and the profile substitutes `emptyPlayerGWScore`. Keeping the
 * two indistinguishable is deliberate here: neither caller can act on the difference, and a screen
 * that could would use the season read above.
 */
export async function getPlayerGWScore(
  gw: number,
  playerId: number
): Promise<PlayerGWScore | null> {
  const res = await apiFetch<ClientPlayerScoreDTO[]>(`/players/${playerId}/breakdown`, {
    query: { gw },
  });
  if (!res.success || !res.data || res.data.length === 0) return null;
  try {
    return toPlayerGWScore(res.data[0]!);
  } catch {
    return null;
  }
}

function toPlayerGWScore(p: ClientPlayerScoreDTO): PlayerGWScore {
  return {
    playerId: p.playerId,
    events: p.events,
    rows: p.rows,
    points: p.points,
    multiplier: toMultiplier(p.multiplier),
    effectivePoints: p.effectivePoints,
  };
}

/**
 * May throw (via `toChipOrNull`/`toMultiplier`) on an unrecognized chip code
 * or multiplier — callers must wrap in try/catch. Exported for
 * `leaguesService.ts`'s `getMemberScore` — see `ClientGwScoreDTO`'s doc.
 */
export function mapClientGwScore(dto: ClientGwScoreDTO): GwScoreResult {
  if (dto.entered === false) {
    return {
      gw: dto.gw,
      entered: false,
      firstEligibleGw: dto.firstEligibleGw ?? null,
      manager: dto.manager ?? null,
    };
  }
  return {
    gw: dto.gw,
    totalPoints: dto.totalPoints,
    grossPoints: dto.grossPoints,
    transferCost: dto.transferCost,
    xi: dto.xi.map(toPlayerGWScore),
    bench: dto.bench.map(toPlayerGWScore),
    autoSubs: dto.autoSubs,
    captain: dto.captain,
    vice: dto.vice,
    effectiveCaptain: dto.effectiveCaptain,
    chip: toChipOrNull(dto.chip),
    rank: dto.rank,
    overallRank: dto.overallRank,
    // `?? null`, never `?? 0`: deploy skew is a real state here, and "we do not know" and "none"
    // are different answers to draw.
    transfers: dto.transfers ?? null,
    isSettled: dto.isSettled,
    // Same rule as `transfers` above, for the same reason: absent means "this server does not send
    // it", which the team sheet answers with a second request — not with an empty name.
    manager: dto.manager ?? null,
    formation: dto.formation ?? null,
  };
}

/**
 * `GET /gameweeks/:gw/score`. The server is authoritative once a GW is
 * settled, so `squad`/`chip`/`transferCost` are unused here — kept in the
 * signature so every existing call site (which resolves them via
 * `resolveSquadForGW` first, not knowing settled-vs-open ahead of time) can
 * stay as-is. Never 404s `GAMEWEEK_NOT_SETTLED` — the server falls back to a
 * live-computed score (`isSettled: false` in the response) whenever no settled
 * row exists yet, so callers can render the result unconditionally. It can
 * still fail with `NOT_FOUND`/`SQUAD_INVALID` if the manager has no valid
 * squad (no captain/vice) for that GW yet.
 *
 * Can also resolve to the `GwNotEntered` arm — a 200, not a failure — when the manager was never
 * in the gameweek. Narrow with `isNotEntered` before reading points; rendering that arm as `0`
 * is wrong in the other direction (it claims they played and scored nothing).
 */
export async function getSquadGWScore(
  gw: number,
  _squad: Squad,
  _chip: ChipKind | null,
  _transferCost = 0
): Promise<ApiResponse<GwScoreResult>> {
  const res = await apiFetch<ClientGwScoreDTO>(`/gameweeks/${gw}/score`);
  if (!res.success || !res.data) return asFailure(res);
  try {
    return ok(mapClientGwScore(res.data));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown score data from API';
    return { success: false, data: null, error: message };
  }
}

/**
 * `GET /gameweeks/:gw/live` — open-live polling, same `ClientGwScore` shape
 * as `/score` but computed fresh from in-progress events. Callers must gate
 * on `phase === 'live'` before calling this.
 *
 * `rank`/`overallRank` used to be documented here as ALWAYS `null` on this
 * path. Since step 15 the server populates them from the live-rank table
 * whenever a live pass has run, so they are null only before the first pass
 * of a gameweek (or with the feature off) — both already covered, since the
 * fields are typed nullable and every consumer renders `—`.
 */
export async function getLiveSquadGWScore(gw: number): Promise<ApiResponse<GwScoreResult>> {
  const res = await apiFetch<ClientGwScoreDTO>(`/gameweeks/${gw}/live`);
  if (!res.success || !res.data) return asFailure(res);
  try {
    return ok(mapClientGwScore(res.data));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown live score data from API';
    return { success: false, data: null, error: message };
  }
}

// ── Gameweek top score ──────────────────────────────────────────

export interface GWHighest {
  managerName: string;
  teamName: string;
  chip: ChipKind | null;
  score: SquadGWScore;
}

/**
 * `GET /gameweeks/:gw/prize-winner` — the highest scorer who played NO chip that gameweek.
 *
 * Deliberately not the same thing as `GWHighest`: the leaderboard keeps ranking the true top
 * scorer, chips and all, while the weekly prize goes to whoever won the week without one. No
 * `chip` field, because by definition there isn't one.
 */
export interface GWPrizeWinner {
  /** Who to mark on a board. Display names are not unique, so never match this manager by name. */
  managerId: string;
  managerName: string;
  teamName: string;
  score: SquadGWScore;
}

export interface GWStats {
  average: number;
  highest: number;
}

/**
 * `GET /gameweeks/:gw/stats` — `{average, highest}`, live from the gameweek being played or settled
 * once it is scored. Still 404s `GAMEWEEK_NOT_SETTLED` for a gameweek with neither — one that has
 * not locked, or whose live pass has not run — so callers must keep rendering `—` rather than `0`.
 */
export async function getGWStats(gw: number): Promise<ApiResponse<GWStats>> {
  const res = await apiFetch<GWStats>(`/gameweeks/${gw}/stats`);
  if (!res.success || !res.data) return asFailure(res);
  return ok(res.data);
}

interface ClientGwHighestDTO {
  managerName: string;
  teamName: string;
  chip: string | null;
  score: ClientGwScoreDTO;
}

interface ClientGwPrizeWinnerDTO {
  managerId: string;
  managerName: string;
  teamName: string;
  score: ClientGwScoreDTO;
}

/**
 * `GET /gameweeks/:gw/prize-winner` — the chip-free top scorer, or `null` when every manager
 * played a chip that gameweek. `null` is a real answer here, not a failure: the caller shows
 * "no winner this week" rather than an error.
 */
export async function getGWPrizeWinner(gw: number): Promise<ApiResponse<GWPrizeWinner | null>> {
  const res = await apiFetch<ClientGwPrizeWinnerDTO | null>(`/gameweeks/${gw}/prize-winner`);
  if (!res.success) return asFailure(res);
  if (!res.data) return ok(null);
  try {
    const score = mapClientGwScore(res.data.score);
    // Same invariant as `getGWHighest`: this manager came out of a settled score row, which only
    // ever exists alongside a frozen snapshot.
    if (isNotEntered(score)) {
      return { success: false, data: null, error: 'Prize winner has no team for this gameweek.' };
    }
    return ok({
      managerId: res.data.managerId,
      managerName: res.data.managerName,
      teamName: res.data.teamName,
      score,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown prize-winner data from API';
    return { success: false, data: null, error: message };
  }
}

/** `GET /gameweeks/:gw/highest` — the GW's top-scoring manager's full breakdown. */
export async function getGWHighest(gw: number): Promise<ApiResponse<GWHighest>> {
  const res = await apiFetch<ClientGwHighestDTO>(`/gameweeks/${gw}/highest`);
  if (!res.success || !res.data) return asFailure(res);
  try {
    const score = mapClientGwScore(res.data.score);
    // The gameweek's top scorer came out of a settled score row, and settlement only ever writes
    // one from a frozen snapshot — so the not-entered arm is not reachable here. Fail loudly if
    // the server ever contradicts that rather than rendering an empty pitch as a top score.
    if (isNotEntered(score)) {
      return { success: false, data: null, error: 'Highest scorer has no team for this gameweek.' };
    }
    return ok({
      managerName: res.data.managerName,
      teamName: res.data.teamName,
      chip: toChipOrNull(res.data.chip),
      score,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown highest-score data from API';
    return { success: false, data: null, error: message };
  }
}
