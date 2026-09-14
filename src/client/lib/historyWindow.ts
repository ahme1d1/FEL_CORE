import type { GWPhase } from '../api/gameweekService.js';

/**
 * Which gameweeks a player's history has results to show, oldest first.
 *
 * Pulled out of `PlayerProfileContent` so the branch can be tested without a DOM (this repo's
 * vitest runs in plain node — no component harness, deliberately), the same reason
 * `app/lib/armband.ts` exists.
 *
 * The profile used to stop at `displayGW - 1` unless the round was `'finished'`, which meant the
 * gameweek being PLAYED was absent for the two days anyone cares about it: the points screen said
 * أحمد متعب had 6 for GW4 — 90 minutes, an assist, a bonus point — and the profile you reached by
 * tapping that very tile showed nothing newer than GW3. Two screens, one player, two answers.
 *
 * `'live'` is therefore included. `'locked'` is NOT: the deadline has passed but no ball has been
 * kicked, so every figure would be zero and the profile renders a zero-minute row as
 * «لم يشارك في الجولة» — a claim about a match nobody has played yet.
 *
 * Note this is the gameweek-level bound only. Within a live gameweek the fixtures are spread over
 * three days, so the caller still has to drop the newest row for a player whose OWN match has not
 * kicked off; see `PlayerProfileContent`.
 */
export function historyGameweeks(displayGW: number, phase: GWPhase): number[] {
  const started = phase === 'live' || phase === 'finished';
  const last = started ? displayGW : displayGW - 1;
  return Array.from({ length: Math.max(0, last) }, (_, i) => i + 1);
}

/**
 * The rows to actually draw, once the live gameweek's own fixture is taken into account.
 *
 * `historyGameweeks` above bounds the list at the GAMEWEEK level, but a gameweek turns `'live'` at
 * its first kickoff and its fixtures span three days — GW4's last four are two days after its
 * first. So a player whose own match has not started yet would get an all-zero row, which the
 * profile renders as «لم يشارك في الجولة»: a claim about a match nobody has played.
 *
 * An unknown status — no fixture for this club, or a refused fixtures read — drops the row too.
 * That is the behaviour this screen had before the live gameweek was let in at all, and it is the
 * honest answer: we do not know whether he has played.
 *
 * Separate from the component so both arms can be tested; this repo's vitest has no component
 * harness, and the withhold arm is the one that cannot be reproduced on a stack whose live
 * gameweek has no finished fixture.
 */
export function historyRowsToShow<T extends { events: { gw: number } }>(
  rows: readonly T[],
  liveGw: number | null,
  liveFixtureStatus: string | undefined,
): T[] {
  if (liveGw === null) return [...rows];
  const kickedOff = liveFixtureStatus === 'LIVE' || liveFixtureStatus === 'FINISHED';
  return kickedOff ? [...rows] : rows.filter((r) => r.events.gw !== liveGw);
}
