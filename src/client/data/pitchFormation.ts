// FPL convention: GK at the top, FWD at the bottom. Fractions of pitch height.
/**
 * One even spread, four rows: 0.14 margins top and bottom, 0.24 between. There used to be two
 * constants — a compressed 0.10/0.34/0.58/0.82 for the surfaces with a bench card under them and
 * this wider one for the rest — and the compressed one did not fit. Measured on the squad pitch at
 * a 360px viewport: four 101px cards in a 398px pitch, so the rows overlapped by 3px between DEF,
 * MID and FWD and the goalkeeper's card reached 7px ABOVE the pitch's clipped top edge, slicing
 * the swap badge in half (which is how this was reported).
 *
 * Shifting the goalkeeper down alone only moves the collision: it buys top clearance by spending
 * the gap to the defenders, which is a worse overlap because the keeper is a single centred card
 * with two defenders directly under it. An even spread is the only fixed-fraction layout that
 * gives four equal rows the same room, so both constants are now this one.
 *
 * It leaves a hard requirement on card height, enforced by the shirt sizes in `SquadPitch`:
 * `0.24 * pitchHeight` must exceed a card, or the rows touch again.
 */
export const FORMATION_ROW_Y = {
  GK: 0.14,
  DEF: 0.38,
  MID: 0.62,
  FWD: 0.86,
} as const;

/**
 * Kept as an alias so the surfaces that asked for the wider spread by name still read that way.
 * The two values are the same now — see above.
 */
export const FORMATION_ROW_Y_FULL = FORMATION_ROW_Y;

