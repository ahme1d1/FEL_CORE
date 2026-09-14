import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { getClubs } from './clubsService.js';

const CLUB_DTO = {
  id: 'AHL',
  name: 'a',
  short: 'a',
  nameEn: 'a',
  shortEn: 'a',
  color: '#000',
  ink: '#fff',
  kit: { pattern: 'plain', body: '#000', secondary: '#fff', sleeves: '#000', trim: '#fff' },
  emblem: 'eagle',
  city: 'c',
  cityEn: 'c',
  venue: 'v',
  venueEn: 'v',
};

describe('getClubs', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('maps a valid emblem straight through', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [CLUB_DTO], error: null });

    const res = await getClubs();

    expect(res.success && res.data?.[0]?.emblem).toBe('eagle');
  });

  it('fails gracefully (not throws) on an unrecognized emblem value — a contract-drift guard', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: [{ ...CLUB_DTO, emblem: 'unknown-emblem' }], error: null });

    const res = await getClubs();

    expect(res.success).toBe(false);
  });

  it('propagates a failed upstream response instead of throwing', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });

    const res = await getClubs();

    expect(res).toEqual({ success: false, data: null, error: 'boom', code: 'NETWORK_ERROR' });
  });
});
