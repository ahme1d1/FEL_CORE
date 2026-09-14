import type { Club } from './clubs.js';

export interface Fixture {
  /** `GET /fixtures?gw=` row id. */
  id?: string;
  home: string;
  away: string;
  /**
   * The two clubs, whole, straight off the wire. `home`/`away` are 3-letter codes and a code
   * cannot be drawn: a card needs a crest, colours and a name in both languages. Resolving that
   * against the reference cache meant a fixture could not render until an unrelated five-page walk
   * of the roster had finished, and on any slow connection it did not — every card on Home came up
   * blank, permanently, because the club map is not reactive. `GET /fixtures` embeds them now.
   */
  homeClub: Club;
  awayClub: Club;
  /**
   * Minutes after the gameweek's first kickoff, recomputed relative to the
   * response's own earliest kickoff (see `kickoffIsoFor`).
   */
  koOffsetMin: number;
  /** Legacy Arabic display string — fallback when no kickoff anchor is known for this GW (see `pages/app/fixtures.vue`). */
  time?: string;
  /** Absolute kickoff ISO, straight off the wire (no anchor math needed). */
  kickoffAt?: string;
  tv: string;
  venue: string;
  boost?: boolean;
  note?: string;
  status?: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';
  /**
   * The match is over and its result is known — server-decided, and the same predicate the league
   * table uses (FINISHED *and* a real scoreline; a status flipped before the scoresheet was saved
   * is neither).
   *
   * Prefer it over re-deriving from `status`. `fixtureState` still answers live-vs-scheduled from
   * the clock, because nothing writes `status = 'LIVE'` and a tab left open must cross a kickoff
   * without polling — but "is it finished" needs no guessing and should not be guessed.
   *
   * Optional for deploy skew only.
   */
  isFinished?: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  difficultyHome?: number;
  difficultyAway?: number;
}

/** Absolute kickoff ISO for a fixture, given the GW's first-kickoff anchor. */
export function kickoffIsoFor(fixture: Fixture, firstKickoffIso: string): string {
  return new Date(Date.parse(firstKickoffIso) + fixture.koOffsetMin * 60_000).toISOString();
}

export interface Opponent {
  /** Opponent club id, uppercase (e.g. "ZAM"). */
  code: string;
  /** True when the player's club is the home side. */
  home: boolean;
}

/** An `Opponent` plus that club's own difficulty rating for the fixture (1 = easiest). */
export interface GwOpponent extends Opponent {
  /** 1–5 from the perspective of the club this entry is keyed by (FPL convention). */
  difficulty: number;
}

export interface UpcomingFixture {
  gw: number;
  opp: string;
  /** The opponent, whole — see `Fixture.homeClub`. */
  oppClub: Club;
  home: boolean;
  /** 1–5 where 1 = easiest, 5 = hardest (FPL convention). */
  difficulty: number;
}
