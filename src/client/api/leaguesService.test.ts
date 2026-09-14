import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import type { League } from './leaguesService.js';
import {
  isNotEntered,
  type GwScoreResult,
  type SquadGWScore,
} from './scoringService.js';
import type { ApiResponse } from './types.js';
import {
  getCupRound,
  getGameweekBoard,
  getGlobalBoard,
  getH2HState,
  getManagerScore,
  getManagerSquad,
  getMemberScore,
  getMemberSquad,
  isSquadNotEntered,
  createLeague,
  joinByCode,
  leaveLeague,
  listLeagues,
  refreshStandings,
} from './leaguesService.js';

const classicLeague: League = {
  id: 'lg-1',
  code: 'ABC123',
  name: 'Test League',
  type: 'classic',
  createdAt: 0,
  members: [],
  isOwner: true,
  startGameweek: 4,
  locked: false,
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

describe('leaguesService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('listLeagues calls GET /leagues and validates each league type', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [classicLeague], error: null });

    const res = await listLeagues();

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues');
    expect(res).toEqual({ success: true, data: [classicLeague], error: null });
  });

  it('listLeagues surfaces an unrecognized league type as a clean failure instead of rejecting', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [{ ...classicLeague, type: 'KNOCKOUT' }], error: null });

    const res = await listLeagues();

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown league type/);
  });

  it('createLeague sends {name, type} and ignores the unused identity args', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: classicLeague, error: null });

    const res = await createLeague('Test League', 'classic', 'Me', 'My Team', 500);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues', {
      method: 'POST',
      body: { name: 'Test League', type: 'classic' },
    });
    expect(res.data).toEqual(classicLeague);
  });

  it('joinByCode sends {code} to POST /leagues/join', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: classicLeague, error: null });

    await joinByCode('ABC123', 'Me', 'My Team', 500);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/join', { method: 'POST', body: { code: 'ABC123' } });
  });

  it('joinByCode propagates a rejection (e.g. LEAGUE_FULL) instead of throwing', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'This league is full', code: 'LEAGUE_FULL' });

    const res = await joinByCode('ABC123', 'Me', 'My Team', 500);

    expect(res).toEqual({ success: false, data: null, error: 'This league is full', code: 'LEAGUE_FULL' });
  });

  it('leaveLeague DELETEs the membership and returns the remaining leagues', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [], error: null });

    const res = await leaveLeague('lg-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/membership', { method: 'DELETE' });
    expect(res.data).toEqual([]);
  });

  it('refreshStandings (classic) fetches paginated standings and merges rows into the passed league', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const rows = [{ id: 'mgr-9', name: 'A', teamName: 'T', totalPts: 10, gwPts: 2, rank: 1 }];
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: rows, meta: { current_page: 1, per_page: 50, total: 1 } },
      error: null,
    });

    const res = await refreshStandings(classicLeague, 'Me', 'My Team', 500);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/standings', { query: { per_page: 50 } });
    expect(res.data).toEqual({ ...classicLeague, members: rows });
  });

  it('refreshStandings (h2h) re-fetches GET /leagues instead of /standings (row shapes differ)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const h2hLeague: League = { ...classicLeague, id: 'lg-2', type: 'h2h' };
    const fresh: League = { ...h2hLeague, members: [{ id: 'mgr-1', name: 'A', teamName: 'T', totalPts: 5, gwPts: 5, rank: 1 }] };
    apiFetchMock.mockResolvedValue({ success: true, data: [classicLeague, fresh], error: null });

    const res = await refreshStandings(h2hLeague, 'Me', 'My Team', 500);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues');
    expect(res.data).toEqual(fresh);
  });

  it('getMemberSquad requests gw as a query param and surfaces the member chip', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { xi: [1, 2], bench: [3], captain: 1, vice: 2, formation: '4-4-2', chip: 'wc' },
      error: null,
    });

    const res = await getMemberSquad('lg-1', 'mgr-2', 7);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/members/mgr-2/squad', { query: { gw: 7 } });
    expect(res.data).toEqual({
      squad: { xi: [1, 2], bench: [3], captain: 1, vice: 2, formation: '4-4-2' },
      chip: 'wc',
    });
  });

  it('getMemberSquad fails gracefully instead of fabricating an armband when captain/vice are null', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { xi: [1], bench: [2], captain: null, vice: null, formation: '4-4-2' },
      error: null,
    });

    const res = await getMemberSquad('lg-1', 'mgr-2', 7);

    expect(res.success).toBe(false);
  });

  it('getMemberScore requests gw as a query param and maps the score via the shared scoringService parser', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const dto = {
      gw: 7,
      totalPoints: 55,
      grossPoints: 55,
      transferCost: 0,
      xi: [],
      bench: [],
      autoSubs: [],
      effectiveCaptain: 1,
      chip: null,
      rank: 3,
      overallRank: 400,
      isSettled: true,
    };
    apiFetchMock.mockResolvedValue({ success: true, data: dto, error: null });

    const res = await getMemberScore('lg-1', 'mgr-2', 7);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/members/mgr-2/score', { query: { gw: 7 } });
    expect(scored(res).totalPoints).toBe(55);
    expect(scored(res).rank).toBe(3);
  });

  it('getMemberScore omits the query entirely when gw is not passed (server defaults to the latest locked GW)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        gw: 6,
        totalPoints: 10,
        grossPoints: 10,
        transferCost: 0,
        xi: [],
        bench: [],
        autoSubs: [],
        effectiveCaptain: 1,
        chip: null,
        rank: 1,
        overallRank: 1,
        isSettled: true,
      },
      error: null,
    });

    await getMemberScore('lg-1', 'mgr-2');

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/members/mgr-2/score', {});
  });

  it('getMemberScore surfaces SQUAD_HIDDEN via res.code instead of throwing (deadline not passed yet)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'hidden', code: 'SQUAD_HIDDEN' });

    const res = await getMemberScore('lg-1', 'mgr-2', 7);

    expect(res).toEqual({ success: false, data: null, error: 'hidden', code: 'SQUAD_HIDDEN' });
  });

  it('getH2HState calls GET /leagues/:id/h2h', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const state = { currentFixtures: [], table: [], myFixture: null };
    apiFetchMock.mockResolvedValue({ success: true, data: state, error: null });

    const res = await getH2HState(classicLeague);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/h2h');
    expect(res.data).toEqual(state);
  });

  it('asks for a specific gameweek when the picker names one', async () => {
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        currentFixtures: [],
        table: [],
        myFixture: null,
        startGameweek: null,
        gameweek: 7,
        gameweeks: [7],
        ranked: false,
      },
      error: null,
    });

    await getH2HState(classicLeague, 7);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/h2h', { query: { gw: 7 } });
  });

  it('getGlobalBoard requests the given page and maps the paginated response', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const rows = [{ rank: 51, name: 'A', teamName: 'T', totalPts: 900, isMe: false }];
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: rows, meta: { current_page: 2, per_page: 50, total: 120 } },
      error: null,
    });

    const res = await getGlobalBoard('Me', 'My Team', 500, 2);

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/global', { query: { page: 2, per_page: 50 } });
    expect(res.data).toEqual({ items: rows, total: 120, page: 2, limit: 50 });
  });

  it('getGameweekBoard requests /gameweeks/:gw/standings and maps the paginated response', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const rows = [{ rank: 1, name: 'A', teamName: 'T', gwPts: 88, totalPts: 88, isMe: true }];
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: rows, meta: { current_page: 1, per_page: 50, total: 90 } },
      error: null,
    });

    const res = await getGameweekBoard(3);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/3/standings', {
      query: { page: 1, per_page: 50 },
    });
    expect(res.data).toEqual({ items: rows, total: 90, page: 1, limit: 50 });
  });

  it('getGameweekBoard surfaces GAMEWEEK_NOT_SETTLED as a code, not as an empty board', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'not settled',
      code: 'GAMEWEEK_NOT_SETTLED',
    });

    const res = await getGameweekBoard(9);

    // The caller distinguishes this from a request failure to show "not scored yet" rather than an
    // error — and an empty list would read as "nobody scored", which is a different claim.
    expect(res.success).toBe(false);
    expect(res.code).toBe('GAMEWEEK_NOT_SETTLED');
  });

  it('getCupRound calls GET /cup/current, ignoring the unused identity args', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const entry = {
      round: 'Round 2',
      myName: 'Me',
      myTeam: 'My Team',
      myPts: 40,
      oppName: 'Bye',
      oppTeam: '',
      oppPts: 0,
      winnerAdvances: true,
    };
    apiFetchMock.mockResolvedValue({ success: true, data: entry, error: null });

    const res = await getCupRound('Me', 'My Team', 500);

    expect(apiFetchMock).toHaveBeenCalledWith('/cup/current');
    expect(res.data).toEqual(entry);
  });
});

describe('the league-independent manager reads', () => {
  // Reached from the Overall and per-gameweek boards, which rank every manager in the game and so
  // have no league to address one through. Untested before step 18 — and the pair the 404 was
  // reported on.
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  const SQUAD_DTO = {
    xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    bench: [12, 13, 14, 15],
    captain: 10,
    vice: 11,
    formation: '4-4-2',
    chip: null,
    manager: { name: 'Ahmed', teamName: 'Kingz' },
  };

  it('getManagerSquad reads /managers/:id/squad and carries the identity through', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: SQUAD_DTO, error: null });

    const res = await getManagerSquad('mgr-9');

    expect(apiFetchMock).toHaveBeenCalledWith('/managers/mgr-9/squad', {});
    expect(res.success && res.data).toMatchObject({
      squad: { captain: 10, vice: 11, formation: '4-4-2' },
      manager: { name: 'Ahmed', teamName: 'Kingz' },
    });
  });

  it('getManagerSquad answers not-entered, still naming whose team is missing', async () => {
    // The overlay has to title itself with the manager's name even when there is no lineup —
    // which is exactly what a 404 could never do, since the API strips error details outside dev.
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        entered: false,
        gw: 1,
        firstEligibleGw: 2,
        manager: { name: 'Ahmed', teamName: 'Kingz' },
      },
      error: null,
    });

    const res = await getManagerSquad('mgr-9');

    expect(res.success && res.data && isSquadNotEntered(res.data)).toBe(true);
    expect(res.data).toEqual({
      entered: false,
      gw: 1,
      firstEligibleGw: 2,
      manager: { name: 'Ahmed', teamName: 'Kingz' },
    });
  });

  it('getMemberSquad answers not-entered on the league path too', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { entered: false, gw: 3, firstEligibleGw: 4 },
      error: null,
    });

    const res = await getMemberSquad('lg-1', 'mgr-2');

    expect(res.success && res.data && isSquadNotEntered(res.data)).toBe(true);
    expect(res.data).toEqual({ entered: false, gw: 3, firstEligibleGw: 4 });
  });

  /** The entered arm without the step-25 additions, so a case can add them or leave them off. */
  const RIVAL_SCORE = {
    gw: 7,
    totalPoints: 55,
    grossPoints: 55,
    transferCost: 0,
    xi: [],
    bench: [],
    autoSubs: [],
    effectiveCaptain: 1,
    chip: null,
    rank: 3,
    overallRank: 400,
    isSettled: true,
  };

  it('getManagerScore reads /managers/:id/score and maps the entered arm', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        gw: 7,
        totalPoints: 55,
        grossPoints: 55,
        transferCost: 0,
        xi: [],
        bench: [],
        autoSubs: [],
        effectiveCaptain: 1,
        chip: null,
        rank: 3,
        overallRank: 400,
        isSettled: true,
      },
      error: null,
    });

    const res = await getManagerScore('mgr-9');

    expect(apiFetchMock).toHaveBeenCalledWith('/managers/mgr-9/score', {});
    expect(scored(res).totalPoints).toBe(55);
  });

  it('getManagerScore answers not-entered rather than a fabricated total', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { gw: 1, entered: false, firstEligibleGw: 2 },
      error: null,
    });

    const res = await getManagerScore('mgr-9');

    expect(res.success && res.data && isNotEntered(res.data)).toBe(true);
  });

  it('getManagerScore carries the identity and formation, so the sheet needs no squad read', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...RIVAL_SCORE, manager: { name: 'Ahmed', teamName: 'Kingz' }, formation: '4-4-2' },
      error: null,
    });

    const res = await getManagerScore('mgr-9');

    expect(scored(res).manager).toEqual({ name: 'Ahmed', teamName: 'Kingz' });
    expect(scored(res).formation).toBe('4-4-2');
  });

  it('getManagerScore reads a server that predates those fields as null, never as an empty name', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: RIVAL_SCORE, error: null });

    const res = await getManagerScore('mgr-9');

    // Deploy skew: `null` is what makes the sheet fall back to `GET /managers/:id/squad` for the
    // name. An empty string would title the overlay with nothing and never ask again.
    expect(scored(res).manager).toBeNull();
    expect(scored(res).formation).toBeNull();
  });

  it('getManagerScore names the manager on the not-entered arm too', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        gw: 1,
        entered: false,
        firstEligibleGw: 2,
        manager: { name: 'Ahmed', teamName: 'Kingz' },
      },
      error: null,
    });

    const res = await getManagerScore('mgr-9');

    // The arm with no payload to inspect — without the identity here the sheet could only say
    // "this manager was not in this gameweek" about a manager it cannot name.
    expect(res.data).toEqual({
      gw: 1,
      entered: false,
      firstEligibleGw: 2,
      manager: { name: 'Ahmed', teamName: 'Kingz' },
    });
  });

  it('getMemberScore carries them too — one payload definition serves both routes', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...RIVAL_SCORE, manager: { name: 'Sara', teamName: 'Nile FC' }, formation: '3-5-2' },
      error: null,
    });

    const res = await getMemberScore('lg-1', 'mgr-2');

    expect(apiFetchMock).toHaveBeenCalledWith('/leagues/lg-1/members/mgr-2/score', {});
    expect(scored(res).manager).toEqual({ name: 'Sara', teamName: 'Nile FC' });
    expect(scored(res).formation).toBe('3-5-2');
  });
});


describe('leaguesService — the league start gameweek travels with the league', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('preserves startGameweek and locked when a classic refresh replaces the members', async () => {
    // `refreshStandings` rebuilds the league as `{ ...league, members }` from a MEMBERS-only
    // endpoint, so this is the one path where the two fields could silently vanish — and the Total
    // column would quietly stop saying which gameweeks it counts.
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        data: [{ id: 'm1', name: 'A', teamName: 'T', totalPts: 51, gwPts: 11, rank: 1 }],
        meta: { total: 1, current_page: 1, per_page: 50, last_page: 1 },
      },
      error: null,
    });

    const res = await refreshStandings(classicLeague, 'A', 'T', 51);

    expect(res.data).toMatchObject({ startGameweek: 4, locked: false });
    expect(res.data?.members).toHaveLength(1);
  });

  it('carries startGameweek through listLeagues untouched', async () => {
    apiFetchMock.mockResolvedValue({ success: true, data: [classicLeague], error: null });

    const res = await listLeagues();

    expect(res.data?.[0]).toMatchObject({ startGameweek: 4, locked: false });
  });

  it('maps a league from an API that has not shipped the fields yet', async () => {
    // Deploy skew. Both are optional, so the absence must map cleanly rather than throw or be
    // defaulted to a number that would draw a label the server never asked for.
    const { startGameweek: _s, locked: _l, ...older } = classicLeague;
    apiFetchMock.mockResolvedValue({ success: true, data: [older], error: null });

    const res = await listLeagues();

    expect(res.success).toBe(true);
    expect(res.data?.[0]?.startGameweek).toBeUndefined();
    expect(res.data?.[0]?.locked).toBeUndefined();
  });
});
