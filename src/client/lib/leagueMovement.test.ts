import { describe, expect, it } from 'vitest';

import { toRankMovement } from './leagueMovement.js';

/**
 * The mapper replaced a client-side re-ranking pass, and that pass was wrong in a way worth
 * recording: it ranked previous totals with standard competition ranking (1, 1, 3) and compared
 * the result against the server's rank, which is ORDINAL (1, 2, 3, 4 — `FEL_API` `ranking.ts`
 * never shares a position). Any tie in previous totals therefore produced an arrow out of nothing.
 * There is no arithmetic left here to get wrong, which is the point.
 */
describe('toRankMovement', () => {
  it('reads a positive delta as a climb', () => {
    // Arrange / Act / Assert — the server sends places GAINED, so positive means the rank number
    // got smaller.
    expect(toRankMovement(5)).toBe('up');
    expect(toRankMovement(1)).toBe('up');
  });

  it('reads a negative delta as a fall', () => {
    expect(toRankMovement(-3)).toBe('down');
    expect(toRankMovement(-1)).toBe('down');
  });

  it('reads exactly zero as holding station', () => {
    // 0 is a real answer — the member was compared and did not move.
    expect(toRankMovement(0)).toBe('same');
  });

  it('reads null as no answer at all, never as holding station', () => {
    // No previous standing to compare against: pre-season, the season's first settled gameweek, or
    // a member who joined since. The chip renders nothing for this.
    expect(toRankMovement(null)).toBeNull();
    expect(toRankMovement(null)).not.toBe('same');
  });

  it('reads a missing field as no answer — the deploy-skew case', () => {
    // Until the API ships `movement`, the field is absent. Boards must draw no arrows rather than
    // a column of dashes claiming nobody moved.
    expect(toRankMovement(undefined)).toBeNull();
    expect(toRankMovement(undefined)).not.toBe('same');
  });

  it('never returns "same" for anything but zero', () => {
    // Guards the sign test against being written as a truthiness test, which would fold 0 in with
    // null and lose the distinction the whole module exists to keep.
    const inputs = [-9, -1, 1, 9, null, undefined];
    expect(inputs.map(toRankMovement)).toEqual(['down', 'down', 'up', 'up', null, null]);
  });

  it('is a pure function of its argument, with no table to be given', () => {
    // The old signature took every row in the league because it re-ranked them. A mapper that
    // needed context would be the same mistake in a smaller shape.
    expect(toRankMovement(2)).toBe(toRankMovement(2));
    expect(toRankMovement.length).toBe(1);
  });
});
