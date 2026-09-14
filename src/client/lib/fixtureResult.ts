import type { Fixture } from '../data/fixtures.js';
import { rules } from '../api/rulesCache.js';

/**
 * How a fixture should present itself: a kickoff time until it starts, then a
 * live scoreline, then a final one. `status` and the two scores arrive from
 * `GET /fixtures?gw=` (see `fixturesService.mapFixtures`); every consumer
 * previously ignored them and rendered the kickoff time forever.
 */
export type FixtureDisplayState = 'scheduled' | 'live' | 'finished';

/**
 * A scoreline is only renderable once BOTH sides carry a number. The API types
 * them `number | null` independently, and an admin can mark a fixture FINISHED
 * without filling either in — showing "null - null" is worse than showing the
 * kickoff time, so that case falls back to `scheduled`.
 */
export function hasScoreline(f: Fixture): boolean {
  return typeof f.homeScore === 'number' && typeof f.awayScore === 'number';
}

/**
 * How long after kickoff a fixture counts as in play, absent any signal that it ended.
 *
 * Served (`rules().matchWindowMin`), because the server derives `matches.inPlayUntilIso` from the
 * same number and the two disagreeing is precisely how the gameweek chrome and the fixture rows
 * came to mean different things by "live". It used to be `120 * 60 * 1000` written out here under
 * a comment saying the two must move together.
 */
export function matchWindowMs(): number {
  return rules().matchWindowMin * 60 * 1000;
}

/**
 * `now` is injectable so the store can re-derive on its tick, and so this is testable.
 *
 * The `LIVE` branch used to also require `hasScoreline`, which made it doubly unreachable:
 * **nothing in FEL_API ever writes `Fixture.status = 'LIVE'`** (results are entered by an admin
 * after the final whistle), and a match in play has no final score to carry. The consequence
 * was that a match being played right now rendered as "scheduled" with a kickoff time on every
 * fixture surface, while the gameweek chrome — deriving from timestamps alone — claimed the
 * whole gameweek was live for ~56h. Two definitions of live, wrong in opposite directions.
 *
 * Order matters: an entered result is the authoritative end signal and beats the clock, so
 * FINISHED is checked first. POSTPONED never goes live — its kickoff time will never happen.
 */
export function fixtureState(f: Fixture, now: number = Date.now()): FixtureDisplayState {
  if (f.status === 'FINISHED' && hasScoreline(f)) return 'finished';
  if (f.status === 'POSTPONED') return 'scheduled';
  if (f.status === 'LIVE') return 'live';

  const ko = Date.parse(f.kickoffAt ?? '');
  if (Number.isNaN(ko)) return 'scheduled';
  return now >= ko && now < ko + matchWindowMs() ? 'live' : 'scheduled';
}
