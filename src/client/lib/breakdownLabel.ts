import type { BreakdownKind } from './scoring.js';

/**
 * Naming the lines of a points breakdown.
 *
 * Lives here rather than inside `PointsBreakdownSheet` so the fallback below can be tested: vitest
 * runs in plain node with no component harness, so anything left in the SFC is unreachable from a
 * test, and this is the exact spot a shipped crash came from.
 */

/**
 * Kind → dictionary key. Total by construction — a new `BreakdownKind` without an entry here does
 * not compile, and an entry pointing at a string the dictionaries lack is not a valid `Key`.
 */
export const BREAKDOWN_KEYS = {
  minutes: 'points.breakdown.minutes',
  goals: 'points.breakdown.goals',
  assists: 'points.breakdown.assists',
  cleanSheet: 'points.breakdown.cleanSheet',
  goalsConceded: 'points.breakdown.goalsConceded',
  saves: 'points.breakdown.saves',
  penSaved: 'points.breakdown.penSaved',
  penMissed: 'points.breakdown.penMissed',
  cards: 'points.breakdown.cards',
  ownGoals: 'points.breakdown.ownGoals',
  defcon: 'points.breakdown.defcon',
  bonus: 'points.breakdown.bonus',
} as const satisfies Record<BreakdownKind, string>;

export type BreakdownMessageKey = (typeof BREAKDOWN_KEYS)[keyof typeof BREAKDOWN_KEYS];

/**
 * The dictionary key for one breakdown row, or `null` when this build has no name for it.
 *
 * The map above is total for every kind this build knows about, and TypeScript keeps it that way.
 * What TypeScript cannot see is the wire: `rows` comes from FEL_API, which owns `BreakdownKind` and
 * can add a member at any time — defensive contribution arrived exactly that way, on a deploy the
 * website knew nothing about. The old lookup handed the result straight to `t(undefined)`, and what
 * a manager saw on production was a row with **no label at all**: a bare `1` and `2` between the
 * minutes row and the total, with nothing saying what had earned it.
 *
 * (`t(undefined)` throws `SyntaxError: Invalid arguments` when vue-i18n is driven directly with
 * this project's message compiler, which is why it looked like a crash on paper. In the real app it
 * degrades to an empty string instead. Verified in the running product before this was written —
 * the defect is a nameless row, not a dead screen.)
 *
 * Returning `null` lets the caller show the row under its raw kind. `defcon` is a poor label, but
 * it is a label: a developer can search for it and a manager can see that *something* named it.
 */
export function breakdownLabelKey(kind: BreakdownKind): BreakdownMessageKey | null {
  // `hasOwn`, not a bare `[kind] ?? null`: an index lookup walks the prototype chain, so a wire
  // value of `constructor` or `toString` would come back as a function — truthy, so the `??` never
  // fires — and be handed to `t()` as if it were a key.
  return Object.hasOwn(BREAKDOWN_KEYS, kind) ? BREAKDOWN_KEYS[kind] : null;
}
