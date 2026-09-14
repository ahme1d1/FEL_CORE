import { afterEach, describe, expect, it, vi } from 'vitest';

// `./client`'s real implementation pulls in `./session.ts`, which relies on
// Nuxt's auto-imported `ref`/`computed` — unavailable under plain `vitest`
// (no Nuxt test harness here, see `vitest.config.ts`). Stub the module
// directly, mirroring `fixturesService.test.ts`.
const apiFetchMock = vi.fn();
vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { configureApiClient } from '../platform/config.js';
import { getSnapshot } from './snapshotsService.js';

describe('snapshotsService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: 'https://api.test' });
  });

  it('getSnapshot maps GET /squad/snapshots/:gw to GWSquadSnapshot', async () => {
    // Arrange — regression guard: getSnapshot must actually call the real
    // endpoint, not silently fall back to localStorage.
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { xi: [1, 2], bench: [3, 4], captain: 1, vice: 2, formation: '4-4-2', chip: 'bb' },
      error: null,
    });

    // Act
    const res = await getSnapshot(5);

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/squad/snapshots/5');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      gw: 5,
      squad: { xi: [1, 2], bench: [3, 4], captain: 1, vice: 2, formation: '4-4-2' },
      chip: 'bb',
      ts: expect.any(Number),
    });
  });

  it('getSnapshot treats a 404 NOT_FOUND as "no snapshot yet", not a failure', async () => {
    // Arrange — a GW that hasn't locked yet returns 404 server-side.
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'No snapshot for gameweek 9',
      code: 'NOT_FOUND',
    });

    // Act
    const res = await getSnapshot(9);

    // Assert
    expect(res).toEqual({ success: true, data: null, error: null });
  });

  it('getSnapshot propagates a genuine failure instead of throwing', async () => {
    // Arrange
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });

    // Act
    const res = await getSnapshot(5);

    // Assert
    expect(res).toEqual({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });
  });

  it('does not export a bulk getSnapshots() reader (regression guard)', async () => {
    // Arrange / Act — the module under test must only expose the per-GW
    // reader; reintroducing a bulk method here is exactly the bug this file
    // was fixed for (WEBSITE assumed a bulk endpoint FEL_API never had).
    const mod = (await import('./snapshotsService.js')) as Record<string, unknown>;

    // Assert
    expect(mod.getSnapshots).toBeUndefined();
    expect(typeof mod.getSnapshot).toBe('function');
  });
});
