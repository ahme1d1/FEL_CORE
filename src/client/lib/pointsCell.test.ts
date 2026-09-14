import { describe, expect, it } from 'vitest';
import { NO_SCORE, pointsCell } from './pointsCell.js';

const base = { minutes: 90, effectivePoints: 6, pending: false, counts: true };

describe('pointsCell', () => {
  it('shows the points and paints the box when they played', () => {
    expect(pointsCell(base)).toEqual({ text: '6', scored: true, dnp: false });
  });

  it('shows a dash rather than a zero for a player with no minutes', () => {
    // `0` would claim they played and scored nothing, which is a different fact.
    const cell = pointsCell({ ...base, minutes: 0, effectivePoints: 0 });
    expect(cell.text).toBe(NO_SCORE);
    expect(cell.scored).toBe(false);
  });

  it('does not fade a player whose match has not finished', () => {
    // Mid-gameweek, before kickoff, "no minutes" is not yet an absence.
    expect(pointsCell({ ...base, minutes: 0, pending: true }).dnp).toBe(false);
  });

  it('fades a player who was left out of a finished match', () => {
    expect(pointsCell({ ...base, minutes: 0, pending: false }).dnp).toBe(true);
  });

  it('still shows the number on a bench tile, but never paints it', () => {
    // Without Bench Boost the points are real and worth reading; they just did not count.
    const cell = pointsCell({ ...base, counts: false });
    expect(cell.text).toBe('6');
    expect(cell.scored).toBe(false);
  });

  it('uses an en-dash, not a hyphen', () => {
    expect(NO_SCORE).toBe('–');
  });
});
