import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getGwCurrentFull, getGWState, getHistory, isMatchInPlay } from './gameweekService.js';

const DEADLINE = { gw: 5, iso: 'x', firstKickoffIso: 'y', liveEndIso: 'z', label: 'GW5', isLocked: false };

describe('gameweekService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('getGWState maps displayPhase into the GWState.phase field', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { gw: 5, deadline: DEADLINE, displayPhase: 'locked' }, error: null });

    const res = await getGWState(5);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/5');
    expect(res).toEqual({
      success: true,
      data: { gw: 5, deadline: DEADLINE, phase: 'locked', settled: false },
      error: null,
    });
  });

  // `settled` lets the client tell a scored gameweek from an unreached one —
  // gating on gameweek number alone hid real settled points behind "hasn't
  // been reached yet" after an out-of-order settlement (QA-41).
  it('getGWState carries the settled flag through', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { gw: 4, deadline: DEADLINE, displayPhase: 'finished', settled: true },
      error: null,
    });

    const res = await getGWState(4);

    expect(res.data?.settled).toBe(true);
  });

  it('getGWState fails gracefully (not throws) on an unrecognized phase value', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { gw: 5, deadline: DEADLINE, displayPhase: 'weird' }, error: null });

    const res = await getGWState(5);

    expect(res.success).toBe(false);
  });

  it('getHistory hits /gameweeks/history with no params (server derives the manager from the JWT)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const history = [{ gw: 1, points: 50, captain: 1, totalPoints: 50, rank: 100, ts: 0 }];
    apiFetchMock.mockResolvedValue({ success: true, data: history, error: null });

    const res = await getHistory();

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/history');
    expect(res).toEqual({ success: true, data: history, error: null });
  });

  it('getGwCurrentFull maps the full ClientGwCurrent payload including displayGW', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { currentGW: 6, displayGW: 5, deadline: DEADLINE, displayPhase: 'finished' },
      error: null,
    });

    const res = await getGwCurrentFull();

    expect(res).toEqual({
      success: true,
      data: {
        currentGW: 6,
        displayGW: 5,
        deadline: DEADLINE,
        displayPhase: 'finished',
        displaySettled: false,
        // Absent from this payload on purpose: an API predating step 15 must degrade to "no
        // gameweek boards", not throw on a missing field.
        startedGWs: [],
        // Same degradation for match state: an older API simply never reports a live match,
        // which is the safe direction — no badge beats a badge that lies.
        matches: { inPlayUntilIso: null, nextKickoffIso: null },
      },
      error: null,
    });
  });

  it('propagates a failed upstream response instead of throwing', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'boom', code: 'NOT_FOUND' });

    const res = await getGWState(99);

    expect(res).toEqual({ success: false, data: null, error: 'boom', code: 'NOT_FOUND' });
  });

  it('getGwCurrentFull carries startedGWs through — the rail lists exactly these gameweeks', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        currentGW: 4,
        displayGW: 3,
        deadline: DEADLINE,
        displayPhase: 'live',
        displaySettled: false,
        startedGWs: [1, 2, 3],
      },
      error: null,
    });

    const res = await getGwCurrentFull();

    expect(res.data?.startedGWs).toEqual([1, 2, 3]);
  });

});
/**
 * `isMatchInPlay` is what every «مباشر» badge reads now. It replaced `displayPhase === 'live'`,
 * which derives from three timestamp columns and never consults a fixture — so it stayed true
 * for the whole ~56h between a gameweek's first kickoff and its `liveEndAt`, including the ~40h
 * with no football being played.
 */
describe('isMatchInPlay', () => {
  const T = (iso: string) => Date.parse(iso);

  it('is false when nothing has kicked off and nothing is scheduled', () => {
    expect(isMatchInPlay({ inPlayUntilIso: null, nextKickoffIso: null })).toBe(false);
  });

  it('is true while the server-reported window is still open', () => {
    expect(
      isMatchInPlay(
        { inPlayUntilIso: '2026-08-27T16:00:00.000Z', nextKickoffIso: null },
        T('2026-08-27T15:00:00.000Z')
      )
    ).toBe(true);
  });

  // The state that was lying: matches played earlier, more to come, none on right now.
  it('is false between match days', () => {
    expect(
      isMatchInPlay(
        { inPlayUntilIso: null, nextKickoffIso: '2026-08-27T14:00:00.000Z' },
        T('2026-08-27T02:45:00.000Z')
      )
    ).toBe(false);
  });

  // A tab left open must flip on its own clock rather than waiting for the next poll.
  it('goes live once the next kickoff passes, without a refetch', () => {
    expect(
      isMatchInPlay(
        { inPlayUntilIso: null, nextKickoffIso: '2026-08-27T14:00:00.000Z' },
        T('2026-08-27T14:00:01.000Z')
      )
    ).toBe(true);
  });

  it('is false once a stale window has expired', () => {
    expect(
      isMatchInPlay(
        { inPlayUntilIso: '2026-08-27T16:00:00.000Z', nextKickoffIso: null },
        T('2026-08-27T18:00:00.000Z')
      )
    ).toBe(false);
  });
});
