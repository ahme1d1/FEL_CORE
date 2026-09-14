/**
 * The WIRE CONTRACT for a points breakdown. Types only — no engine.
 *
 * This file used to carry a hand-kept mirror of FEL_API's `src/common/rules-engine/scoring.ts`,
 * because the server produced breakdown rows for a manager's own squad and for nobody else, so the
 * player profile re-scored raw events itself. A rule added on the server and not here did not fail
 * — it silently made the profile disagree with the points screen by exactly the missing term, and
 * Defensive Contribution did precisely that, under-counting every qualifying match by 2 points
 * until 2026-09-03.
 *
 * `GET /players/:playerId/breakdown` ended that: `points` and `rows` now come from the same
 * `pointsForEvents` the points screen is scored by, so there is only one engine and it is the
 * server's. `pointsForEvents` and its 134-line spec were deleted with it — they existed only to
 * defend the copy.
 *
 * What stays is the shape those rows arrive in. `BreakdownKind` in particular is a wire contract:
 * the strings arrive on `rows[].kind` and are looked up as `points.breakdown.<kind>` in both
 * dictionaries, so the union still has to match the server's member for member — see
 * `app/lib/breakdownLabel.ts`, which answers `null` for a kind this client has never heard of.
 */

export interface PlayerMatchEvents {
  playerId: number;
  gw: number;
  /** 0 = did not play. */
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  saves: number;
  penSaved: number;
  penMissed: number;
  yellow: number;
  red: number;
  ownGoals: number;
  /** Bonus Point System raw score (drives bonus allocation). Carried, never rendered. */
  bps: number;
  bonus: 0 | 1 | 2 | 3;
  /**
   * Defensive Contribution award: 0 or 2, once per match, never a multiple. Earned by DEF on 10+
   * clearances/blocks/interceptions/tackles, and by MID/FWD on 12+ of those plus ball recoveries.
   * The thresholds live on the server — this field is the already-decided outcome, not the count.
   */
  defconPoints: number;
  /**
   * The qualifying action count the award was judged on. Scored by nobody — carried so the
   * breakdown reads "مساهمات دفاعية · 13 · 2" the way FPL's does, instead of a bare flag. `0` when
   * the fixture was never pulled from the provider.
   */
  defconActions: number;
}

/**
 * Every scoring component that can appear in a breakdown, as a runtime list so a test can walk it.
 * The union below is derived from it rather than written twice.
 *
 * Order matches the server's own emission order, and mirrors FEL_API's `BreakdownKind` member for member —
 * these strings are a wire contract: they arrive on `rows[].kind` and are looked up as
 * `points.breakdown.<kind>` in both dictionaries.
 */
export const BREAKDOWN_KINDS = [
  'minutes',
  'goals',
  'assists',
  'cleanSheet',
  'goalsConceded',
  'saves',
  'penSaved',
  'penMissed',
  'cards',
  'ownGoals',
  'defcon',
  'bonus',
] as const;

export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];

export interface BreakdownRow {
  kind: BreakdownKind;
  count: number;
  points: number;
}
