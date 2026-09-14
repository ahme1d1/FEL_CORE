import type { Fixture, UpcomingFixture } from '../data/fixtures.js';
import { keyedSingleFlight } from './singleFlight.js';

import { mapClub, type ClubDTO } from './clubsService.js';
import { asFailure } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

export type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';

/** `GET /fixtures?gw=` wire shape. */
interface ClientFixture {
  id: string;
  gw: number;
  home: string;
  away: string;
  /** Each club embedded whole, so a fixture is renderable without the reference cache. */
  homeClub: ClubDTO;
  awayClub: ClubDTO;
  kickoffAt: string;
  koOffsetMin: number;
  status: FixtureStatus;
  /** Server-decided "the match is over and the result is known". Optional for deploy skew only. */
  isFinished?: boolean;
  homeScore: number | null;
  awayScore: number | null;
  difficultyHome: number;
  difficultyAway: number;
  tv: string | null;
  venue: string | null;
  note: string | null;
  boost: boolean;
}

/** One player's deeds in a single match — `GET /fixtures/:id/events`. */
export interface MatchEventRow {
  /** Player id, same numbering as `GET /players` — feeds the `playerProfile` overlay. */
  id: number;
  name: string;
  /** Club code, e.g. "ZAM" — which side the deed belongs to. */
  club: string;
  pos: 'GK' | 'DEF' | 'MID' | 'FWD';
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  yellow: number;
  red: number;
  penSaved: number;
  penMissed: number;
  /**
   * Shot-stops. **Optional because the server does not send it yet** — the column exists on
   * `PlayerMatchStats` and is read by `team-of-week`, but `GET /fixtures/:id/events` does not
   * serialize it. The match report has a Saves section that simply stays empty until it does,
   * rather than a section that has to be added later.
   */
  saves?: number;
  bonus: number;
  /** Defensive Contribution award, 0 or 2 — its own match-report section, like bonus. */
  defconPoints: number;
  /**
   * The qualifying action count the award was judged on: clearances + blocks + interceptions +
   * tackles for a defender, those plus ball recoveries for everyone else, 0 for a goalkeeper.
   * This is what the defensive-contribution section lists — the award is the same 2 for everyone
   * in it, so the count is the only thing that ranks them.
   */
  defconActions: number;
  /** Raw Bonus Point System score — what decided the 3/2/1. Listed, never scored. */
  bps: number;
}

/** `GET /fixtures/:id/events` wire shape. */
interface ClientFixtureEvents {
  fixture: ClientFixture;
  players: MatchEventRow[];
}

/** The match, plus everyone who did something in it. */
export interface FixtureEvents {
  fixture: Fixture;
  /**
   * The gameweek this match belongs to. Carried separately because `mapFixtures` drops `gw` from
   * the shared `Fixture` shape — every other caller already knows the gameweek it asked for, and
   * this one does not.
   */
  gw: number;
  players: MatchEventRow[];
}

/**
 * Maps the live per-GW fixture list onto the website's existing `Fixture`
 * shape (keeps `koOffsetMin`-relative consumers — `SquadPitch`/`TransferPitch`
 * /`FixtureRow`/`PitchFixtures`/etc — unchanged): `koOffsetMin` is recomputed
 * relative to this response's own earliest kickoff rather than reused from
 * the wire's GW-anchor-relative value, so it stays self-contained (no extra
 * gameweekService round-trip just to find the anchor). `id`/`status`/scores/
 * per-side difficulty ride along as extra optional fields for future use.
 */
function mapFixtures(dtos: ClientFixture[]): Fixture[] {
  if (dtos.length === 0) return [];
  const firstKickoffMs = Math.min(...dtos.map((d) => Date.parse(d.kickoffAt)));
  return dtos.map((d) => ({
    id: d.id,
    home: d.home,
    away: d.away,
    homeClub: mapClub(d.homeClub),
    awayClub: mapClub(d.awayClub),
    koOffsetMin: Math.round((Date.parse(d.kickoffAt) - firstKickoffMs) / 60_000),
    kickoffAt: d.kickoffAt,
    tv: d.tv ?? '',
    venue: d.venue ?? '',
    boost: d.boost,
    note: d.note ?? undefined,
    status: d.status,
    isFinished: d.isFinished,
    homeScore: d.homeScore,
    awayScore: d.awayScore,
    difficultyHome: d.difficultyHome,
    difficultyAway: d.difficultyAway,
  }));
}

/**
 * De-duplicates concurrent reads of the same gameweek's card. Squad and Transfers each mount
 * `PitchFixtures` (which lists the gameweek) alongside `useGwOpponents` (which derives every
 * club's opponent from the same rows), so without this every one of those screens asked for the
 * identical ten fixtures twice. Keyed on the gameweek, so a different one still gets its own
 * request; like every other use here it clears on settle and never becomes a stale cache.
 */
const fixturesInFlight = new Map<string, Promise<ApiResponse<Fixture[]>>>();

/**
 * A mapping failure is a failed READ, not a rejected promise.
 *
 * `mapClub` throws on purpose — `toEmblemId` is a contract-drift guard — and every embedded club
 * runs through it now. Without this, a drifted (or absent) `homeClub` made `getFixtures` reject;
 * `computedAsync` swallows a rejection into its `onError`, so `HomeFixturesStrip` never saw a
 * failed response and printed «لا توجد مباريات مجدولة» — a claim about the schedule, for a
 * problem that has nothing to do with it. Same guard `getClubs` has had all along.
 */
function mapFailure<T>(e: unknown): ApiResponse<T> {
  const message = e instanceof Error ? e.message : 'Unknown fixture data from API';
  return { success: false, data: null, error: message };
}

/** `GET /fixtures?gw=` */
export function getFixtures(gw: number): Promise<ApiResponse<Fixture[]>> {
  return keyedSingleFlight(fixturesInFlight, String(gw), async () => {
    const res = await apiFetch<ClientFixture[]>('/fixtures', { query: { gw } });
    if (!res.success || !res.data) return asFailure<Fixture[]>(res);
    try {
      return ok(mapFixtures(res.data));
    } catch (e: unknown) {
      return mapFailure<Fixture[]>(e);
    }
  });
}

/**
 * De-duplicates concurrent reads of the same match. Three surfaces can open the sheet and the
 * overlay is query-driven, so a double-tap or a restored deep link would otherwise fire twice.
 */
const eventsInFlight = new Map<string, Promise<ApiResponse<FixtureEvents>>>();

/**
 * `GET /fixtures/:id/events` — the match report behind the `matchDetails` overlay.
 *
 * The fixture rides along in the payload so the sheet renders its header from one request; it is
 * mapped through the same `mapFixtures` every other fixture goes through, so `fixtureState()` and
 * the crest lookups behave identically to the row that was tapped. `koOffsetMin` is meaningless for
 * a single fixture (it is measured against the response's own earliest kickoff, which is this one)
 * — the sheet reads `kickoffAt`, which is absolute.
 */
export async function getFixtureEvents(fixtureId: string): Promise<ApiResponse<FixtureEvents>> {
  return keyedSingleFlight(eventsInFlight, fixtureId, async () => {
    // Encoded, unlike the other path interpolations in this folder: every one of those takes an
    // id that came from the server, while this one comes straight off `?fixtureId=` in the address
    // bar, where anything can be typed. A bare `../` would otherwise re-point the request.
    const res = await apiFetch<ClientFixtureEvents>(
      `/fixtures/${encodeURIComponent(fixtureId)}/events`,
    );
    if (!res.success || !res.data) return asFailure<FixtureEvents>(res);
    try {
      // `mapFixtures` returns one row per input, so this cannot be empty — the guard is here to
      // satisfy the index-access check rather than to describe a reachable state.
      const [fixture] = mapFixtures([res.data.fixture]);
      if (!fixture) return asFailure<FixtureEvents>(res);
      return ok({ fixture, gw: res.data.fixture.gw, players: res.data.players });
    } catch (e: unknown) {
      return mapFailure<FixtureEvents>(e);
    }
  });
}

/**
 * De-duplicates concurrent upcoming-fixture requests per club+limit (QA-15).
 *
 * Only the player sheets reach this now, and one at a time on a tap — they want a *run* of a
 * club's next few fixtures, which is what the route genuinely answers. The pitch pills used to
 * come through here too, asking for `limit: 1` once per club; they read `useGwOpponents` instead,
 * because "next kickoff in the future" is not the same question as "who does this club play in
 * the gameweek I am editing", and during a gameweek's final matchdays the two disagree.
 */
const upcomingInFlight = new Map<string, Promise<ApiResponse<UpcomingFixture[]>>>();

/** `GET /fixtures/upcoming/:club` wire shape — `oppClub` is the opponent, embedded whole. */
interface ClientUpcomingFixture {
  gw: number;
  opp: string;
  oppClub: ClubDTO;
  home: boolean;
  difficulty: number;
}

function fetchUpcoming(clubId: string, limit: number): Promise<ApiResponse<UpcomingFixture[]>> {
  return keyedSingleFlight(upcomingInFlight, `${clubId}:${limit}`, async () => {
    const res = await apiFetch<ClientUpcomingFixture[]>(`/fixtures/upcoming/${clubId}`, {
      query: { limit },
    });
    if (!res.success || !res.data) return asFailure<UpcomingFixture[]>(res);
    try {
      return ok(res.data.map((f) => ({ ...f, oppClub: mapClub(f.oppClub) })));
    } catch (e: unknown) {
      return mapFailure<UpcomingFixture[]>(e);
    }
  });
}

export async function getUpcomingFor(clubId: string, n: number): Promise<ApiResponse<UpcomingFixture[]>> {
  return fetchUpcoming(clubId, n);
}
