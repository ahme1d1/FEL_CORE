import { describe, expect, it } from 'vitest';

import { FORMATIONS, XI_RULES } from './constants';
import { countByPosition, isValidXI } from './formation';
import { PlayerLookup, PlayerRef, PositionCode } from './types';

/** Standard 15-player pool (ids 1-15): 2 GK / 5 DEF / 5 MID / 3 FWD. */
const POSITIONS: PositionCode[] = [
  'GK',
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'MID',
  'MID',
  'FWD',
  'FWD',
  'FWD',
];

function pool(): PlayerLookup {
  const map = new Map<number, PlayerRef>();
  POSITIONS.forEach((position, i) => {
    map.set(i + 1, { id: i + 1, position, clubId: 'A', currentPriceTenths: 50 });
  });
  return map;
}

describe('FORMATIONS', () => {
  it('lists exactly the shapes XI_RULES admits', () => {
    // REGRESSION GUARD — do not delete. XI_RULES is the real gate, but the
    // formation *label* is separately allow-listed and enforced by `@IsIn` on
    // PUT /squad and onboarding. When the two drifted, 4-5-1 and 5-2-3 were
    // legal lineups the API rejected with a 400 before the engine even ran.
    // FEL_WEBSITE's `FORMATION_IDS` asserts the same invariant on its side.
    const admitted: string[] = [];
    for (let def = XI_RULES.DEF.min; def <= XI_RULES.DEF.max; def++) {
      for (let mid = XI_RULES.MID.min; mid <= XI_RULES.MID.max; mid++) {
        const fwd = 10 - def - mid;
        if (fwd < XI_RULES.FWD.min || fwd > XI_RULES.FWD.max) continue;
        admitted.push(`${def}-${mid}-${fwd}`);
      }
    }

    expect([...admitted].sort()).toEqual([...FORMATIONS].sort());
  });
});

describe('countByPosition', () => {
  it('tallies known players by position and ignores unknown ids', () => {
    expect(countByPosition([1, 2, 3, 8, 13, 999], pool())).toEqual({
      GK: 2,
      DEF: 1,
      MID: 1,
      FWD: 1,
    });
  });
});

describe('isValidXI', () => {
  const players = pool();

  it('accepts legal formations', () => {
    expect(isValidXI([1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], players)).toBe(true); // 4-4-2
    expect(isValidXI([1, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14], players)).toBe(true); // 3-5-2
    expect(isValidXI([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13], players)).toBe(true); // 5-4-1
  });

  it('rejects an XI without exactly one GK', () => {
    expect(isValidXI([3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14], players)).toBe(false); // 0 GK
    expect(isValidXI([1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 14], players)).toBe(false); // 2 GK
  });

  it('rejects positional shortfalls (e.g. 0 forwards)', () => {
    expect(isValidXI([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], players)).toBe(false); // 5 DEF, 5 MID, 0 FWD
  });

  it('rejects the wrong size or unknown players', () => {
    expect(isValidXI([1, 3, 4, 5, 6, 8, 9, 10, 13, 14], players)).toBe(false); // only 10
    expect(isValidXI([99, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], players)).toBe(false); // unknown id
  });
});
