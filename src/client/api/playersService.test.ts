import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getInjuries, getPlayer, getPriceChanges, listPlayers } from './playersService.js';

const PLAYER = { id: 1, name: 'A', club: 'AHL', pos: 'GK', price: 5, form: 5, total: 10, sel: 10, news: null };

describe('playersService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('listPlayers with a limit passes it straight through as the wire `limit` param, single call', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: [PLAYER], meta: { current_page: 1, per_page: 20, total: 1 } },
      error: null,
    });

    const res = await listPlayers({ pos: 'GK', limit: 20 });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/players', { query: { pos: 'GK', limit: 20 } });
    expect(res).toEqual({ success: true, data: [PLAYER], error: null });
  });

  it('listPlayers with no limit walks pages until it has covered `meta.total`', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock
      .mockResolvedValueOnce({
        success: true,
        data: { data: Array(200).fill(PLAYER), meta: { current_page: 1, per_page: 200, total: 210 } },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { data: Array(10).fill(PLAYER), meta: { current_page: 2, per_page: 200, total: 210 } },
        error: null,
      });

    const res = await listPlayers({});

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(res.success && res.data?.length).toBe(210);
  });

  // The cold-start win, and the only reason the page size was raised: the whole roster in ONE
  // request instead of four. This is the shape the current API answers with.
  it('takes the whole roster in a single request when the server serves a page that big', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: Array(662).fill(PLAYER), meta: { current_page: 1, per_page: 1000, total: 662 } },
      error: null,
    });

    const res = await listPlayers({ scope: 'all' });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(res.success && res.data?.length).toBe(662);
  });

  /**
   * Deploy skew, in the direction that actually happens: this website release reaches production
   * before the API release that raised `PLAYERS_MAX_PER_PAGE`, so the server CLAMPS the requested
   * 1000 down to its own 200 and reports that in `meta.per_page`.
   *
   * A walk that compared the returned row count against the size it ASKED for would read 200 < 1000
   * as "short page, therefore the last page", stop with 200 of 662 players, and then fail
   * `PLAYER_LIST_TRUNCATED` — the whole app zone down, on a change that is supposed to be additive.
   */
  it('keeps walking when the server clamps the page below what was requested', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const page = (n: number, count: number) => ({
      success: true,
      data: { data: Array(count).fill(PLAYER), meta: { current_page: n, per_page: 200, total: 662 } },
      error: null,
    });
    apiFetchMock
      .mockResolvedValueOnce(page(1, 200))
      .mockResolvedValueOnce(page(2, 200))
      .mockResolvedValueOnce(page(3, 200))
      .mockResolvedValueOnce(page(4, 62));

    const res = await listPlayers({ scope: 'all' });

    expect(apiFetchMock).toHaveBeenCalledTimes(4);
    expect(res.success).toBe(true);
    expect(res.success && res.data?.length).toBe(662);
  });

  // The one stop condition that holds even against a server reporting no page size at all — without
  // it a `per_page: 0` response would spin to the runaway guard and fail for the wrong reason.
  it('stops on an empty page rather than trusting the numbers around it', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock
      .mockResolvedValueOnce({
        success: true,
        data: { data: Array(5).fill(PLAYER), meta: { current_page: 1, per_page: 0, total: 99 } },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: { data: [], meta: { current_page: 2, per_page: 0, total: 99 } },
        error: null,
      });

    const res = await listPlayers({ scope: 'all' });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    // Still a loud failure — 5 of 99 is a truncated reference set, which must never render.
    expect(res.code).toBe('PLAYER_LIST_TRUNCATED');
  });

  it('getPlayer maps a PLAYER_NOT_FOUND failure to a successful null result, not an error', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'not found', code: 'PLAYER_NOT_FOUND' });

    const res = await getPlayer(999);

    expect(res).toEqual({ success: true, data: null, error: null });
  });

  it('getInjuries hits /players/injuries and returns the flat array as-is', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [PLAYER], error: null });

    const res = await getInjuries();

    expect(apiFetchMock).toHaveBeenCalledWith('/players/injuries');
    expect(res).toEqual({ success: true, data: [PLAYER], error: null });
  });

  it('getPriceChanges sends the window as an "Nh" string query param', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { risers: [], fallers: [] }, error: null });

    await getPriceChanges(48);

    expect(apiFetchMock).toHaveBeenCalledWith('/players/price-changes', { query: { window: '48h' } });
  });

  it('getPriceChanges tolerates an empty {risers,fallers} response (unseeded price-change job)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { risers: [], fallers: [] }, error: null });

    const res = await getPriceChanges();

    expect(res).toEqual({ success: true, data: { risers: [], fallers: [] }, error: null });
  });

  it('propagates a failed upstream response instead of throwing', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });

    const res = await listPlayers({ limit: 5 });

    expect(res).toEqual({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });
  });
});

describe('playersService — scope', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  // The API already defaults to the market. Sending `scope=market` explicitly would vary the
  // public cache key for every browse read that existed before scope did, for no behaviour.
  it('omits scope entirely for a market read', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: [PLAYER], meta: { current_page: 1, per_page: 20, total: 1 } },
      error: null,
    });

    await listPlayers({ pos: 'GK', limit: 20 });

    expect(apiFetchMock).toHaveBeenCalledWith('/players', { query: { pos: 'GK', limit: 20 } });
  });

  it('sends scope=all for the reference read, so delisted ids come back', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: [PLAYER], meta: { current_page: 1, per_page: 200, total: 1 } },
      error: null,
    });

    await listPlayers({ scope: 'all' });

    expect(apiFetchMock).toHaveBeenCalledWith('/players', {
      query: { scope: 'all', per_page: 1000, page: 1 },
    });
  });

  // A short reference set is worse than none: ids past the cut stop resolving and their tiles
  // vanish off the pitch — the exact defect `scope=all` exists to fix. So it must fail loudly.
  it('fails rather than silently returning a truncated roster', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    // Every page claims a total far beyond what the walk can reach.
    apiFetchMock.mockResolvedValue({
      success: true,
      data: {
        data: Array(1000).fill(PLAYER),
        meta: { current_page: 1, per_page: 1000, total: 99_999 },
      },
      error: null,
    });

    const res = await listPlayers({ scope: 'all' });

    expect(res.success).toBe(false);
    expect(res.code).toBe('PLAYER_LIST_TRUNCATED');
  });
});
