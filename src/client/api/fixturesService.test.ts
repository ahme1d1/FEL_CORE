import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

// `./client`'s real implementation pulls in `./session.ts`, which relies on
// Nuxt's auto-imported `ref`/`computed` — unavailable under plain `vitest`
// (no Nuxt test harness here, see `vitest.config.ts`). Stub the module
// directly instead of `vi.importActual` so this stays a pure unit test of
// the service's own mapping logic.
vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getFixtures, getUpcomingFor } from './fixturesService.js';

/**
 * `GET /fixtures` embeds each club whole, so a fixture row is renderable with nothing else
 * fetched — the service maps them through the same `mapClub` `GET /clubs` uses. Only the fields
 * that mapper touches matter here.
 */
const club = (id: string) => ({
  id,
  name: id,
  short: id,
  nameEn: id,
  shortEn: id,
  color: '#000000',
  ink: '#FFFFFF',
  kit: { pattern: 'plain', body: '#000', secondary: '#fff', sleeves: '#000', trim: '#fff' },
  emblem: 'eagle',
  city: '',
  cityEn: '',
  venue: '',
  venueEn: '',
  crestUrl: `/assets/crests/${id}.png`,
  shirtUrl: `/assets/shirts/${id}.png`,
});

describe('getFixtures', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('sends the requested gw as a query param — retires the "same fixtures every GW" mock limitation', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [], error: null });

    await getFixtures(7);

    expect(apiFetchMock).toHaveBeenCalledWith('/fixtures', { query: { gw: 7 } });
  });

  it('recomputes koOffsetMin relative to the response\'s own earliest kickoff', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: [
        { id: '1', gw: 7, home: 'AHL', away: 'ZAM', homeClub: club('AHL'), awayClub: club('ZAM'), kickoffAt: '2026-01-01T12:00:00.000Z', koOffsetMin: 999, status: 'SCHEDULED', homeScore: null, awayScore: null, difficultyHome: 3, difficultyAway: 3, tv: null, venue: null, note: null, boost: false },
        { id: '2', gw: 7, home: 'PYR', away: 'ISM', homeClub: club('PYR'), awayClub: club('ISM'), kickoffAt: '2026-01-01T14:00:00.000Z', koOffsetMin: 999, status: 'SCHEDULED', homeScore: null, awayScore: null, difficultyHome: 3, difficultyAway: 3, tv: null, venue: null, note: null, boost: false },
      ],
      error: null,
    });

    const res = await getFixtures(7);

    expect(res.success && res.data?.[0]?.koOffsetMin).toBe(0);
    expect(res.success && res.data?.[1]?.koOffsetMin).toBe(120);
  });

  it('shares one in-flight request between concurrent readers of the same gameweek', async () => {
    // `PitchFixtures` and `useGwOpponents` both want the current gameweek's card, and both mount
    // on Squad and on Transfers. Without single-flight that is two identical requests per screen;
    // with it the second reader joins the first. Keyed on gw, so a different gameweek still asks.
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [], error: null });

    await Promise.all([getFixtures(3), getFixtures(3), getFixtures(4)]);

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(apiFetchMock).toHaveBeenCalledWith('/fixtures', { query: { gw: 3 } });
    expect(apiFetchMock).toHaveBeenCalledWith('/fixtures', { query: { gw: 4 } });
  });
});

describe('getUpcomingFor', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('passes n as the limit query param and carries the opponent club through', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const fixtures = [{ gw: 15, opp: 'ZAM', oppClub: club('ZAM'), home: true, difficulty: 3 }];
    apiFetchMock.mockResolvedValue({ success: true, data: fixtures, error: null });

    const res = await getUpcomingFor('AHL', 4);

    expect(apiFetchMock).toHaveBeenCalledWith('/fixtures/upcoming/AHL', { query: { limit: 4 } });
    // The embedded opponent is what lets a player-profile chip name its club before the reference
    // cache lands — mapped through `mapClub`, so `emblem` arrives validated rather than raw.
    expect(res.success && res.data?.[0]?.oppClub).toMatchObject({ id: 'ZAM', short: 'ZAM' });
  });
});
