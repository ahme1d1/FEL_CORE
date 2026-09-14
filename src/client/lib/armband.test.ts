import { describe, expect, test } from 'vitest';

import { armbandFor } from './armband.js';

const flags = (over: Partial<Parameters<typeof armbandFor>[1]> = {}) => ({
  captain: false,
  vice: false,
  demotedCaptain: false,
  ...over,
});

describe('armbandFor', () => {
  test('draws a plain C for an ordinary captain', () => {
    expect(armbandFor(2, flags({ captain: true }))).toEqual({ type: 'C', tripled: false, struck: false });
  });

  // The server sets multiplier 3 only under Triple Captain (`gw-score.ts` — `chip === 'TC' ? 3 : 2`),
  // so the multiplier alone is enough to tell the two apart without a chip prop.
  test('carries the multiplier for a captain under Triple Captain', () => {
    expect(armbandFor(3, flags({ captain: true }))).toEqual({ type: 'C', tripled: true, struck: false });
  });

  test('draws a drained C for a captain whose vice was promoted over them', () => {
    expect(armbandFor(1, flags({ demotedCaptain: true }))).toEqual({ type: 'C', tripled: false, struck: true });
  });

  test('draws a V for a vice who was not promoted', () => {
    expect(armbandFor(1, flags({ vice: true }))).toEqual({ type: 'V', tripled: false, struck: false });
  });

  test('draws nothing for an ordinary XI player', () => {
    expect(armbandFor(1, flags())).toBeNull();
  });

  /**
   * The case the whole extraction exists for. Under TC with a blanking captain the server
   * promotes the vice and puts the x3 on THEM, so `PointsPitch` binds `captain: true` on the
   * player who was submitted as vice — and their badge must carry the x3, not read V.
   */
  test('carries the multiplier on a vice promoted into a Triple Captain armband', () => {
    expect(armbandFor(3, flags({ captain: true, vice: true }))).toEqual({
      type: 'C',
      tripled: true,
      struck: false,
    });
  });

  // Captaincy outranks a stale vice flag, and a demoted captain never outranks the live one.
  test('prefers the live captain over a demoted flag on the same player', () => {
    expect(armbandFor(2, flags({ captain: true, demotedCaptain: true }))).toEqual({
      type: 'C',
      tripled: false,
      struck: false,
    });
  });
});
