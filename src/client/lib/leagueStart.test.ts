import { describe, expect, it } from 'vitest';
import { countsFromGameweek } from './leagueStart.js';

describe('countsFromGameweek', () => {
  it('asks for no label when the API has not shipped the field', () => {
    expect(countsFromGameweek(undefined)).toBeNull();
  });

  it('asks for no label for a league created before the rule existed', () => {
    expect(countsFromGameweek(null)).toBeNull();
  });

  it('asks for no label for a league that has run since the season opened', () => {
    // The whole point of the `> 1` test: a gameweek-1 league's screen must be pixel-identical to
    // what it was before this rule, because its numbers are.
    expect(countsFromGameweek(1)).toBeNull();
  });

  it('labels any league that starts later', () => {
    expect(countsFromGameweek(2)).toBe(2);
    expect(countsFromGameweek(19)).toBe(19);
  });

  it('treats a nonsensical zero as no label rather than drawing "From GW 0"', () => {
    expect(countsFromGameweek(0)).toBeNull();
  });
});
