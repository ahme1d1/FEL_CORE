import { apiFetch, ok } from './client.js';
import { keyedSingleFlight } from './singleFlight.js';
import type { ApiResponse } from './types.js';

/**
 * `GET /gameweeks/:gw/team-of-week` — the best legal XI of a gameweek.
 *
 * The endpoint already existed for `FEL_CONTENT`'s social cards; this is the website's first read
 * of it. The picking happens server-side on purpose: assembling an XI from `top-players` breaks on
 * exactly the rounds the card is most wanted for (GW3 finished 0-1, 0-1, 2-1, 0-1, 0-0, 0-0, 0-1,
 * 2-0, 0-2, 1-0 — clean sheets carried the scoring and the top fifty held ONE forward).
 *
 * **Three refusals, and they are not the same thing.** All three arrive as a 404, so the caller
 * must read the machine code, the way `LeaguesGameweekBoard` already does for the first of them:
 *   - `GAMEWEEK_NOT_SETTLED` — normal. The round has not been scored. Not an error, and must not
 *     be drawn as one.
 *   - `GAMEWEEK_NOT_FOUND` / `NOT_FOUND` — a real refusal: no such gameweek, or one that cannot
 *     field any legal shape from the players who appeared.
 *   - a bare 404 with NO machine code — the endpoint is not deployed yet. The website can ship
 *     ahead of the API, and "we have not built this on the server" must not read as "your gameweek
 *     is broken". Same distinction `FEL_CONTENT/build/author/sources.mjs` draws.
 */

export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

/** One player in the XI. `name` is Arabic-only and `club` is a raw 3-letter code — both localise
 *  client-side, through `playerShortName` and `shortClubName`. */
export interface TeamOfWeekPlayer {
  playerId: number;
  name: string;
  club: string;
  pos: PositionCode;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  bonus: number;
}

export interface TeamOfWeek {
  gw: number;
  /** One of the engine's eight shapes, e.g. `'5-4-1'`. */
  formation: string;
  totalPoints: number;
  /** Down the pitch: FORWARDS first, keeper last. Group by `pos` rather than trusting the order. */
  players: TeamOfWeekPlayer[];
  /**
   * Scored from a round still in play, so the XI can still change. **Not rendered** — FPL shows a
   * live team of the week with no caveat on it. It exists because the cache TTL and FEL_CONTENT's
   * refusal both key off it. Absent until the API ships it.
   */
  provisional?: boolean;
}

/** Why there is no team to show. `notDeployed` is the deploy-skew case, not a fault. */
export type TeamOfWeekRefusal = 'notScored' | 'notStarted' | 'none' | 'notDeployed' | 'failed';

const inFlight = new Map<string, Promise<ApiResponse<TeamOfWeek>>>();

/**
 * `?live=1` is sent always, and that is the right default FOR THIS CALLER.
 *
 * The endpoint refuses an unsettled round by default so `FEL_CONTENT`'s settle-day author skips
 * the card rather than publishing a provisional eleven to Instagram, where it cannot be recalled.
 * A web page is the opposite case: it redraws on every visit, so an eleven that changes when the
 * stats are revised is simply the eleven, and refusing to show one all week is the worse answer.
 *
 * Against an API that predates the flag this is still safe — `?live=1` is dropped as an unknown
 * parameter only if validation allows it; where it does not, the request 400s and `refusalOf`
 * reports `failed`, which is honest. The settled path is unaffected either way.
 */
export function getTeamOfWeek(gw: number): Promise<ApiResponse<TeamOfWeek>> {
  return keyedSingleFlight(inFlight, String(gw), async () => {
    const res = await apiFetch<TeamOfWeek>(`/gameweeks/${gw}/team-of-week`, {
      query: { live: 1 },
    });
    if (!res.success || !res.data) return res as ApiResponse<TeamOfWeek>;
    return ok(res.data);
  });
}

/** One player in the season XI. Like `TeamOfWeekPlayer`, but `cleanSheets` is a COUNT — over a
 *  season "did he keep a clean sheet" has no yes/no answer. */
export interface TeamOfSeasonPlayer {
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

export interface TeamOfSeason {
  formation: string;
  totalPoints: number;
  players: TeamOfSeasonPlayer[];
  /** True while any played gameweek is still unsettled, so the eleven can change. Not rendered. */
  provisional: boolean;
}

const seasonInFlight = new Map<string, Promise<ApiResponse<TeamOfSeason>>>();

/**
 * `GET /team-of-season` — the season XI, picked and totalled by the server.
 *
 * This screen used to do both itself: pick the eleven from `Player.total` plus a live-points
 * overlay, then fire ELEVEN `GET /players/:id/history` calls to fill in the minutes and bonus the
 * card shows. Neither was the client's to do — the pool a picker needs is per-position, and the
 * totals are one query. `TransferListPane` was doing the same aggregation across all ~682 market
 * players, which is what `getSeasonStats` below replaces.
 *
 * No `?live=1`: a season is never settled until its last gameweek is, so the endpoint cannot refuse
 * an unsettled one without answering nothing all season. It carries `provisional` instead.
 */
export function getTeamOfSeason(): Promise<ApiResponse<TeamOfSeason>> {
  return keyedSingleFlight(seasonInFlight, 'season', async () => {
    const res = await apiFetch<TeamOfSeason>('/team-of-season');
    if (!res.success || !res.data) return res as ApiResponse<TeamOfSeason>;
    return ok(res.data);
  });
}

/**
 * Turn a failed season response into the reason to show. Same codes as `refusalOf`, minus the
 * gameweek-shaped ones the season endpoint cannot answer.
 */
export function seasonRefusalOf(res: ApiResponse<TeamOfSeason>): TeamOfWeekRefusal {
  const code = res.code;
  if (code === 'GAMEWEEK_NOT_STARTED') return 'notStarted';
  if (code === 'NOT_FOUND') return 'none';
  if (!code) return 'notDeployed';
  return 'failed';
}

/**
 * Turn a failed response into the reason to show. Keyed on the machine code rather than the status,
 * because every one of these is a 404.
 */
export function refusalOf(res: ApiResponse<TeamOfWeek>): TeamOfWeekRefusal {
  const code = res.code;
  if (code === 'GAMEWEEK_NOT_SETTLED') return 'notScored';
  if (code === 'GAMEWEEK_NOT_STARTED') return 'notStarted';
  if (code === 'GAMEWEEK_NOT_FOUND' || code === 'NOT_FOUND') return 'none';
  // A 404 that named no code at all is the route missing, not the round.
  if (!code) return 'notDeployed';
  return 'failed';
}
