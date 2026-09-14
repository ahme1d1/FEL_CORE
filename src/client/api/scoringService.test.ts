import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import {
  getGWHighest,
  getGWPrizeWinner,
  getGWStats,
  getLiveSquadGWScore,
  getSquadGWScore,
  enteredScore,
  isNotEntered,
  type GwScoreResult,
  type SquadGWScore,
} from './scoringService.js';
import type { ApiResponse } from './types.js';

const SQUAD = { xi: [1], bench: [2], captain: 1, vice: 2, formation: '4-4-2' as const };

const PLAYER_SCORE = {
  playerId: 1,
  events: {
    playerId: 1, gw: 5, minutes: 90, goals: 1, assists: 0, cleanSheet: false, goalsConceded: 1,
    saves: 0, penSaved: 0, penMissed: 0, yellow: 0, red: 0, ownGoals: 0, bps: 20, bonus: 2,
    defconPoints: 0,
    defconActions: 0,
  },
  rows: [{ kind: 'goals', count: 1, points: 4 }],
  points: 4,
  multiplier: 2,
  effectivePoints: 8,
};

const SCORE_DTO = {
  gw: 5,
  totalPoints: 60,
  grossPoints: 64,
  transferCost: 4,
  xi: [PLAYER_SCORE],
  bench: [],
  autoSubs: [],
  captain: 1,
  vice: 2,
  effectiveCaptain: 1,
  chip: 'tc',
  rank: 12345,
  overallRank: 99,
  isSettled: true,
};

/**
 * Assert a score read landed on the entered arm and return it, so a case can go on reading points.
 * Throwing rather than optional-chaining means a read that silently starts returning not-entered
 * fails loudly here instead of quietly asserting `undefined === undefined`.
 */
function scored(res: ApiResponse<GwScoreResult>): SquadGWScore {
  if (!res.success || !res.data) throw new Error(`expected a score, got: ${res.error}`);
  if (isNotEntered(res.data)) throw new Error('expected an entered score, got not-entered');
  return res.data;
}

describe('scoringService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('getSquadGWScore ignores the mock-only squad/chip/transferCost params and reads /gameweeks/:gw/score', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: SCORE_DTO, error: null });

    const res = await getSquadGWScore(5, SQUAD, 'wc', 999);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/5/score');
    expect(scored(res).totalPoints).toBe(60);
    expect(scored(res).rank).toBe(12345);
    // Regression guard for the breakdown-shape correction: xi[].rows/points/
    // multiplier round-trip unchanged from the wire's ClientPlayerScore.
    expect(scored(res).xi[0]).toEqual({
      playerId: 1,
      events: PLAYER_SCORE.events,
      rows: PLAYER_SCORE.rows,
      points: 4,
      multiplier: 2,
      effectivePoints: 8,
    });
  });

  it('getSquadGWScore surfaces an out-of-range multiplier as a typed failure (matches toChipOrNull\'s pattern) instead of silently coercing it', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...SCORE_DTO, xi: [{ ...PLAYER_SCORE, multiplier: 7 }] },
      error: null,
    });

    const res = await getSquadGWScore(5, SQUAD, null);

    expect(res.success).toBe(false);
    expect(res.success === false && res.error).toContain('multiplier');
  });

  it('getSquadGWScore surfaces a GAMEWEEK_NOT_SETTLED failure via res.code, not a thrown error', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'not settled', code: 'GAMEWEEK_NOT_SETTLED' });

    const res = await getSquadGWScore(5, SQUAD, null);

    expect(res).toEqual({ success: false, data: null, error: 'not settled', code: 'GAMEWEEK_NOT_SETTLED' });
  });

  it('getGWStats reads /gameweeks/:gw/stats and passes {average,highest} through', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { average: 40, highest: 90 }, error: null });

    const res = await getGWStats(5);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/5/stats');
    expect(res).toEqual({ success: true, data: { average: 40, highest: 90 }, error: null });
  });

  it('getGWHighest maps the nested score alongside managerName/teamName/chip', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { managerName: 'X', teamName: 'Y', chip: null, score: SCORE_DTO },
      error: null,
    });

    const res = await getGWHighest(5);

    expect(res.success && res.data?.managerName).toBe('X');
    expect(res.success && res.data?.chip).toBeNull();
    expect(res.success && res.data?.score.totalPoints).toBe(60);
  });

  // The armbands the points pitch draws. Without all three it can only mark the multiplier
  // holder, which is a player the manager may never have captained.
  it('getGWHighest carries captain, vice and effectiveCaptain through the mapper', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { managerName: 'X', teamName: 'Y', chip: null, score: { ...SCORE_DTO, effectiveCaptain: 2 } },
      error: null,
    });

    const res = await getGWHighest(5);

    expect(res.success && res.data?.score).toMatchObject({
      captain: 1,
      vice: 2,
      effectiveCaptain: 2,
    });
  });

  it('getGWPrizeWinner reads /prize-winner and maps the nested score', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { managerName: 'Lin', teamName: 'Larks', score: SCORE_DTO },
      error: null,
    });

    const res = await getGWPrizeWinner(5);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/5/prize-winner');
    expect(res.success && res.data?.managerName).toBe('Lin');
    expect(res.success && res.data?.score.totalPoints).toBe(60);
  });

  // Every manager played a chip. A real gameweek outcome, so it must not read as a failure.
  it('getGWPrizeWinner returns a successful null when nobody is eligible', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: null, error: null });

    const res = await getGWPrizeWinner(5);

    expect(res.success).toBe(true);
    expect(res.success && res.data).toBeNull();
  });

  describe('a gameweek the manager was never in', () => {
    // The production report, 2026-08-22: a brand-new account showed real points for the live
    // gameweek on its own home page. The server now answers a separate arm instead of scoring
    // their current squad against a gameweek that had already locked without them.
    const NOT_ENTERED = { gw: 1, entered: false, firstEligibleGw: 2 };

    it('getSquadGWScore maps the not-entered arm rather than a zeroed score', async () => {
      configureApiClient({ apiBase: 'https://api.test' });
      apiFetchMock.mockResolvedValue({ success: true, data: NOT_ENTERED, error: null });

      const res = await getSquadGWScore(1, SQUAD, null);

      expect(res.success).toBe(true);
      expect(res.data && isNotEntered(res.data)).toBe(true);
      expect(res.data).toEqual({ gw: 1, entered: false, firstEligibleGw: 2, manager: null });
    });

    it('getLiveSquadGWScore maps it too — the home tile polls this one', async () => {
      configureApiClient({ apiBase: 'https://api.test' });
      apiFetchMock.mockResolvedValue({ success: true, data: NOT_ENTERED, error: null });

      const res = await getLiveSquadGWScore(1);

      expect(res.data && isNotEntered(res.data)).toBe(true);
    });

    it('enteredScore collapses it to null, which is what renders the dash', async () => {
      // The tile has no room to explain, so it shows `—`. What it must never show is `0`: that
      // claims a team was fielded and scored nothing.
      configureApiClient({ apiBase: 'https://api.test' });
      apiFetchMock.mockResolvedValue({ success: true, data: NOT_ENTERED, error: null });

      expect(enteredScore(await getLiveSquadGWScore(1))).toBeNull();
    });

    it('reports firstEligibleGw as null for an account that predates the column', async () => {
      configureApiClient({ apiBase: 'https://api.test' });
      apiFetchMock.mockResolvedValue({
        success: true,
        data: { gw: 1, entered: false },
        error: null,
      });

      expect(await getSquadGWScore(1, SQUAD, null)).toMatchObject({
        data: { entered: false, firstEligibleGw: null },
      });
    });

    it('leaves an ordinary payload on the entered arm, untouched', async () => {
      // The other half of the contract: the entered payload is byte-identical to what it always
      // was, so adding this arm cannot have moved anything for a manager who did play.
      configureApiClient({ apiBase: 'https://api.test' });
      apiFetchMock.mockResolvedValue({ success: true, data: SCORE_DTO, error: null });

      const res = await getSquadGWScore(5, SQUAD, null);

      expect(isNotEntered(res.data!)).toBe(false);
      expect(enteredScore(res)?.totalPoints).toBe(60);
    });
  });

  it('getLiveSquadGWScore reads /gameweeks/:gw/live with no mock branch', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { ...SCORE_DTO, rank: null, overallRank: null }, error: null });

    const res = await getLiveSquadGWScore(5);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/5/live');
    expect(scored(res).rank).toBeNull();
  });
});
