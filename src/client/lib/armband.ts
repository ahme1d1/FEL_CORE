/**
 * Which armband a points-pitch tile draws.
 *
 * Pulled out of `PointsTile`'s template so the Triple Captain and vice-promotion branches can be
 * tested without a DOM (this repo's vitest runs in plain node — no component harness, deliberately).
 *
 * The multiplier is the only input needed to tell a double from a triple: the server sets 3 solely
 * under Triple Captain (`FEL_API` `gw-score.ts` — `playerId === effectiveCaptain ? (chip === 'TC' ? 3 : 2) : 1`),
 * and it puts that 3 on the *effective* captain. So a vice promoted over a blanking captain under
 * TC arrives here as `captain: true, multiplier: 3` and correctly gets the tripled badge.
 */

export interface ArmbandFlags {
  /** The effective captain — whoever actually took the multiplier. */
  captain: boolean;
  vice: boolean;
  /** Submitted as captain, but blanked and had the armband passed to their vice. */
  demotedCaptain: boolean;
}

export interface ArmbandBadge {
  type: 'C' | 'V';
  /** Triple Captain: the badge carries the multiplier beside the letter. */
  tripled: boolean;
  /**
   * The armband was taken off this player. Drawn struck through rather than merely drained: a
   * greyed `C` beside the promoted vice's gold `C` still read as two captains, which is the thing
   * the owner rejected. A strike says "was", and cannot be mistaken for an armband.
   */
  struck: boolean;
}

export function armbandFor(multiplier: 1 | 2 | 3, flags: ArmbandFlags): ArmbandBadge | null {
  // Order mirrors the v-if chain this replaced: live captain, then demoted, then vice.
  if (flags.captain) return { type: 'C', tripled: multiplier === 3, struck: false };
  if (flags.demotedCaptain) return { type: 'C', tripled: false, struck: true };
  if (flags.vice) return { type: 'V', tripled: false, struck: false };
  return null;
}
