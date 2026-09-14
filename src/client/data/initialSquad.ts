/**
 * The formation shapes, as a TYPE only.
 *
 * The runtime list lives on the server and arrives as `rules().formations` — this used to be a
 * local `FORMATION_IDS` array asked to stay "in lockstep with FEL_API's `FORMATIONS`" by hand.
 * The union is kept because it is genuinely useful across the ten files that pass a formation
 * around, and because a TYPE cannot drift at runtime the way an array can: nothing switches
 * exhaustively on it, so a shape the server adds and this union has not heard of still renders —
 * `formationLabel` derives the string from the actual XI counts either way.
 *
 * It is a convenience, never the authority. `toFormationId` validates against the server's list
 * when it is in hand and passes the value through when it is not.
 */
export type FormationId =
  | '3-4-3'
  | '3-5-2'
  | '4-3-3'
  | '4-4-2'
  | '4-5-1'
  | '5-2-3'
  | '5-3-2'
  | '5-4-1';

export interface Squad {
  xi: number[];
  bench: number[];
  captain: number;
  vice: number;
  formation: FormationId;
}

/**
 * Pre-hydration placeholder only — never rendered (squad pages gate on the
 * squad store's `hydrated` flag) and never submitted. The real default squad
 * is provisioned server-side on signup (FEL_API `INITIAL_SQUAD`); the frontend
 * ships no player ids.
 */
export const EMPTY_SQUAD: Squad = {
  xi: [],
  bench: [],
  captain: 0,
  vice: 0,
  formation: '4-4-2',
};
