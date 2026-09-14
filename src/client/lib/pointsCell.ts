/**
 * The one rule for how a player's gameweek points are shown.
 *
 * Three flags fall out of a single question — has this player got minutes on the board? — and the
 * pitch and the list must answer it identically. They are three lines, and they live here rather
 * than inside `PointsTile` because a second renderer that re-derived them would be free to
 * disagree, silently, on exactly the states that are hardest to eyeball: a player who has not
 * kicked off yet versus one who was left out.
 *
 * `PlayerGWScore.effectivePoints` is already multiplied, so nothing here needs to know about
 * captaincy.
 */

/** An en-dash (U+2013), not a hyphen and never `'0'`. */
export const NO_SCORE = '–';

export interface PointsCellInput {
  /** Minutes played in this gameweek. */
  minutes: number;
  /** Points after the captaincy multiplier. */
  effectivePoints: number;
  /** This player's club has a fixture in this gameweek that has not finished. */
  pending: boolean;
  /** Whether the score counts at all — false for a bench tile without Bench Boost. */
  counts: boolean;
}

export interface PointsCell {
  /** What the points box reads. */
  text: string;
  /** Paint the box in the accent: they played and it counted. */
  scored: boolean;
  /** Fade the whole tile: the match is over and they never came on. */
  dnp: boolean;
}

export function pointsCell(input: PointsCellInput): PointsCell {
  // No minutes on the board yet — either not kicked off, or a genuine absence.
  const noMinutes = input.minutes <= 0;
  return {
    // A dash for BOTH states: `0` would claim they played and scored nothing.
    text: noMinutes ? NO_SCORE : String(input.effectivePoints),
    scored: input.counts && !noMinutes,
    // Only a finished match makes an absence real. A player whose club has not kicked off shows a
    // dash at full opacity; one who was left out shows the same dash, faded.
    dnp: noMinutes && !input.pending,
  };
}
