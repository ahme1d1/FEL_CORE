import { beforeEach, describe, expect, test } from 'vitest';

import type { PositionCode } from '../data/positions.js';
import type { Player } from '../data/players.js';
import { __setReferenceDataForTests } from '../api/referenceCache.js';

import {
  buildEligibility,
  buildSlotStates,
  effectiveCurrent,
  effectiveIds,
  firstVacancyFor,
  type EligibilityCtx,
} from './transferEligibility.js';

function mkPlayer(id: number, pos: PositionCode, club = 'AHL', price = 5): Player {
  return { id, name: `P${id}`, club, pos, price, form: 0, total: 0, sel: 0, isActive: true };
}

// A legal 15 (2/5/5/3) spread across exactly five clubs at the 3-per-club cap.
// Every club is therefore full, so a signing is club-legal only when the
// vacancy being filled frees that same club — which is what the cap tests
// below exercise. Free agents use SMH, a sixth club with nobody in the squad.
const OWNED = [
  mkPlayer(1, 'GK', 'AHL'), mkPlayer(2, 'GK', 'ZAM'),
  mkPlayer(3, 'DEF', 'AHL'), mkPlayer(4, 'DEF', 'ZAM'), mkPlayer(5, 'DEF', 'PYR'),
  mkPlayer(6, 'DEF', 'ISM'), mkPlayer(7, 'DEF', 'MSR'),
  mkPlayer(8, 'MID', 'AHL'), mkPlayer(9, 'MID', 'ZAM'), mkPlayer(10, 'MID', 'PYR'),
  mkPlayer(11, 'MID', 'ISM'), mkPlayer(12, 'MID', 'MSR'),
  mkPlayer(13, 'FWD', 'MSR'), mkPlayer(14, 'FWD', 'PYR'), mkPlayer(15, 'FWD', 'ISM'),
];
const FREE = [
  mkPlayer(100, 'GK', 'AHL'), // 4th AHL — pickable only once an AHL player leaves
  mkPlayer(101, 'GK', 'SMH'),
  mkPlayer(102, 'DEF', 'AHL'), // ditto
  mkPlayer(103, 'DEF', 'SMH'),
  mkPlayer(104, 'DEF', 'SMH'),
  mkPlayer(105, 'MID', 'SMH'),
  mkPlayer(106, 'FWD', 'SMH', 9.5),
];
const SQUAD_IDS = OWNED.map((p) => p.id);

function ctx(pending: EligibilityCtx['pending'], bank = 100): EligibilityCtx {
  return { squadIds: SQUAD_IDS, pending, bank };
}

function reason(candidateId: number, c: EligibilityCtx) {
  const candidate = [...OWNED, ...FREE].find((p) => p.id === candidateId)!;
  return buildEligibility([candidate], c).get(candidateId);
}

beforeEach(() => {
  __setReferenceDataForTests([...OWNED, ...FREE], []);
});

describe('buildSlotStates', () => {
  test('classifies every id the squad and basket touch', () => {
    const states = buildSlotStates({
      squadIds: SQUAD_IDS,
      pending: [{ outId: 3, inId: 102 }, { outId: 5, inId: null }],
    });
    expect(states.get(4)).toBe('owned'); //   untouched squad member
    expect(states.get(5)).toBe('markedOut'); // sold, no replacement yet
    expect(states.get(3)).toBe('swappedOut'); // sold and replaced
    expect(states.get(102)).toBe('pendingIn'); // the incoming pick
    expect(states.get(999)).toBeUndefined(); // caller treats absent as 'free'
  });

  test('a basket entry always wins over raw squad membership', () => {
    // The bug this replaces read squad membership alone, which does not change
    // until commit — so a just-sold player still rendered as owned.
    const states = buildSlotStates({ squadIds: SQUAD_IDS, pending: [{ outId: 3, inId: null }] });
    expect(states.get(3)).toBe('markedOut');
  });
});

describe('firstVacancyFor', () => {
  test('returns the first unfilled vacancy in basket order', () => {
    const c = ctx([{ outId: 3, inId: null }, { outId: 5, inId: null }]);
    expect(firstVacancyFor('DEF', c)).toBe(3);
  });

  test('skips vacancies that are already filled', () => {
    const c = ctx([{ outId: 3, inId: 102 }, { outId: 5, inId: null }]);
    expect(firstVacancyFor('DEF', c)).toBe(5);
  });

  test('returns null when no vacancy matches the position', () => {
    expect(firstVacancyFor('FWD', ctx([{ outId: 3, inId: null }]))).toBeNull();
  });
});

describe('effectiveIds / effectiveCurrent', () => {
  test('effectiveIds applies filled swaps and keeps unfilled outs owned', () => {
    const ids = effectiveIds(ctx([{ outId: 3, inId: 102 }, { outId: 5, inId: null }]));
    expect(ids.has(3)).toBe(false);
    expect(ids.has(102)).toBe(true);
    expect(ids.has(5)).toBe(true);
  });

  test('effectiveCurrent drops the open vacancy and applies filled swaps', () => {
    const current = effectiveCurrent(ctx([{ outId: 3, inId: 102 }, { outId: 5, inId: null }]));
    expect(current).toHaveLength(14);
    expect(current).not.toContain(5);
    expect(current).not.toContain(3);
    expect(current).toContain(102);
  });

  test('effectiveCurrent drops EVERY open vacancy, not just one', () => {
    // The defect in one assertion: with two slots open the probe set must be 13, and neither
    // sold player may still be counted — against the club cap or anything else.
    const current = effectiveCurrent(ctx([{ outId: 3, inId: null }, { outId: 4, inId: null }]));
    expect(current).toHaveLength(13);
    expect(current).not.toContain(3);
    expect(current).not.toContain(4);
  });
});

describe('buildEligibility — outgoing guard', () => {
  test('a marked-out player reports "outgoing", not "already picked"', () => {
    // He is on his way out; cancelling that is `restore`, not a buy.
    expect(reason(3, ctx([{ outId: 3, inId: null }]))).toEqual({ kind: 'outgoing' });
  });

  test('a swapped-out player stays ineligible even with another same-position vacancy open', () => {
    // REGRESSION GUARD — do not delete. `effectiveIds` already removes a
    // player whose swap is filled, so without the outgoing guard he reads as
    // eligible, `firstVacancyFor('DEF')` hands back the *other* open slot, and
    // "+" builds {outId: 5, inId: 3} — a basket that passes canSave and is
    // then rejected by commit()'s ownedSet.has(inId) check with no way to
    // clear it.
    const c = ctx([{ outId: 3, inId: 102 }, { outId: 5, inId: null }]);
    expect(firstVacancyFor('DEF', c)).toBe(5); // a vacancy really is open
    expect(reason(3, c)).toEqual({ kind: 'outgoing' });
  });

  test('an incoming pick reports "already picked"', () => {
    expect(reason(102, ctx([{ outId: 3, inId: 102 }]))).toEqual({
      kind: 'rule',
      error: { key: 'rules.alreadyPicked' },
    });
  });

  test('an untouched squad member reports "already picked"', () => {
    expect(reason(4, ctx([]))).toEqual({ kind: 'rule', error: { key: 'rules.alreadyPicked' } });
  });
});

describe('buildEligibility — club cap', () => {
  test('selling an AHL keeper frees the club slot for another AHL keeper', () => {
    // Squad holds 3 AHL (1, 3, 8). Selling GK 1 drops it to 2, so a 4th AHL
    // signing is legal again.
    expect(reason(100, ctx([{ outId: 1, inId: null }]))).toBeNull();
  });

  test('a vacancy that frees no AHL slot still blocks a 4th AHL signing', () => {
    // Selling ZAM defender 4 opens a DEF vacancy but leaves AHL at 3.
    expect(reason(102, ctx([{ outId: 4, inId: null }]))).toEqual({
      kind: 'rule',
      error: { key: 'rules.overClubCap', args: { n: 3, club: 'AHL' } },
    });
  });

  test('selling the AHL defender frees the slot for a different AHL defender', () => {
    expect(reason(102, ctx([{ outId: 3, inId: null }]))).toBeNull();
  });
});

/**
 * The owner-reported defect: sell two players, and the club cap still counts one of them.
 *
 * `effectiveCurrentFor` dropped only the vacancy `firstVacancyFor` happened to return — the
 * FIRST unfilled out of that position in basket order, not the slot the manager just opened.
 * Every other marked-out player stayed in the counted squad, so selling the AHL midfielder and
 * then a second midfielder left AHL sitting at 3 and refused a replacement the manager could
 * plainly make.
 *
 * The tell is that the answer depended on REMOVAL ORDER while the resulting squad did not:
 * sell ZAM-then-AHL and the row was blocked, sell AHL-then-ZAM and the identical basket allowed
 * it. Reproduced live on production with the real squad before this was written.
 *
 * The three cases above cannot catch it: each has a single unfilled out, which is the one case
 * where dropping "the vacancy" and dropping "every vacancy" agree.
 */
describe('buildEligibility — club cap across two open vacancies', () => {
  test('a second sale from the capped club frees its slot even when sold last', () => {
    // Arrange — sell ZAM defender 4 first, then AHL defender 3. AHL ends on 2.
    const c = ctx([{ outId: 4, inId: null }, { outId: 3, inId: null }]);

    // Act / Assert — a 4th AHL defender is now a legal signing.
    expect(reason(102, c)).toBeNull();
  });

  test('the same two sales give the same answer in either order', () => {
    // Arrange — one basket, two removal orders. Same squad, same legality.
    const zamFirst = ctx([{ outId: 4, inId: null }, { outId: 3, inId: null }]);
    const ahlFirst = ctx([{ outId: 3, inId: null }, { outId: 4, inId: null }]);

    // Act / Assert — order is a UI detail, never a rule.
    expect(reason(102, zamFirst)).toEqual(reason(102, ahlFirst));
  });

  test('two sales that free no AHL slot still block a 4th AHL signing', () => {
    // Arrange — ZAM and PYR defenders out; AHL is untouched and still at 3.
    const c = ctx([{ outId: 4, inId: null }, { outId: 5, inId: null }]);

    // Act / Assert — the cap is real here, so it must still bite.
    expect(reason(102, c)).toEqual({
      kind: 'rule',
      error: { key: 'rules.overClubCap', args: { n: 3, club: 'AHL' } },
    });
  });

  test('a filled swap still counts its incoming player against the cap', () => {
    // Arrange — AHL midfielder 8 already replaced by AHL defender 102 is a nonsense swap, so
    // use the honest shape: sell AHL 3, sign AHL 102 into it, then sell ZAM 4. AHL is back to 3.
    const c = ctx([{ outId: 3, inId: 102 }, { outId: 4, inId: null }]);

    // Act / Assert — the DEF vacancy is 4, and AHL has no room left.
    expect(firstVacancyFor('DEF', c)).toBe(4);
    expect(reason(103, c)).toBeNull(); //     SMH defender — unaffected by the AHL cap
    expect(reason(100, c)).toEqual({ //       a 4th AHL (keeper) has no vacancy anyway
      kind: 'noVacancy',
      pos: 'GK',
    });
  });
});

describe('buildEligibility — vacancy and funds', () => {
  test('no matching vacancy is reported before any rule or funds check', () => {
    // Empty basket: nothing is open, so every free agent is blocked on that
    // alone — not on money.
    expect(reason(101, ctx([], 0))).toEqual({ kind: 'noVacancy', pos: 'GK' });
  });

  test('an exactly-affordable player passes', () => {
    expect(reason(106, ctx([{ outId: 13, inId: null }], 9.5))).toBeNull();
  });

  test('one tenth short reports noFunds', () => {
    expect(reason(106, ctx([{ outId: 13, inId: null }], 9.4))).toEqual({ kind: 'noFunds' });
  });
});

describe('buildEligibility — the reported remove/add/remove/add sequence', () => {
  test('dropping a replacement reopens the same slot for the next signing', () => {
    // remove 3 → add 102 → remove 102 → add 103
    const afterRemove = ctx([{ outId: 3, inId: null }]);
    expect(reason(102, afterRemove)).toBeNull();

    const afterAdd = ctx([{ outId: 3, inId: 102 }]);
    expect(firstVacancyFor('DEF', afterAdd)).toBeNull(); // slot is filled

    // The "×" on 102 clears only the pick; player 3 must NOT return.
    const afterDropIn = ctx([{ outId: 3, inId: null }]);
    expect(firstVacancyFor('DEF', afterDropIn)).toBe(3);
    expect(reason(103, afterDropIn)).toBeNull();
  });
});

/**
 * The owner-reported defect: with a full squad, sell two players, then try to
 * buy a replacement the bank plainly covers — the row was greyed with
 * `rules.overBudget` ("تجاوزت الميزانية").
 *
 * The fixtures above can't reach this: every player costs 5.0m, so a full 15
 * is 75.0m and the static £100.0m cap is never approached. This one mirrors a
 * real squad — Σ 99.0m with 1.0m banked, the exact shape reproduced on dev.
 *
 * `buildEligibility` runs two money gates. The bank check credits the sell
 * proceeds of EVERY marked-out player; `canPick` used to re-check the static
 * cap against current list prices, and `effectiveCurrentFor` only drops the
 * one vacancy being filled — so every *other* unfilled sale was still counted
 * at full price and its money was invisible. One removal looked fine; the
 * second one broke it.
 */
describe('buildEligibility — two sales fund a buy the static cap would refuse', () => {
  // 2/5/5/3 across five clubs at the 3-per-club cap. Σ = 99.0m, so a squad
  // that legitimately spent almost all of its 100.0m budget.
  const NEAR_CAP = [
    mkPlayer(201, 'GK', 'AHL', 5.5), mkPlayer(202, 'GK', 'ZAM', 5.5),
    mkPlayer(203, 'DEF', 'AHL', 6.5), mkPlayer(204, 'DEF', 'ZAM', 6), mkPlayer(205, 'DEF', 'PYR', 5),
    mkPlayer(206, 'DEF', 'ISM', 6), mkPlayer(207, 'DEF', 'MSR', 4),
    mkPlayer(208, 'MID', 'AHL', 7.5), mkPlayer(209, 'MID', 'ZAM', 7.5), mkPlayer(210, 'MID', 'PYR', 8.5),
    mkPlayer(211, 'MID', 'ISM', 7.5), mkPlayer(212, 'MID', 'MSR', 8.5),
    mkPlayer(213, 'FWD', 'PYR', 6), mkPlayer(214, 'FWD', 'ISM', 6), mkPlayer(215, 'FWD', 'MSR', 9),
  ];
  // Free agents at a sixth club, so the 3-per-club cap never confounds a result.
  const TARGET = mkPlayer(250, 'FWD', 'SMH', 14);
  const TOO_DEAR = mkPlayer(251, 'FWD', 'SMH', 17);
  const NEAR_CAP_IDS = NEAR_CAP.map((p) => p.id);

  /** Server bank 1.0m + the sell proceeds of everything marked out (no price drift). */
  function nearCapCtx(pending: EligibilityCtx['pending']): EligibilityCtx {
    const bank = pending.reduce(
      (sum, p) => sum + (NEAR_CAP.find((x) => x.id === p.outId)?.price ?? 0),
      1,
    );
    return { squadIds: NEAR_CAP_IDS, pending, bank: Math.round(bank * 10) / 10 };
  }

  function nearCapReason(candidate: Player, pending: EligibilityCtx['pending']) {
    return buildEligibility([candidate], nearCapCtx(pending)).get(candidate.id);
  }

  beforeEach(() => {
    __setReferenceDataForTests([...NEAR_CAP, TARGET, TOO_DEAR], []);
  });

  test('one sale leaves the 14.0m striker honestly out of reach', () => {
    // Bank 1.0 + 9.0 = 10.0. He costs 14.0, so "not enough in the bank" is the
    // truth here — this is the state the manager sees before the second sale.
    expect(nearCapReason(TARGET, [{ outId: 215, inId: null }])).toEqual({ kind: 'noFunds' });
  });

  test('REGRESSION: the second sale must make him affordable', () => {
    // Bank 1.0 + 9.0 + 6.0 = 16.0 against a 14.0m price. Before the fix this
    // returned rules.overBudget: canPick still counted the *other* sold striker
    // (213, 6.0m) at full price, so it tested 99.0 − 9.0 + 14.0 = 104.0 > 100.0
    // and refused a transfer the server would have accepted.
    const pending = [{ outId: 215, inId: null }, { outId: 213, inId: null }];
    expect(nearCapCtx(pending).bank).toBe(16);
    expect(nearCapReason(TARGET, pending)).toBeNull();
  });

  test('the bank is still a real gate, not a deleted one', () => {
    // 17.0m against the same 16.0m bank — dropping the static cap must not make
    // everything buyable.
    const pending = [{ outId: 215, inId: null }, { outId: 213, inId: null }];
    expect(nearCapReason(TOO_DEAR, pending)).toEqual({ kind: 'noFunds' });
  });

  test('squad rules other than the budget still block a signing', () => {
    // A 4th player from a club already at the cap, priced well inside the bank.
    const fourthMSR = mkPlayer(252, 'FWD', 'MSR', 5);
    __setReferenceDataForTests([...NEAR_CAP, TARGET, TOO_DEAR, fourthMSR], []);
    // Sell the PYR striker, so the vacancy frees no MSR slot.
    expect(nearCapReason(fourthMSR, [{ outId: 213, inId: null }])).toEqual({
      kind: 'rule',
      error: { key: 'rules.overClubCap', args: { n: 3, club: 'MSR' } },
    });
  });
});
