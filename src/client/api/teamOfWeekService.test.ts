import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

// `./client`'s real implementation pulls in `./session.ts`, which relies on Nuxt's auto-imported
// `ref`/`computed` — unavailable under plain `vitest` (no Nuxt harness, see `vitest.config.ts`).
vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getTeamOfWeek, refusalOf } from './teamOfWeekService.js';

afterEach(() => apiFetchMock.mockReset());

/**
 * Every refusal from this endpoint family arrives as a 404, so the machine code is the only thing
 * that tells them apart — and three of the four mean completely different things to a manager.
 */
describe('refusalOf', () => {
  it('reads an unsettled round as normal, not as an error', () => {
    expect(refusalOf({ success: false, data: null, error: 'x', code: 'GAMEWEEK_NOT_SETTLED' })).toBe(
      'notScored',
    );
  });

  it('separates a round that has not kicked off from one that cannot field an eleven', () => {
    expect(refusalOf({ success: false, data: null, error: 'x', code: 'GAMEWEEK_NOT_STARTED' })).toBe(
      'notStarted',
    );
    expect(refusalOf({ success: false, data: null, error: 'x', code: 'GAMEWEEK_NOT_FOUND' })).toBe(
      'none',
    );
    expect(refusalOf({ success: false, data: null, error: 'x', code: 'NOT_FOUND' })).toBe('none');
  });

  it('reads a 404 with NO machine code as the route not being deployed', () => {
    // The website can ship ahead of the API, and "we have not built this on the server" must not
    // read to a manager as "your gameweek is broken".
    expect(refusalOf({ success: false, data: null, error: 'Not Found' })).toBe('notDeployed');
  });

  it('falls back to a plain failure for a code it does not know', () => {
    expect(refusalOf({ success: false, data: null, error: 'x', code: 'TEAPOT' })).toBe('failed');
  });
});

describe('getTeamOfWeek', () => {
  it('opts into a live round, because a web page redraws and a printed card does not', async () => {
    apiFetchMock.mockResolvedValue({ success: true, data: { gw: 3, players: [] }, error: null });

    await getTeamOfWeek(3);

    expect(apiFetchMock).toHaveBeenCalledWith('/gameweeks/3/team-of-week', { query: { live: 1 } });
  });

  it('passes a refusal straight through rather than turning it into an empty eleven', async () => {
    // An empty pitch reads as "nobody scored". The caller has to see the code.
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'x',
      code: 'GAMEWEEK_NOT_SETTLED',
    });

    const res = await getTeamOfWeek(4);

    expect(res.success).toBe(false);
    expect(res.code).toBe('GAMEWEEK_NOT_SETTLED');
  });
});
