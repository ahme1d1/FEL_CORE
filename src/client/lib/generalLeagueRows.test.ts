import { describe, expect, it } from 'vitest';

import { fromGeneral } from './generalLeagueRows.js';
import type { GeneralLeagues } from '../api/leaguesService.js';

const OVERALL = 'Overall';

function general(over: Partial<GeneralLeagues> = {}): GeneralLeagues {
  return {
    overall: { rank: 3412, lastRank: 4908, movement: 1496 },
    gameweek: { gw: 3, rank: 1208 },
    ...over,
  };
}

describe('fromGeneral', () => {
  it('puts Overall first and the gameweek second', () => {
    const rows = fromGeneral(general(), OVERALL);

    expect(rows.map((r) => r.key)).toEqual(['overall', 'gw-3']);
    expect(rows[0]!.to).toBe('/app/leagues/overall');
    expect(rows[1]!.to).toBe('/app/leagues/gameweek/3');
  });

  it('gives the gameweek row NO lastRank and NO movement', () => {
    // The rule this exists to pin. That rank is a position within the round, while movement
    // everywhere else is an overall-rank delta — an arrow beside it would measure a different
    // ranking from the number it sits next to, and nothing records a gameweek rank as it stood a
    // gameweek earlier. Asserting the keys are ABSENT, not merely null, is the point: a null would
    // still render a dash under a heading the row has no business appearing under.
    const gwRow = fromGeneral(general(), OVERALL)[1]!;

    expect(gwRow.rank).toBe(1208);
    expect('lastRank' in gwRow).toBe(false);
    expect('movement' in gwRow).toBe(false);
  });

  it('maps the overall movement to an arrow direction, positive being up', () => {
    const rows = fromGeneral(general(), OVERALL);

    expect(rows[0]).toMatchObject({ rank: 3412, lastRank: 4908, movement: 'up' });
  });

  it('draws no arrow when the server cannot say, and never mistakes it for holding station', () => {
    const rows = fromGeneral(
      general({ overall: { rank: 3412, lastRank: null, movement: null } }),
      OVERALL
    );

    expect(rows[0]!.movement).toBeNull();
    expect(rows[0]!.lastRank).toBeNull();
  });

  it('keeps holding station as its own answer', () => {
    const rows = fromGeneral(
      general({ overall: { rank: 3412, lastRank: 3412, movement: 0 } }),
      OVERALL
    );

    expect(rows[0]!.movement).toBe('same');
  });

  it('drops the gameweek row entirely before the season first deadline', () => {
    // Absent, not present-and-empty: there is no gameweek to name yet, so a row labelled with one
    // would be inventing it.
    const rows = fromGeneral(general({ gameweek: null }), OVERALL);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe('overall');
  });

  it('still renders Overall when the whole payload is missing', () => {
    // The endpoint 404s against an API that has not shipped it. The hub must show the row with a
    // dash rather than lose its General section.
    const rows = fromGeneral(null, OVERALL);

    expect(rows).toEqual([
      {
        key: 'overall',
        name: OVERALL,
        to: '/app/leagues/overall',
        rank: null,
        lastRank: null,
        movement: null,
      },
    ]);
  });
});
