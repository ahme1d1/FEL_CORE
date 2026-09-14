/**
 * Which way a league member moved since the previous settled gameweek.
 *
 * The server computes this and sends it as a signed number of places — positive is up — because
 * only the server can. A private league could once be re-ranked client-side (every member is in
 * hand), but a paged board cannot: re-ranking the twelve rows a page happens to hold produces a
 * table of twelve people, not last week's league. The two surfaces now share one answer.
 *
 * The magnitude ships on the wire and is deliberately NOT drawn — the chip is an arrow only, to
 * match FPL (owner's call, 2026-09-05). It is here for whoever wants it later.
 *
 * `null`, never `'same'`, when there is no previous standing: no gameweek has settled, the latest
 * settled one is the season's first, or the member holds no score row at or before the previous
 * one. `'same'` claims they held station, which is a stronger statement than "we cannot say" —
 * the rule `FEL_API`'s own `movementOf` follows, end to end.
 */

export type RankMovement = 'up' | 'down' | 'same' | null;

/**
 * Map the server's signed places-gained onto the three shapes the chip draws.
 *
 * `undefined` is the deploy-skew case and answers `null`: an API that has not shipped this field
 * yet omits it, and the boards must then draw no arrows rather than a row of confident dashes.
 */
export function toRankMovement(movement: number | null | undefined): RankMovement {
  if (movement === null || movement === undefined) return null;
  if (movement > 0) return 'up';
  if (movement < 0) return 'down';
  return 'same';
}
