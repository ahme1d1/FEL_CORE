/**
 * The wire vocabulary of the FEL rules engine.
 *
 * `PositionCode` and `ChipKind` are declared here as string unions rather than imported from
 * `@prisma/client`. They were the engine's ONLY external import, and every use of them is in type
 * position — no runtime enum access anywhere — so the unions below are what made this package
 * portable to a browser and a phone at all.
 *
 * They are a copy of a Prisma enum, and the copy is guarded: `FEL_API` owns the schema and its
 * `src/common/rules-engine/prisma-parity.spec.ts` asserts these two unions are mutually assignable
 * with the generated ones, and that the generated ones hold exactly these members. A member added
 * to `schema.prisma` and not added here fails FEL_API's suite in the repo that made the change.
 */

/** `prisma/schema.prisma` enum PositionCode. */
export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

/** `prisma/schema.prisma` enum ChipKind — Wildcard, Free Hit, Bench Boost, Triple Captain. */
export type ChipKind = 'WC' | 'FH' | 'BB' | 'TC';

/**
 * Minimal player facts the engine needs. Slices map DB rows → this shape; the engine
 * never touches Prisma at all — `PositionCode` above is a local union, not a generated type.
 */
export interface PlayerRef {
  id: number;
  clubId: string;
  position: PositionCode;
  currentPriceTenths: number;
}

/** Player lookup passed into the engine in place of the client's global `pBy()` registry. */
export type PlayerLookup = Map<number, PlayerRef>;

/** A full squad layout: 11 XI + 4 bench (bench[0] = reserve GK), with armbands. */
export interface SquadInput {
  xi: number[];
  bench: number[];
  captain: number;
  vice: number;
  formation: string;
}

/** One gameweek's raw match events for a single player (scoring inputs only). */
export interface PlayerMatchEvents {
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
  /** Awarded bonus 0-3 (validated upstream). */
  bonus: number;
  /**
   * Defensive Contribution award, 0 or 2 (§4). Taken verbatim, like `bonus` — the threshold
   * arithmetic lives in `defensiveContribution()` and the result is stored, not recomputed here.
   */
  defconPoints: number;
  /**
   * The qualifying action count the award was judged on. Scored by nobody — carried purely so a
   * breakdown can read "Defensive contribution · 13 · 2" the way FPL's does, instead of the flag
   * `1`, which says nothing. `0` when the fixture was never pulled from the provider.
   */
  defconActions: number;
}

/**
 * The pulled per-match statistics BPS and Defensive Contribution read, under FEL's column names
 * — the subset of `PlayerMatchStats` the engine needs. Every field is a plain count.
 *
 * Deliberately does NOT carry a position. §3.1: scoring always uses the player's *registered*
 * FEL position, never the one the data provider lists for the match. They disagree constantly —
 * wingers registered MID but listed F, full-backs listed D but registered MID — and every
 * function here takes `PositionCode` as a separate argument so the payload cannot supply it.
 */
export interface PulledMatchStats {
  /** From the provider verbatim (§3.2), never recomputed from kickoff and substitution times. */
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  penaltiesWon: number;
  penaltiesConceded: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  clearances: number;
  blocks: number;
  interceptions: number;
  tackles: number;
  ballRecoveries: number;
  totalPasses: number;
  accuratePasses: number;
  keyPasses: number;
  bigChanceCreated: number;
  bigChanceMissed: number;
  offsides: number;
  shotsOffTarget: number;
  fouls: number;
}

export type BreakdownKind =
  | 'minutes'
  | 'goals'
  | 'assists'
  | 'cleanSheet'
  | 'goalsConceded'
  | 'saves'
  | 'penSaved'
  | 'penMissed'
  | 'cards'
  | 'ownGoals'
  | 'defcon'
  | 'bonus';

/** One contributing line of a player's score (kind, how many, points awarded). */
export interface BreakdownRow {
  kind: BreakdownKind;
  count: number;
  points: number;
}

export interface ScoreResult {
  total: number;
  rows: BreakdownRow[];
}

/**
 * One contributing action in a BPS score (docs/FEL_SCORING_SPEC.md §5.1).
 *
 * Deliberately its own union rather than a widening of `BreakdownKind`: the two answer different
 * questions. `BreakdownKind` itemises the points a manager was PAID; this itemises the score that
 * decided who got the bonus, and nothing here is scored directly.
 *
 * `cbi` pools clearances, blocks and interceptions because the rule pools them — they share one
 * rate, while tackles and recoveries have their own. `minorFaults` pools offsides, fouls and
 * shots off target for the same reason.
 */
export type BpsKind =
  | 'appearance'
  | 'goals'
  | 'assists'
  | 'cleanSheet'
  | 'penaltiesSaved'
  | 'saves'
  | 'cbi'
  | 'tackles'
  | 'ballRecoveries'
  | 'keyPasses'
  | 'bigChanceCreated'
  | 'passAccuracy'
  | 'yellowCards'
  | 'redCards'
  | 'ownGoals'
  | 'penaltiesMissed'
  | 'penaltiesConceded'
  | 'bigChanceMissed'
  | 'minorFaults';

/**
 * One line of a BPS score. `count` is the raw quantity — minutes for `appearance`, a whole
 * percentage for `passAccuracy`, the pooled total for `cbi` and `minorFaults`.
 */
export interface BpsRow {
  kind: BpsKind;
  count: number;
  points: number;
}

export interface BpsResult {
  total: number;
  rows: BpsRow[];
}

export interface AutoSub {
  out: number;
  in: number;
}

export interface AutoSubResult {
  xi: number[];
  bench: number[];
  /** Vice inherits the armband when the captain doesn't play. */
  effectiveCaptain: number;
  subs: AutoSub[];
}

export interface PlayerGWScore {
  playerId: number;
  /** Raw points before the captaincy multiplier. */
  points: number;
  multiplier: 1 | 2 | 3;
  effectivePoints: number;
  rows: BreakdownRow[];
}

export interface SquadGWScore {
  xi: PlayerGWScore[];
  bench: PlayerGWScore[];
  /** The armbands as submitted, echoed back so callers can show that the armband moved. */
  captain: number;
  vice: number;
  effectiveCaptain: number;
  autoSubs: AutoSub[];
  chip: ChipKind | null;
  /** XI effective points (+ bench effective points when Bench Boost is active). */
  grossPoints: number;
  /** Points hit applied to this GW (0 unless supplied by the caller). */
  transferCost: number;
  /** grossPoints − transferCost. */
  netPoints: number;
}

export type SquadValidationMode = 'final' | 'partial';

export type SquadInvalidReason =
  | 'PLAYER_NOT_FOUND'
  | 'SIZE'
  | 'DUPLICATE'
  | 'FORMATION'
  | 'COMPOSITION'
  | 'CLUB_CAP'
  | 'BUDGET'
  | 'CAPTAIN_VICE'
  | 'CAPTAIN_NOT_IN_XI'
  | 'VICE_NOT_IN_XI'
  | 'BENCH_GK'
  | 'XI_ILLEGAL';

export interface SquadValidationError {
  code: SquadInvalidReason;
  message: string;
}

export interface SquadValidationResult {
  valid: boolean;
  errors: SquadValidationError[];
  spentTenths: number;
  remainingTenths: number;
  byPosition: Record<PositionCode, number>;
  byClub: Record<string, number>;
}
