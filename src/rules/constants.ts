import { PositionCode } from './types';

/*
 * The seven squad-shape constants below used to live in `FEL_API/src/common/constants.ts` and be
 * re-exported from here. They moved when this package was extracted: that file is a grab-bag which
 * also holds league, notification and pagination caps, so it could not travel — but these seven are
 * rules, and a rule with two definitions is the thing this package exists to prevent. `FEL_API`
 * now re-exports them back from `@fel/core/rules`, so its own ~8 direct importers are unchanged and
 * there is still exactly one definition.
 *
 * Money and points are integer tenths throughout.
 */

/** Starting budget: 100.0m. */
export const STARTING_BUDGET_TENTHS = 1000;

/** The most free transfers a manager can bank. */
export const MAX_FREE_TRANSFERS = 5;

export const SQUAD_SIZE = 15;
export const XI_SIZE = 11;
export const BENCH_SIZE = 4;

/** The most players one club may contribute to a squad. */
export const MAX_PER_CLUB = 3;

/** Required squad composition by position. */
export const SQUAD_COMPOSITION: Record<PositionCode, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

/** Points for a goal, by the scorer's position. */
export const GOAL_POINTS: Record<PositionCode, number> = { GK: 6, DEF: 6, MID: 5, FWD: 4 };

/** Clean-sheet points (awarded only when the player reached 60+ minutes). */
export const CLEAN_SHEET_POINTS: Record<PositionCode, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 };

export const FULL_APPEARANCE_MIN = 60;
export const ASSIST_POINTS = 3;
export const SAVES_PER_POINT = 3;
export const PEN_SAVE_POINTS = 5;
export const PEN_MISS_POINTS = -2;
export const CONCEDED_PER_PENALTY = 2;
export const YELLOW_POINTS = -1;
export const RED_POINTS = -3;
export const OWN_GOAL_POINTS = -2;

/** Points hit for each transfer beyond the available free transfers. */
export const HIT_COST_PER_EXTRA = 4;

/**
 * Inclusive starting-XI bounds (standard FPL rules). The backend validates these actual
 * counts rather than trusting the formation string.
 */
export const XI_RULES: Record<PositionCode, { min: number; max: number }> = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};

/**
 * Known display formations — exactly the shapes `XI_RULES` admits (the engine still
 * validates actual XI counts, but `PUT /squad` / onboarding reject an unlisted label
 * outright via `@IsIn`, so a missing entry makes a legal lineup unsaveable). Keep in
 * lockstep with `XI_RULES` above and with FEL_WEBSITE's `FORMATION_IDS`;
 * `formation.spec.ts` asserts the two stay equal.
 */
export const FORMATIONS = [
  '3-4-3',
  '3-5-2',
  '4-3-3',
  '4-4-2',
  '4-5-1',
  '5-2-3',
  '5-3-2',
  '5-4-1',
] as const;
export type FormationId = (typeof FORMATIONS)[number];

// ─────────────── Defensive Contribution (docs/FEL_SCORING_SPEC.md §4) ───────────────

/**
 * Qualifying actions needed for the DefCon award, by registered position. A threshold, not a
 * rate: ten actions and twenty actions both pay exactly `DEFCON_POINTS`, once per match.
 *
 * `null` for GK, who are not eligible at all — distinct from a threshold they can never reach.
 *
 * DEF count clearances + blocks + interceptions + tackles. MID and FWD count those four plus
 * ball recoveries, which is why their bar is higher.
 *
 * These two numbers are the tunable part. FPL uses 10/12; whether they suit this league is a
 * game-balance question §4 says to answer from a few gameweeks of real data. Changing them is a
 * live scoring change, not a dry run: `scoring.ts` adds `defconPoints` to the player's total, so
 * the award is already in managers' scores and on the published rules page.
 */
export const DEFCON_THRESHOLD: Record<PositionCode, number | null> = {
  GK: null,
  DEF: 10,
  MID: 12,
  FWD: 12,
};

export const DEFCON_POINTS = 2;

// ─────────────── BPS (docs/FEL_SCORING_SPEC.md §5.1) ───────────────

/**
 * BPS replaces provider ratings as the bonus input; the top three places in a match take
 * 3 / 2 / 1 (§5.2).
 *
 * Two honesty caveats that belong with the numbers. FPL sources from Opta and we source from
 * Sofascore, whose definitions of "tackle", "recovery" and "big chance" are close but not
 * identical — so these are FPL-*style*, not FPL-identical. And FPL additionally awards BPS for
 * goal-line clearances and error-led-to-goal, which Sofascore does not expose cleanly; they are
 * left out rather than approximated.
 */
export const BPS_APPEARANCE = { PARTIAL: 3, FULL: 6 } as const;

/** Goal, by the scorer's registered position. */
export const BPS_GOAL: Record<PositionCode, number> = { GK: 12, DEF: 12, MID: 18, FWD: 24 };

/** Clean sheet, by registered position. MID +6 is a FEL addition; FPL gives midfielders none. */
export const BPS_CLEAN_SHEET: Record<PositionCode, number> = { GK: 12, DEF: 12, MID: 6, FWD: 0 };

export const BPS_ASSIST = 9;
export const BPS_PENALTY_SAVE = 15;
export const BPS_PER_SAVE = 2;
export const BPS_KEY_PASS = 1;
export const BPS_BIG_CHANCE_CREATED = 3;

/** Rate-based defensive credit: one point per N of each action. */
export const BPS_PER_CBI = 2;
export const BPS_PER_TACKLE = 3;
export const BPS_PER_RECOVERY = 3;

export const BPS_YELLOW = -3;
export const BPS_RED = -9;
export const BPS_OWN_GOAL = -6;
export const BPS_PENALTY_MISSED = -6;
export const BPS_PENALTY_CONCEDED = -3;
export const BPS_BIG_CHANCE_MISSED = -3;
/** Offside, foul and shot off target each cost this. */
export const BPS_MINOR_FAULT = -1;

/**
 * Pass-accuracy bonus. Bands are checked high to low; the 30-pass floor applies to all of them,
 * so a 100% record from five passes earns nothing.
 */
export const BPS_PASS_MIN_ATTEMPTS = 30;
export const BPS_PASS_ACCURACY_BANDS = [
  { minPercent: 90, points: 6 },
  { minPercent: 80, points: 4 },
  { minPercent: 70, points: 2 },
] as const;

/** Bonus paid to the first, second and third place in a match, ties consuming places (§5.2). */
export const BONUS_BY_RANK = [3, 2, 1] as const;
