import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

// Same stub pattern as fixturesService.test.ts/snapshotsService.test.ts —
// `./client`'s real implementation needs Nuxt auto-imports unavailable under
// plain vitest.
vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getSquad, saveSquad } from './squadService.js';

const dto = {
  xi: [1, 11, 13, 14, 15, 21, 23, 24, 28, 32, 33],
  bench: [4, 42, 26, 61],
  captain: 32,
  vice: 23,
  formation: '4-4-2',
};

describe('squadService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('getSquad maps the wire SquadDTO to the website Squad shape', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: dto, error: null });

    // Act
    const res = await getSquad();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/squad');
    expect(res).toEqual({ success: true, data: dto, error: null });
  });

  it('getSquad surfaces a failure instead of throwing when captain/vice are missing', async () => {
    // Arrange — a broken server state (shouldn't happen post-onboarding)
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...dto, captain: null, vice: null },
      error: null,
    });

    // Act
    const res = await getSquad();

    // Assert
    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
  });

  it('getSquad propagates a failed upstream response instead of throwing', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'boom', code: 'NOT_FOUND' });

    // Act
    const res = await getSquad();

    // Assert
    expect(res).toEqual({ success: false, data: null, error: 'boom', code: 'NOT_FOUND' });
  });

  it('saveSquad sends a PUT with the lineup-only DTO shape', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: dto, error: null });

    // Act
    const res = await saveSquad({
      xi: dto.xi,
      bench: dto.bench,
      captain: dto.captain,
      vice: dto.vice,
      formation: '4-4-2',
    });

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/squad', { method: 'PUT', body: dto });
    expect(res).toEqual({ success: true, data: dto, error: null });
  });

  it('saveSquad propagates a rejection (e.g. DEADLINE_LOCKED) instead of throwing', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'Deadline passed.', code: 'DEADLINE_LOCKED' });

    // Act
    const res = await saveSquad({
      xi: dto.xi,
      bench: dto.bench,
      captain: dto.captain,
      vice: dto.vice,
      formation: '4-4-2',
    });

    // Assert
    expect(res).toEqual({ success: false, data: null, error: 'Deadline passed.', code: 'DEADLINE_LOCKED' });
  });
});
