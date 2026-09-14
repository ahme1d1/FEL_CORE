import { describe, expect, it } from 'vitest';

import { validateSquad } from './squad';
import {
  PlayerLookup,
  PlayerRef,
  PositionCode,
  SquadInput,
  SquadInvalidReason,
} from './types';

/** 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD, 3 per club (A-E). */
function buildPlayers(priceTenths = 50): PlayerLookup {
  const positions: PositionCode[] = [
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
  const clubs = ['A', 'B', 'C', 'D', 'E'];
  const map = new Map<number, PlayerRef>();
  positions.forEach((position, i) => {
    map.set(i + 1, {
      id: i + 1,
      position,
      clubId: clubs[Math.floor(i / 3)],
      currentPriceTenths: priceTenths,
    });
  });
  return map;
}

function validSquad(over: Partial<SquadInput> = {}): SquadInput {
  return {
    xi: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 13,
    vice: 14,
    formation: '4-4-2',
    ...over,
  };
}

const codes = (squad: SquadInput, players: PlayerLookup): SquadInvalidReason[] =>
  validateSquad(squad, players).errors.map((e) => e.code);

describe('validateSquad — final mode', () => {
  it('accepts a legal 2/5/5/3 squad and reports spend/remaining', () => {
    const result = validateSquad(validSquad(), buildPlayers());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.spentTenths).toBe(750);
    expect(result.remainingTenths).toBe(250);
    expect(result.byPosition).toEqual({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
  });

  it('flags an unknown player', () => {
    const squad = validSquad({ xi: [99, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14] });
    expect(codes(squad, buildPlayers())).toContain('PLAYER_NOT_FOUND');
  });

  it('flags wrong positional composition', () => {
    const players = buildPlayers();
    players.set(8, { id: 8, position: 'DEF', clubId: 'C', currentPriceTenths: 50 }); // 6 DEF / 4 MID
    expect(codes(validSquad(), players)).toContain('COMPOSITION');
  });

  it('flags more than 3 from one club', () => {
    const players = buildPlayers();
    players.set(15, { id: 15, position: 'FWD', clubId: 'A', currentPriceTenths: 50 }); // A → 4
    expect(codes(validSquad(), players)).toContain('CLUB_CAP');
  });

  it('flags a squad over the 100.0m budget', () => {
    const result = validateSquad(validSquad(), buildPlayers(80)); // 15 × 8.0m = 120.0m
    expect(result.errors.map((e) => e.code)).toContain('BUDGET');
    expect(result.remainingTenths).toBe(1000 - 1200);
  });

  it('flags captain equal to vice', () => {
    expect(codes(validSquad({ vice: 13 }), buildPlayers())).toContain('CAPTAIN_VICE');
  });

  it('flags a captain or vice outside the XI', () => {
    expect(codes(validSquad({ captain: 2 }), buildPlayers())).toContain('CAPTAIN_NOT_IN_XI');
    expect(codes(validSquad({ vice: 7 }), buildPlayers())).toContain('VICE_NOT_IN_XI');
  });

  it('flags a non-GK in bench[0]', () => {
    expect(codes(validSquad({ bench: [7, 12, 15, 2] }), buildPlayers())).toContain('BENCH_GK');
  });

  it('flags a duplicate player', () => {
    const squad = validSquad({ xi: [1, 3, 3, 5, 6, 8, 9, 10, 11, 13, 14] });
    expect(codes(squad, buildPlayers())).toContain('DUPLICATE');
  });

  it('flags an XI that is not formation-legal even when composition is correct', () => {
    // Both GKs benched → the XI has 0 GK although the 15-man composition is still 2/5/5/3.
    const squad = validSquad({
      xi: [4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15],
      bench: [1, 2, 3, 8],
    });
    expect(codes(squad, buildPlayers())).toContain('XI_ILLEGAL');
  });
});

describe('validateSquad — skipBudget option', () => {
  it('accepts an otherwise-legal squad whose value exceeds 100.0m when skipBudget is set', () => {
    // 15 × 8.0m = 120.0m: rejected by default, accepted on a lineup-only rearrange.
    const overBudget = buildPlayers(80);
    expect(validateSquad(validSquad(), overBudget).valid).toBe(false);

    const result = validateSquad(validSquad(), overBudget, 'final', { skipBudget: true });
    expect(result.valid).toBe(true);
    expect(result.errors.map((e) => e.code)).not.toContain('BUDGET');
  });

  it('still enforces non-budget rules when skipBudget is set', () => {
    const result = validateSquad(validSquad({ vice: 13 }), buildPlayers(80), 'final', {
      skipBudget: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(['CAPTAIN_VICE']);
  });
});

describe('validateSquad — skipArmbands option', () => {
  // The wizard sends no captain or vice: the server derives them from the XI
  // (`rules-engine/armbands.ts`) once the squad is accepted, so `POST /squad/validate` must not
  // refuse a squad for lacking a decision the caller does not make. `POST /manager/onboarding/
  // /complete` already accepts exactly this squad, and a pre-flight that refuses what the write
  // accepts is worse than no pre-flight at all.
  it('skips the captain/vice checks in final mode when the caller chose neither', () => {
    const noArmbands = { ...validSquad(), captain: 0, vice: -1 };
    const result = validateSquad(noArmbands, buildPlayers(), 'final', { skipArmbands: true });
    expect(result.errors.map((e) => e.code)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('still enforces every non-armband rule when skipArmbands is set', () => {
    const codesFor = validateSquad(validSquad({ xi: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 15] }), buildPlayers(), 'final', {
      skipArmbands: true,
    }).errors.map((e) => e.code);
    expect(codesFor).toContain('DUPLICATE');
  });

  it('still refuses absent armbands when the option is NOT set', () => {
    const noArmbands = { ...validSquad(), captain: 0, vice: -1 };
    const codesFor = validateSquad(noArmbands, buildPlayers(), 'final').errors.map((e) => e.code);
    expect(codesFor).toContain('CAPTAIN_NOT_IN_XI');
    expect(codesFor).toContain('VICE_NOT_IN_XI');
  });
});

describe('validateSquad — partial mode', () => {
  it('accepts an under-sized selection within the caps', () => {
    const partial: SquadInput = {
      xi: [1, 3, 8, 13],
      bench: [],
      captain: 1,
      vice: 3,
      formation: '4-4-2',
    };
    const result = validateSquad(partial, buildPlayers(), 'partial');
    expect(result.valid).toBe(true);
  });

  it('still flags exceeding a positional cap', () => {
    const players = buildPlayers();
    // 4 GKs selected (cap is 2).
    players.set(13, { id: 13, position: 'GK', clubId: 'E', currentPriceTenths: 50 });
    players.set(14, { id: 14, position: 'GK', clubId: 'E', currentPriceTenths: 50 });
    const partial: SquadInput = {
      xi: [1, 2, 13, 14],
      bench: [],
      captain: 1,
      vice: 2,
      formation: '4-4-2',
    };
    expect(validateSquad(partial, players, 'partial').errors.map((e) => e.code)).toContain(
      'COMPOSITION',
    );
  });
});
