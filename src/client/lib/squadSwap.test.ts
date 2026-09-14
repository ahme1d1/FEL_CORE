import { beforeEach, describe, expect, test } from 'vitest';

import type { Squad } from '../data/initialSquad.js';
import type { PositionCode } from '../data/positions.js';
import type { Player } from '../data/players.js';
import { __setReferenceDataForTests } from '../api/referenceCache.js';

import { canSwap, isValidXI, swapPlayers, xiRules } from './squadSwap.js';
import { TEST_RULES } from '../api/rulesCache.js';

function mkPlayer(id: number, pos: PositionCode, club = 'AHL'): Player {
  return { id, name: `P${id}`, club, pos, price: 5, form: 0, total: 0, sel: 0, isActive: true };
}

// A legal 15 (2/5/5/3). Ids are grouped by position so `xiOf` can slice them.
const GKS = [1, 2];
const DEFS = [3, 4, 5, 6, 7];
const MIDS = [8, 9, 10, 11, 12];
const FWDS = [13, 14, 15];
// Two extras that are NOT in the squad — `isValidXI` only looks positions up,
// so these let us build over-the-cap XIs (a 4th FWD) the 15 can't express.
const EXTRA_FWD = 16;

const ROSTER: Player[] = [
  ...GKS.map((id) => mkPlayer(id, 'GK')),
  ...DEFS.map((id) => mkPlayer(id, 'DEF')),
  ...MIDS.map((id) => mkPlayer(id, 'MID')),
  ...FWDS.map((id) => mkPlayer(id, 'FWD')),
  mkPlayer(EXTRA_FWD, 'FWD'),
];

/** An XI in the given shape, always with exactly one GK. */
function xiOf(def: number, mid: number, fwd: number): number[] {
  return [GKS[0]!, ...DEFS.slice(0, def), ...MIDS.slice(0, mid), ...FWDS.slice(0, fwd)];
}

/** The 4-4-2 default: bench[0] is the reserve GK, captain/vice in the XI. */
const SQUAD_442: Squad = {
  xi: xiOf(4, 4, 2),
  bench: [2, 7, 12, 15],
  captain: 8,
  vice: 9,
  formation: '4-4-2',
};

/** A 4-5-1 whose lone FWD cannot legally leave the XI. */
const SQUAD_451: Squad = {
  xi: xiOf(4, 5, 1),
  bench: [2, 7, 14, 15],
  captain: 8,
  vice: 9,
  formation: '4-5-1',
};

beforeEach(() => {
  __setReferenceDataForTests(ROSTER, []);
});

describe('the served formation list', () => {
  test('lists exactly the shapes the served XI bounds admit', () => {
    // REGRESSION GUARD — do not delete. The bounds are the real legality gate, but the formation
    // *label* is separately allow-listed (`@IsIn(FORMATIONS)` on PUT /squad). When the two
    // drifted, 4-5-1 and 5-2-3 were constructible on the pitch and then rejected on save with a
    // 400. Both lists now come from the SAME response, which is what makes them unable to drift
    // in production — this asserts the server is internally consistent about them, in both
    // directions, against the fixture that mirrors it.

    // Arrange — every DEF/MID/FWD split inside the bounds that fills 10 outfield slots.
    const bounds = xiRules();
    const outfieldSlots = TEST_RULES.xiSize - bounds.GK.min;
    const admitted: string[] = [];
    for (let def = bounds.DEF.min; def <= bounds.DEF.max; def++) {
      for (let mid = bounds.MID.min; mid <= bounds.MID.max; mid++) {
        const fwd = outfieldSlots - def - mid;
        if (fwd < bounds.FWD.min || fwd > bounds.FWD.max) continue;
        admitted.push(`${def}-${mid}-${fwd}`);
      }
    }

    // Assert
    expect([...admitted].sort()).toEqual([...TEST_RULES.formations].sort());
  });

  test('includes the two shapes that used to be missing', () => {
    expect(TEST_RULES.formations).toContain('4-5-1');
    expect(TEST_RULES.formations).toContain('5-2-3');
  });
});

describe('isValidXI', () => {
  test.each([
    ['3-4-3', 3, 4, 3],
    ['3-5-2', 3, 5, 2],
    ['4-3-3', 4, 3, 3],
    ['4-4-2', 4, 4, 2],
    ['4-5-1', 4, 5, 1],
    ['5-2-3', 5, 2, 3],
    ['5-3-2', 5, 3, 2],
    ['5-4-1', 5, 4, 1],
  ])('accepts %s', (_label, def, mid, fwd) => {
    expect(isValidXI(xiOf(def, mid, fwd))).toBe(true);
  });

  test('rejects an XI with no forward', () => {
    expect(isValidXI(xiOf(5, 5, 0))).toBe(false);
  });

  test('rejects a fourth forward', () => {
    expect(isValidXI([GKS[0]!, ...DEFS.slice(0, 3), ...MIDS.slice(0, 3), ...FWDS, EXTRA_FWD])).toBe(false);
  });

  test('rejects two goalkeepers', () => {
    expect(isValidXI([...GKS, ...DEFS.slice(0, 3), ...MIDS.slice(0, 4), ...FWDS.slice(0, 2)])).toBe(false);
  });

  test('rejects an XI that is not eleven players', () => {
    expect(isValidXI(xiOf(4, 4, 2).slice(0, 10))).toBe(false);
  });

  test('rejects an XI containing an unknown player', () => {
    expect(isValidXI([...xiOf(4, 4, 2).slice(0, 10), 999])).toBe(false);
  });
});

describe('canSwap — starters never swap with each other', () => {
  // FPL has no within-XI reorder: pitch rows are derived from position, so this
  // only ever traded two cards on screen. Drag used to allow it (it called
  // canSwap with no group pre-filter) while clicking never offered it.
  test('rejects two starters of the same position', () => {
    expect(canSwap(SQUAD_442, 8, 9)).toBe(false);
  });

  test('rejects two starters of different positions', () => {
    expect(canSwap(SQUAD_442, 3, 8)).toBe(false);
  });

  test('rejects a player swapped with themselves', () => {
    expect(canSwap(SQUAD_442, 8, 8)).toBe(false);
  });
});

describe('canSwap — goalkeepers', () => {
  test('allows the starting keeper to swap with the reserve keeper', () => {
    expect(canSwap(SQUAD_442, 1, 2)).toBe(true);
  });

  test('rejects a keeper swapping with an outfielder', () => {
    expect(canSwap(SQUAD_442, 1, 12)).toBe(false);
    expect(canSwap(SQUAD_442, 3, 2)).toBe(false);
  });
});

describe('canSwap — substitutions', () => {
  test('allows a forward out for a bench midfielder (produces 4-5-1)', () => {
    expect(canSwap(SQUAD_442, 13, 12)).toBe(true);
  });

  test('allows a defender out for a bench midfielder (produces 3-5-2)', () => {
    expect(canSwap(SQUAD_442, 3, 12)).toBe(true);
  });

  test('rejects a substitution that would leave the XI with no forward', () => {
    // 4-5-1 → swapping the lone FWD for a bench DEF gives 5-5-0.
    expect(canSwap(SQUAD_451, 13, 7)).toBe(false);
  });

  test('rejects an unknown player id', () => {
    expect(canSwap(SQUAD_442, 13, 999)).toBe(false);
  });

  test('rejects a player who is in neither the XI nor the bench', () => {
    expect(canSwap(SQUAD_442, 13, EXTRA_FWD)).toBe(false);
  });
});

describe('canSwap — bench order', () => {
  test('allows two bench outfielders to swap (auto-sub priority)', () => {
    expect(canSwap(SQUAD_442, 7, 12)).toBe(true);
  });

  test('rejects the reserve keeper swapping down the bench', () => {
    expect(canSwap(SQUAD_442, 2, 7)).toBe(false);
  });
});

describe('swapPlayers', () => {
  test('re-derives the formation label from the new XI', () => {
    const next = swapPlayers(SQUAD_442, 13, 12);

    expect(next.formation).toBe('4-5-1');
    expect(next.xi).toContain(12);
    expect(next.xi).not.toContain(13);
    expect(next.bench).toContain(13);
    expect(next.bench).not.toContain(12);
  });

  test('keeps the bench order when two bench players swap', () => {
    const next = swapPlayers(SQUAD_442, 7, 12);

    expect(next.bench).toEqual([2, 12, 7, 15]);
    expect(next.formation).toBe('4-4-2');
  });

  test('transfers the armband to the player coming into the XI', () => {
    // Captaincy is bound to the XI slot, not the player — a bench player can
    // never hold it.
    const captainedFwd: Squad = { ...SQUAD_442, captain: 13, vice: 9 };

    const next = swapPlayers(captainedFwd, 13, 12);

    expect(next.captain).toBe(12);
    expect(next.vice).toBe(9);
  });

  test('leaves the armband alone when the holder stays in the XI', () => {
    const next = swapPlayers(SQUAD_442, 13, 12);

    expect(next.captain).toBe(8);
    expect(next.vice).toBe(9);
  });

  test('does not mutate the squad it is given', () => {
    const before = structuredClone(SQUAD_442);

    swapPlayers(SQUAD_442, 13, 12);

    expect(SQUAD_442).toEqual(before);
  });
});
