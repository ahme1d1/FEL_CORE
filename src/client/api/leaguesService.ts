import { derive } from '../platform/reactivity.js';

import type { ChipKind } from '../data/chips.js';
import type { Squad } from '../data/initialSquad.js';

import { asFailure, mapPage, toChipKind, toFormationId, toLeagueType, type PaginatedRaw } from './adapters.js';
import { apiFetch, ok } from './client.js';
import {
  mapClientGwScore,
  type ClientGwScoreDTO,
  type GwScoreResult,
} from './scoringService.js';
import * as session from './session.js';
import type { ApiPage, ApiResponse } from './types.js';

export interface LeagueMember {
  id: string;
  name: string;
  teamName: string;
  totalPts: number;
  gwPts: number;
  rank: number;
  /**
   * Places gained in this league since the previous settled gameweek; positive is up. `null` when
   * there is no previous standing to compare against — never `0`, which would claim the member
   * held a position they may never have held.
   *
   * **Optional on purpose.** Until the API ships this field it is simply absent, and
   * `toRankMovement` answers `null` for a missing one, so the boards draw no arrows instead of a
   * column of dashes. Do not default it to `0` to make the type tidier.
   */
  movement?: number | null;
}

export type LeagueType = 'classic' | 'h2h';

/**
 * The viewer's own line in one league — what the leagues hub renders, one row per league.
 *
 * Null, never 0, throughout: 0 is a claim ("first place", "held station") and null is the absence
 * of one. The hub draws a dash for null.
 */
export interface MyStanding {
  rank: number | null;
  /** Their position after the previous settled gameweek. */
  lastRank: number | null;
  /** Signed places gained, positive up — the same shape as `LeagueMember.movement`. */
  movement: number | null;
}

export interface League {
  id: string;
  code: string;
  name: string;
  type: LeagueType;
  createdAt: number;
  members: LeagueMember[];
  isOwner: boolean;
  /**
   * The viewer's own standing in this league.
   *
   * **Optional for the same deploy-skew reason as `LeagueMember.movement`** — an API that has not
   * shipped it omits it, and the hub then falls back to finding the viewer in `members[]` for a
   * CLASSIC league and shows a dash for Last Rank. Do not default it to zeros.
   *
   * ⚠️ **A H2H league has no fallback, and must not be given one.** `members[]` is ranked
   * classic-style by the server for BOTH league types, so on a H2H league those ranks are
   * cumulative-points positions and say nothing about the H2H table. A dash is honest; a number
   * taken from `members[]` would be confidently wrong.
   */
  my?: MyStanding;
  /**
   * The gameweek this league counts from — FPL's `start_event`.
   *
   * **`members[].totalPts` is points from this gameweek onward, not season points.** A league
   * created mid-season never counts what came before it, for anybody — not its founder, and not a
   * manager who joins later. So the Total column has to say which gameweek it counts from, or it
   * reads as a season total that is simply too small. `countsFromGameweek` in `app/lib/leagueStart`
   * decides when that label is owed.
   *
   * **Optional for the same deploy-skew reason as `my`** — an API that has not shipped it omits it,
   * and the label is then not drawn rather than drawn wrongly. `1` and `null` both mean "the whole
   * season" and earn no label either.
   */
  startGameweek?: number | null;
  /**
   * Whether this league refuses joins and leaves.
   *
   * FPL's rule: a H2H league locks once its fixtures are generated, at the start of its first
   * gameweek. Always false for a CLASSIC league — those stay joinable and leavable all season.
   *
   * **Read it; do not re-derive it.** Guessing from `startGameweek` against the current gameweek is
   * wrong for the case that matters: a league that reached its start with only one member holds no
   * fixtures, is NOT locked, and can still be joined. Absent (deploy skew) means "not known to be
   * locked", which keeps the Leave control where it has always been.
   */
  locked?: boolean;
}

/**
 * The real identity of "me" among league member IDs — real member IDs are
 * server `managerId` strings, resolved by `stores/auth.ts`'s identity
 * watcher into `session.managerId` once a session exists.
 */
export const myMemberId = derive(() => session.managerId.value ?? '', 'leagues.myMemberId');

function toLeague(raw: League): League {
  return { ...raw, type: toLeagueType(raw.type) };
}

/**
 * Runs a validating mapper (one that calls a throwing adapter like
 * `toLeagueType`/`toChipKind`) and converts a thrown contract-drift into a
 * clean failed `ApiResponse` instead of letting it escape as a rejected
 * promise — every live branch below reads server data through this, mirroring
 * the try/catch `clubsService.ts`/`scoringService.ts` already wrap their own
 * throwing adapters in.
 */
function safeMap<T>(fn: () => T): ApiResponse<T> {
  try {
    return ok(fn());
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unrecognized data from API';
    return { success: false, data: null, error: message };
  }
}

/** `GET /leagues` */
export async function listLeagues(): Promise<ApiResponse<League[]>> {
  const res = await apiFetch<League[]>('/leagues');
  if (!res.success || !res.data) return asFailure<League[]>(res);
  return safeMap(() => res.data!.map(toLeague));
}

/**
 * `POST /leagues`. `managerName`/`teamName`/`totalPts` are unused — kept in
 * the signature so call sites don't need updating; the server derives the
 * owner from the JWT and needs no identity args.
 */
export async function createLeague(
  name: string,
  type: LeagueType,
  _managerName: string,
  _teamName: string,
  _totalPts: number
): Promise<ApiResponse<League>> {
  const res = await apiFetch<League>('/leagues', { method: 'POST', body: { name, type } });
  if (!res.success || !res.data) return asFailure<League>(res);
  return safeMap(() => toLeague(res.data!));
}

/** `POST /leagues/join` — unused args, same reasoning as `createLeague`. */
export async function joinByCode(
  code: string,
  _managerName: string,
  _teamName: string,
  _totalPts: number
): Promise<ApiResponse<League>> {
  const res = await apiFetch<League>('/leagues/join', { method: 'POST', body: { code } });
  if (!res.success || !res.data) return asFailure<League>(res);
  return safeMap(() => toLeague(res.data!));
}

/** `DELETE /leagues/:id/membership` — returns the caller's remaining leagues. */
export async function leaveLeague(id: string): Promise<ApiResponse<League[]>> {
  const res = await apiFetch<League[]>(`/leagues/${id}/membership`, { method: 'DELETE' });
  if (!res.success || !res.data) return asFailure<League[]>(res);
  return safeMap(() => res.data!.map(toLeague));
}

/**
 * Re-fetch one league's standings. Takes the full `League` (not just its id):
 * `GET /leagues/:id/standings` returns member rows only, not league metadata,
 * so the caller's already-known metadata is merged back in.
 *
 * H2H leagues are a special case: `/standings` rows for an H2H league are
 * shaped differently (`played/w/d/l/h2hPts`, no `totalPts`/`gwPts`) than the
 * classic `LeagueMember` shape `League.members` expects — and H2H views only
 * ever read `id`/`name`/`teamName` off `members` (points/rank come from
 * `getH2HState`'s own table). So for H2H leagues this re-fetches `GET
 * /leagues` instead, which always embeds the classic-shaped member rows
 * regardless of league type (confirmed server-side: `listMine()` always
 * builds `members` via the same classic-rows path).
 *
 * `managerName`/`teamName`/`totalPts` are unused — kept in the signature so
 * call sites don't need updating.
 */
export async function refreshStandings(
  league: League,
  _managerName: string,
  _teamName: string,
  _totalPts: number
): Promise<ApiResponse<League | null>> {
  if (league.type === 'h2h') {
    const res = await apiFetch<League[]>('/leagues');
    if (!res.success || !res.data) return asFailure<League | null>(res);
    const found = res.data.find((l) => l.id === league.id);
    return safeMap(() => (found ? toLeague(found) : null));
  }
  const res = await apiFetch<PaginatedRaw<LeagueMember>>(`/leagues/${league.id}/standings`, {
    query: { per_page: 50 },
  });
  if (!res.success || !res.data) return asFailure<League | null>(res);
  return ok({ ...league, members: mapPage(res.data).items });
}

export interface MemberSquadResult {
  squad: Squad;
  /** The member's active chip for this GW, when the server reports one. */
  chip: ChipKind | null;
}

/**
 * FEL_API's `ClientSquadNotEntered` — this manager held no frozen lineup for a gameweek that has
 * already locked, so they were never in it. A state, not a failure: the boards list a manager from
 * the moment they join (membership there is an active profile, not a snapshot), so 404ing their
 * team made someone the board says exists look like someone it does not.
 */
export interface SquadNotEntered {
  entered: false;
  gw: number;
  firstEligibleGw: number | null;
}

/** A member's frozen lineup, or the fact that they had none. Narrow before reading `.squad`. */
export type MemberSquadOutcome = MemberSquadResult | SquadNotEntered;

export function isSquadNotEntered(outcome: MemberSquadOutcome): outcome is SquadNotEntered {
  return (outcome as SquadNotEntered).entered === false;
}

/** Wire shape of `GET /leagues/:id/members/:memberId/squad?gw=` (the realistic `ClientSnapshot` arm — a frozen past-deadline read). */
interface MemberSquadDTO {
  /** Present only on the not-entered arm; the frozen-lineup payload is unchanged. */
  entered?: false;
  firstEligibleGw?: number | null;
  gw?: number;
  xi: number[];
  bench: number[];
  captain: number | null;
  vice: number | null;
  formation: string;
  chip?: string | null;
}

/** Both squad routes answer not-entered with the same three fields — mapped in one place so the
 *  league-scoped and league-independent reads cannot drift on what the state means. */
function toSquadNotEntered(dto: MemberSquadDTO): SquadNotEntered {
  return { entered: false, gw: dto.gw ?? 0, firstEligibleGw: dto.firstEligibleGw ?? null };
}

/**
 * `GET /leagues/:id/members/:memberId/squad?gw=`.
 *
 * `gw` is optional, exactly as it is on `getMemberScore` below: the server resolves the latest
 * past-deadline gameweek when it is omitted. Naming one explicitly asks for a gameweek that may
 * not be visible yet, which the server correctly answers with `SQUAD_HIDDEN` — so callers that
 * have no particular gameweek in mind should let the server choose.
 *
 * ⚠️ **No caller since step 25, and kept deliberately.** `ManagerTeamSheet.vue` was the only one;
 * it now reads the score, which carries `manager` and `formation` too, and falls back to
 * `getManagerSquad` — the league-less twin — when a server predates those fields. This one needs
 * no fallback because a league open already has the member's name from the leagues store. The
 * route behind it is live and still the only squad read that enforces league membership
 * (`NOT_MEMBER`), it is the shape the admin dashboard's member-squad view shares, and a lineup
 * without points is a reasonable thing for the mobile port to want. Do not delete it for having no
 * call site — see `../FEL_API/CLAUDE.md` § "Routes that look dead and are not".
 */
export async function getMemberSquad(
  leagueId: string,
  memberId: string,
  gw?: number
): Promise<ApiResponse<MemberSquadOutcome>> {
  const res = await apiFetch<MemberSquadDTO>(
    `/leagues/${leagueId}/members/${memberId}/squad`,
    gw != null ? { query: { gw } } : {}
  );
  if (!res.success || !res.data) return asFailure<MemberSquadOutcome>(res);
  if (res.data.entered === false) return ok(toSquadNotEntered(res.data));
  const { xi, bench, captain, vice, formation, chip } = res.data;
  // A captain/vice-less squad is a broken server state for a resolved GW —
  // surface it as a failure rather than fabricate an armband (mirrors
  // squadService.toSquad()'s identical guard).
  if (captain == null || vice == null) {
    return { success: false, data: null, error: 'Member squad is missing captain/vice.' };
  }
  return safeMap(() => ({
    squad: { xi, bench, captain, vice, formation: toFormationId(formation) },
    chip: chip ? toChipKind(chip) : null,
  }));
}

/**
 * `GET /leagues/:id/members/:memberId/score?gw=`.
 *
 * `gw` is optional — the server defaults to the latest locked GW when
 * omitted. Response is the exact same `ClientGwScoreDTO` shape as `GET
 * /gameweeks/:gw/score`, so this reuses `scoringService.ts`'s
 * `mapClientGwScore` instead of duplicating the parsing.
 *
 * Never 404s `GAMEWEEK_NOT_SETTLED` — same live-compute fallback as
 * `getSquadGWScore` (`settled: false` on the response instead of an error).
 * Can still fail with (via `res.code`): `SQUAD_HIDDEN` (403) — the same
 * time-based privacy code `getMemberSquad` above already handles, reuse that
 * handling; `NOT_FOUND`/`SQUAD_INVALID` — the member has no valid squad for
 * that GW yet; `NOT_MEMBER`/`NOT_LEAGUE_MEMBER` (403) or `LEAGUE_NOT_FOUND`
 * (404) — generic failures, handled gracefully by the caller like any other
 * unexpected `ApiResponse` failure.
 */
export async function getMemberScore(
  leagueId: string,
  memberId: string,
  gw?: number
): Promise<ApiResponse<GwScoreResult>> {
  const res = await apiFetch<ClientGwScoreDTO>(
    `/leagues/${leagueId}/members/${memberId}/score`,
    gw != null ? { query: { gw } } : {}
  );
  if (!res.success || !res.data) return asFailure<GwScoreResult>(res);
  try {
    return ok(mapClientGwScore(res.data));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown score data from API';
    return { success: false, data: null, error: message };
  }
}

// ── Any manager, no league ──────────────────────────────────────

/** Who a squad belongs to — the boards' rows are league-less, so the name travels with the squad. */
export interface ManagerIdentity {
  name: string;
  teamName: string;
}

export interface ManagerSquadResult extends MemberSquadResult {
  manager: ManagerIdentity;
}

/** The not-entered arm of `GET /managers/:id/squad`. Carries the identity too — the overlay still
 *  has to title itself with whose team is missing, which an error code could never have said. */
export interface ManagerNotEntered extends SquadNotEntered {
  manager: ManagerIdentity;
}

export type ManagerSquadOutcome = ManagerSquadResult | ManagerNotEntered;

/** Wire shape of `GET /managers/:managerId/squad?gw=` — `MemberSquadDTO` plus who it belongs to. */
interface ManagerSquadDTO extends MemberSquadDTO {
  manager?: ManagerIdentity;
}

/**
 * `GET /managers/:managerId/squad?gw=` — the league-independent counterpart to `getMemberSquad`.
 *
 * The global and per-gameweek boards rank every manager in the game, so a row there has no league
 * to address its manager through. Same privacy rule as the league version (nothing before the
 * deadline passes, `SQUAD_HIDDEN` otherwise); what it drops is the membership check, because those
 * boards are public and membership was never what protected the payload.
 */
export async function getManagerSquad(
  managerId: string,
  gw?: number
): Promise<ApiResponse<ManagerSquadOutcome>> {
  const res = await apiFetch<ManagerSquadDTO>(
    `/managers/${managerId}/squad`,
    gw != null ? { query: { gw } } : {}
  );
  if (!res.success || !res.data) return asFailure<ManagerSquadOutcome>(res);
  const { xi, bench, captain, vice, formation, chip, manager } = res.data;
  const identity = { name: manager?.name ?? '', teamName: manager?.teamName ?? '' };
  if (res.data.entered === false) {
    return ok({ ...toSquadNotEntered(res.data), manager: identity });
  }
  // Same guard as `getMemberSquad` — a captain/vice-less squad is a broken server state for a
  // resolved gameweek, and fabricating an armband would quietly mis-score the pitch.
  if (captain == null || vice == null) {
    return { success: false, data: null, error: 'Manager squad is missing captain/vice.' };
  }
  return safeMap(() => ({
    squad: { xi, bench, captain, vice, formation: toFormationId(formation) },
    chip: chip ? toChipKind(chip) : null,
    manager: identity,
  }));
}

/**
 * `GET /managers/:managerId/score?gw=` — `getManagerSquad`'s scoring counterpart, returning the
 * same `ClientGwScoreDTO` as every other score read so `mapClientGwScore` is reused unchanged.
 *
 * Fails with the same codes as `getMemberScore` minus the league ones, plus `MANAGER_NOT_FOUND`
 * (404) for an id that is unknown, disabled, or a guest.
 */
export async function getManagerScore(
  managerId: string,
  gw?: number
): Promise<ApiResponse<GwScoreResult>> {
  const res = await apiFetch<ClientGwScoreDTO>(
    `/managers/${managerId}/score`,
    gw != null ? { query: { gw } } : {}
  );
  if (!res.success || !res.data) return asFailure<GwScoreResult>(res);
  try {
    return ok(mapClientGwScore(res.data));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown score data from API';
    return { success: false, data: null, error: message };
  }
}

// ── Head-to-head ────────────────────────────────────────────────

export interface H2HFixture {
  gw: number;
  homeId: string;
  /** `null` is the AVERAGE opponent an odd-sized league's spare member plays that gameweek. */
  awayId: string | null;
  homePts: number;
  awayPts: number;
  /** False for the in-flight GW (live score). */
  played: boolean;
}

export interface H2HRow {
  memberId: string;
  name: string;
  teamName: string;
  played: number;
  w: number;
  d: number;
  l: number;
  /** Total fantasy points scored across H2H matches. */
  ptsFor: number;
  /** W3 / D1 / L0. */
  h2hPts: number;
  rank: number;
}

export interface H2HState {
  currentFixtures: H2HFixture[];
  table: H2HRow[];
  myFixture: H2HFixture | null;
  /** The gameweek the league's schedule starts at; `null` while it waits for a second member. */
  startGameweek: number | null;
  /**
   * The gameweek `currentFixtures` covers — NOT necessarily the one on display. A league whose
   * season starts later is served its OWN first gameweek instead of an empty week.
   * `null` only when the league holds no fixtures at all.
   */
  gameweek: number | null;
  /** Every gameweek this league holds a fixture for, ascending — the picker's options. */
  gameweeks: number[];
  /**
   * Whether `table[].rank` means anything. False until a fixture has been PLAYED: the order is
   * otherwise a manager-id tie-break wearing the clothes of a league position, and the hub —
   * which reads `getMyStanding` — correctly says «—» for the same league. Draw «—», not a number.
   */
  ranked: boolean;
}

/**
 * `GET /leagues/:id/h2h` — the server's already-computed state, each side's points included: it
 * scores an unplayed current-GW fixture live and passes a played one's stored points through.
 * It once took `currentGW` and a locally-scored `myPts` callback, both ignored here — the callers
 * were computing a whole client-side score to fill a parameter this function never read.
 */
export async function getH2HState(
  league: League,
  gw?: number
): Promise<ApiResponse<H2HState>> {
  // No options object at all when no gameweek is asked for — `?gw=` is the exception, not the norm,
  // and the server's own default (the gameweek the league is actually on) is the right answer.
  const path = `/leagues/${league.id}/h2h`;
  const res =
    gw === undefined
      ? await apiFetch<H2HState>(path)
      : await apiFetch<H2HState>(path, { query: { gw } });
  if (!res.success || !res.data) return asFailure<H2HState>(res);
  return ok(res.data);
}

export interface GlobalBoardRow {
  /**
   * The manager's chosen club, so the gameweek board can draw the «قميص الجولة» winner's own kit
   * instead of a generic mark. Nullable at the source — a manager who skipped the club question
   * during onboarding has none, and the board falls back to the plain prize shirt.
   */
  favoriteClubId?: string | null;
  /**
   * The ranked manager, present only when the request carried a session — the server withholds it
   * from anonymous callers. Optional for that reason, and it is what makes a row openable: a row
   * without one stays inert.
   */
  managerId?: string;
  rank: number;
  name: string;
  teamName: string;
  /** Points in the latest settled gameweek (0 before any settlement) — mirrors `LeagueMember.gwPts`. */
  gwPts: number;
  totalPts: number;
  isMe?: boolean;
  /**
   * Places gained in the OVERALL standings since the previous settled gameweek; positive is up.
   * `null` when either side is missing, and optional for the same deploy-skew reason as
   * `LeagueMember.movement`.
   *
   * ⚠️ **Always `null` on the gameweek board.** That board's `rank` is the rank within the
   * gameweek, not the cumulative one, so the server deliberately serves no delta there rather than
   * put an arrow next to a number it does not describe.
   */
  movement?: number | null;
}

const GLOBAL_BOARD_DEFAULT_PER_PAGE = 50;

/**
 * `GET /leagues/global` — genuinely paginated (an unbounded manager pool,
 * unlike a single ≤50-member league): `LeaguesGlobalBoard.vue` accumulates
 * pages via a "load more" affordance instead of assuming one fixed-size
 * response. `managerName`/`teamName`/`totalPts` are unused — kept in the
 * signature so call sites don't need updating; the server derives `isMe`
 * from the JWT.
 */
export async function getGlobalBoard(
  _managerName: string,
  _teamName: string,
  _totalPts: number,
  page = 1
): Promise<ApiResponse<ApiPage<GlobalBoardRow>>> {
  const res = await apiFetch<PaginatedRaw<GlobalBoardRow>>('/leagues/global', {
    query: { page, per_page: GLOBAL_BOARD_DEFAULT_PER_PAGE },
  });
  if (!res.success || !res.data) return asFailure<ApiPage<GlobalBoardRow>>(res);
  return ok(mapPage(res.data));
}

/**
 * `GET /gameweeks/:gw/standings` — every manager who played a gameweek, ranked by that gameweek's
 * score. Live while the gameweek is in flight, then the settled ranks once it is scored.
 *
 * Returns `GlobalBoardRow` deliberately: the payload is column-for-column the global board's, so
 * `LeaguesGameweekBoard.vue` and `LeaguesGlobalBoard.vue` render the same five cells from one
 * shape rather than two near-identical ones that can drift.
 *
 * A gameweek with neither live nor settled scores answers `GAMEWEEK_NOT_SETTLED`, which the caller
 * shows as the existing "not scored yet" empty state — deliberately not an empty list, which would
 * read as "nobody scored".
 */
export async function getGameweekBoard(
  gw: number,
  page = 1
): Promise<ApiResponse<ApiPage<GlobalBoardRow>>> {
  const res = await apiFetch<PaginatedRaw<GlobalBoardRow>>(`/gameweeks/${gw}/standings`, {
    query: { page, per_page: GLOBAL_BOARD_DEFAULT_PER_PAGE },
  });
  if (!res.success || !res.data) return asFailure<ApiPage<GlobalBoardRow>>(res);
  return ok(mapPage(res.data));
}

/**
 * The two rows the leagues hub lists under "General Leagues" (`GET /leagues/general`).
 *
 * Neither is a league. FEL has no general-league taxonomy — the server's own enum is
 * `{ CLASSIC, H2H }` — so the Overall board and the per-gameweek board are the only honest
 * analogues, and the hub renders them as rows rather than inventing entities.
 */
export interface GeneralLeagues {
  overall: MyStanding;
  /**
   * The latest STARTED gameweek, or null before the season's first deadline.
   *
   * `rank` only. That rank is the position WITHIN the gameweek, while movement everywhere else is
   * an overall-rank delta — an arrow beside it would describe a different ranking from the number
   * it sits next to. There is deliberately no `lastRank` or `movement` field to fill in.
   */
  gameweek: { gw: number; rank: number | null } | null;
}

/**
 * `GET /leagues/general`.
 *
 * Fails soft on purpose: an API that has not shipped this route yet 404s, and the caller renders
 * the two General rows with dashes rather than failing the whole hub. Every other section of the
 * page comes from `GET /leagues` and is unaffected.
 */
export async function getGeneralLeagues(): Promise<ApiResponse<GeneralLeagues>> {
  const res = await apiFetch<GeneralLeagues>('/leagues/general');
  if (!res.success || !res.data) return asFailure<GeneralLeagues>(res);
  return ok(res.data);
}

export interface CupBracketEntry {
  round: string;
  myName: string;
  myTeam: string;
  myPts: number;
  oppName: string;
  oppTeam: string;
  oppPts: number;
  winnerAdvances: boolean;
}

/**
 * `GET /cup/current`. `managerName`/`teamName`/`totalPts` are unused — kept
 * in the signature so call sites don't need updating; the server derives
 * the caller's matchup from the JWT. Note: the server's `winnerAdvances`
 * field means "this tie isn't resolved yet" (true until an admin advances
 * the round), not "you will advance" — don't read it as a prediction.
 */
export async function getCupRound(
  _managerName: string,
  _teamName: string,
  _totalPts: number
): Promise<ApiResponse<CupBracketEntry>> {
  const res = await apiFetch<CupBracketEntry>('/cup/current');
  if (!res.success || !res.data) return asFailure<CupBracketEntry>(res);
  return ok(res.data);
}
