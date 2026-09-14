import { beforeEach, describe, expect, test } from 'vitest';

import type { PositionCode } from '../data/positions.js';
import type { Player } from '../data/players.js';
import { __setReferenceDataForTests } from '../api/referenceCache.js';

import { canPick, validateSquad } from './squadRules.js';

function mkPlayer(id: number, pos: PositionCode, club = 'AHL', price = 5): Player {
  return { id, name: `P${id}`, club, pos, price, form: 0, total: 0, sel: 0, isActive: true };
}

// 14 owned players worth 98.0m across five clubs — one short of a full squad,
// which is the shape `canPick` is always handed (the vacancy's owner is
// already dropped). Any candidate above 2.0m pushes the 15 past £100.0m.
const CURRENT = [
  mkPlayer(301, 'GK', 'AHL', 7), mkPlayer(302, 'GK', 'ZAM', 7),
  mkPlayer(303, 'DEF', 'AHL', 7), mkPlayer(304, 'DEF', 'ZAM', 7), mkPlayer(305, 'DEF', 'PYR', 7),
  mkPlayer(306, 'DEF', 'ISM', 7), mkPlayer(307, 'DEF', 'MSR', 7),
  mkPlayer(308, 'MID', 'AHL', 7), mkPlayer(309, 'MID', 'ZAM', 7), mkPlayer(310, 'MID', 'PYR', 7),
  mkPlayer(311, 'MID', 'ISM', 7), mkPlayer(312, 'MID', 'MSR', 7),
  mkPlayer(313, 'FWD', 'PYR', 7), mkPlayer(314, 'FWD', 'ISM', 7),
];
const CURRENT_IDS = CURRENT.map((p) => p.id);
const CANDIDATE = mkPlayer(350, 'FWD', 'SMH', 9); // 98.0 + 9.0 = 107.0m
const FOURTH_AHL = mkPlayer(351, 'FWD', 'AHL', 1); // AHL is already at the 3-per-club cap

beforeEach(() => {
  __setReferenceDataForTests([...CURRENT, CANDIDATE, FOURTH_AHL], []);
});

describe('canPick — the £100.0m cap is opt-out, not unconditional', () => {
  test('by default the cap still blocks (the team wizard depends on this)', () => {
    // Building a squad from scratch has no bank to spend, so the static cap IS
    // the rule — `useTeamWizardBuilder` calls `canPick` with no options.
    expect(canPick(CURRENT_IDS, CANDIDATE.id)).toEqual({
      ok: false,
      reason: { key: 'rules.overBudget' },
    });
  });

  test('skipBudget lets a transfer through, because the bank is the funds gate', () => {
    // On the transfers screen the money check is `bank`, which already credits
    // the sell proceeds of every marked-out player. Mirrors what `commit()` and
    // FEL_API's own rules-engine call already do.
    expect(canPick(CURRENT_IDS, CANDIDATE.id, { skipBudget: true })).toEqual({ ok: true });
  });

  test('skipBudget waives only the budget — every other rule still fires', () => {
    expect(canPick(CURRENT_IDS, FOURTH_AHL.id, { skipBudget: true })).toEqual({
      ok: false,
      reason: { key: 'rules.overClubCap', args: { n: 3, club: 'AHL' } },
    });
    expect(canPick(CURRENT_IDS, 301, { skipBudget: true })).toEqual({
      ok: false,
      reason: { key: 'rules.alreadyPicked' },
    });
    expect(canPick([...CURRENT_IDS, CANDIDATE.id], FOURTH_AHL.id, { skipBudget: true })).toEqual({
      ok: false,
      reason: { key: 'rules.squadFull' },
    });
  });

  test('an unknown candidate is rejected before any option is consulted', () => {
    expect(canPick(CURRENT_IDS, 9999, { skipBudget: true })).toEqual({
      ok: false,
      reason: { key: 'rules.unknownPlayer' },
    });
  });
});

describe('validateSquad — skipBudget reporting', () => {
  test('spent and remaining are still reported when the check is skipped', () => {
    // The numbers stay honest so callers can display them; only the error goes.
    const over = validateSquad([...CURRENT_IDS, CANDIDATE.id], undefined, undefined, 'partial', {
      skipBudget: true,
    });
    expect(over.spent).toBe(107);
    expect(over.remaining).toBe(-7);
    expect(over.errors).toEqual([]);
  });
});
