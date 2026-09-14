import { beforeEach, describe, expect, test } from 'vitest';

import type { PositionCode } from '../data/positions.js';
import type { Player } from '../data/players.js';
import { __setReferenceDataForTests } from '../api/referenceCache.js';

import {
  clearReplacementIn,
  markOutIn,
  outIdForIncoming,
  reconcilePendingBasket,
  restoreIn,
  setReplacementIn,
  type PendingTransfer,
} from './pendingBasket.js';

function mkPlayer(id: number, pos: PositionCode, club = 'AHL', price = 5): Player {
  return { id, name: `P${id}`, club, pos, price, form: 0, total: 0, sel: 0, isActive: true };
}

/** 15 owned (2/5/5/3) + a few free agents to swap in. */
const OWNED = [
  mkPlayer(1, 'GK'), mkPlayer(2, 'GK', 'ZAM'),
  mkPlayer(3, 'DEF'), mkPlayer(4, 'DEF', 'ZAM'), mkPlayer(5, 'DEF', 'PYR'),
  mkPlayer(6, 'DEF', 'ISM'), mkPlayer(7, 'DEF', 'MSR'),
  mkPlayer(8, 'MID'), mkPlayer(9, 'MID', 'ZAM'), mkPlayer(10, 'MID', 'PYR'),
  mkPlayer(11, 'MID', 'ISM'), mkPlayer(12, 'MID', 'MSR'),
  mkPlayer(13, 'FWD', 'ZAM'), mkPlayer(14, 'FWD', 'PYR'), mkPlayer(15, 'FWD', 'ISM'),
];
const FREE = [
  mkPlayer(100, 'GK', 'PYR'), mkPlayer(101, 'GK', 'ISM'),
  mkPlayer(102, 'DEF', 'PYR'), mkPlayer(103, 'DEF', 'ISM'),
  mkPlayer(104, 'MID', 'PYR'), mkPlayer(105, 'FWD', 'MSR'),
];
const OWNED_IDS = OWNED.map((p) => p.id);

beforeEach(() => {
  __setReferenceDataForTests([...OWNED, ...FREE], []);
});

describe('markOutIn', () => {
  test('opens a vacancy for a squad player', () => {
    expect(markOutIn([], 3)).toEqual([{ outId: 3, inId: null }]);
  });

  test('is idempotent — marking the same player twice keeps one entry', () => {
    const once = markOutIn([], 3);
    expect(markOutIn(once, 3)).toEqual(once);
  });

  test('does not mutate the input', () => {
    const before: PendingTransfer[] = [];
    markOutIn(before, 3);
    expect(before).toEqual([]);
  });
});

describe('restoreIn', () => {
  test('drops the whole entry, replacement included', () => {
    const pending = [{ outId: 3, inId: 102 }, { outId: 8, inId: null }];
    expect(restoreIn(pending, 3)).toEqual([{ outId: 8, inId: null }]);
  });
});

describe('setReplacementIn', () => {
  test('fills an existing vacancy in place', () => {
    const pending = [{ outId: 3, inId: null }, { outId: 8, inId: null }];
    expect(setReplacementIn(pending, 3, 102)).toEqual([
      { outId: 3, inId: 102 },
      { outId: 8, inId: null },
    ]);
  });

  test('appends when the slot is not in the basket yet', () => {
    expect(setReplacementIn([], 3, 102)).toEqual([{ outId: 3, inId: 102 }]);
  });
});

describe('clearReplacementIn', () => {
  test('nulls only the targeted incoming pick', () => {
    const pending = [{ outId: 3, inId: 102 }, { outId: 8, inId: 104 }];
    expect(clearReplacementIn(pending, 3)).toEqual([
      { outId: 3, inId: null },
      { outId: 8, inId: 104 },
    ]);
  });

  test('keeps the reopened vacancy at its original index', () => {
    // `firstVacancyFor` scans in array order, so a reopened slot moving to the
    // end would silently change which vacancy the next "+" fills.
    const pending = [
      { outId: 3, inId: 102 },
      { outId: 5, inId: null },
      { outId: 8, inId: 104 },
    ];
    const next = clearReplacementIn(pending, 3);
    expect(next.map((p) => p.outId)).toEqual([3, 5, 8]);
    expect(next[0]).toEqual({ outId: 3, inId: null });
  });

  test('leaves untouched entries referentially identical', () => {
    const untouched = { outId: 8, inId: 104 };
    const next = clearReplacementIn([{ outId: 3, inId: 102 }, untouched], 3);
    expect(next[1]).toBe(untouched);
  });

  test('is a no-op for an outId that is not in the basket', () => {
    const pending = [{ outId: 3, inId: 102 }];
    expect(clearReplacementIn(pending, 999)).toEqual(pending);
  });
});

describe('outIdForIncoming', () => {
  test('resolves an incoming player back to the slot he fills', () => {
    expect(outIdForIncoming([{ outId: 3, inId: 102 }], 102)).toBe(3);
  });

  test('returns null when the player is not an incoming pick', () => {
    expect(outIdForIncoming([{ outId: 3, inId: 102 }], 999)).toBeNull();
  });
});

describe('reconcilePendingBasket', () => {
  test('leaves a valid basket untouched and reports no change', () => {
    const pending = [{ outId: 3, inId: 102 }, { outId: 8, inId: null }];
    const res = reconcilePendingBasket(pending, OWNED_IDS);
    expect(res.changed).toBe(false);
    expect(res.pending).toEqual(pending);
  });

  test('downgrades to an open vacancy when the incoming half went stale, keeping the length', () => {
    // Another tab bought 102 — the "sell 3" intent is still valid and must
    // survive as a vacancy rather than being silently discarded.
    const pending = [{ outId: 3, inId: 102 }];
    const res = reconcilePendingBasket(pending, [...OWNED_IDS, 102]);
    expect(res.pending).toEqual([{ outId: 3, inId: null }]);
    // The length is unchanged — which is exactly why callers must branch on
    // `changed` and never on a length comparison.
    expect(res.pending).toHaveLength(pending.length);
    expect(res.changed).toBe(true);
  });

  test('downgrades when the replacement no longer matches the outgoing position', () => {
    const res = reconcilePendingBasket([{ outId: 3, inId: 104 }], OWNED_IDS); // DEF out, MID in
    expect(res.pending).toEqual([{ outId: 3, inId: null }]);
    expect(res.changed).toBe(true);
  });

  test('downgrades a self-swap', () => {
    const res = reconcilePendingBasket([{ outId: 3, inId: 3 }], OWNED_IDS);
    expect(res.pending).toEqual([{ outId: 3, inId: null }]);
    expect(res.changed).toBe(true);
  });

  test('drops the entry entirely when the outgoing player is no longer owned', () => {
    const res = reconcilePendingBasket(
      [{ outId: 3, inId: 102 }],
      OWNED_IDS.filter((id) => id !== 3),
    );
    expect(res.pending).toEqual([]);
    expect(res.changed).toBe(true);
  });

  test('drops an unknown outgoing player', () => {
    const res = reconcilePendingBasket([{ outId: 9999, inId: null }], OWNED_IDS);
    expect(res.pending).toEqual([]);
    expect(res.changed).toBe(true);
  });

  test('drops a duplicated outgoing slot, keeping the first', () => {
    const res = reconcilePendingBasket(
      [{ outId: 3, inId: 102 }, { outId: 3, inId: 103 }],
      OWNED_IDS,
    );
    expect(res.pending).toEqual([{ outId: 3, inId: 102 }]);
    expect(res.changed).toBe(true);
  });

  test('downgrades the second claim on a duplicated incoming player', () => {
    const res = reconcilePendingBasket(
      [{ outId: 3, inId: 102 }, { outId: 5, inId: 102 }],
      OWNED_IDS,
    );
    expect(res.pending).toEqual([{ outId: 3, inId: 102 }, { outId: 5, inId: null }]);
    expect(res.changed).toBe(true);
  });

  test('survives malformed entries', () => {
    // One malformed row must not take the whole basket down with it.
    const junk = [
      { outId: '3', inId: null },
      null,
      { inId: 102 },
      { outId: 8, inId: null },
    ] as unknown as PendingTransfer[];
    const res = reconcilePendingBasket(junk, OWNED_IDS);
    expect(res.pending).toEqual([{ outId: 8, inId: null }]);
    expect(res.changed).toBe(true);
  });
});
