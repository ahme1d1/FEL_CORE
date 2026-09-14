import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('../lib/storage.js', () => ({
  getJSON: vi.fn(),
  setJSON: vi.fn(),
  setManyJSON: vi.fn(),
  STORAGE_KEYS: {},
}));

import { activateChip, cancelActiveChip, getChipsState } from './chipsService.js';

const stateDTO = { activeChip: 'wc', chipsUsed: [{ chip: 'bb', gw: 3, ts: 1000 }], canCancelActiveChip: true };

describe('chipsService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('getChipsState calls GET /chips/state', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: stateDTO, error: null });

    // Act
    const res = await getChipsState();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/chips/state');
    expect(res).toEqual({ success: true, data: stateDTO, error: null });
  });

  it('activateChip sends the chip kind lowercase in the path with {gw} body', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: stateDTO, error: null });

    // Act
    const res = await activateChip('wc', 7);

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/chips/wc/activate', { method: 'POST', body: { gw: 7 } });
    expect(res).toEqual({ success: true, data: stateDTO, error: null });
  });

  it('activateChip propagates a rejection (e.g. CHIP_CONFLICT) instead of throwing', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'Another chip is already active.',
      code: 'CHIP_CONFLICT',
    });

    // Act
    const res = await activateChip('bb', 7);

    // Assert
    expect(res).toEqual({ success: false, data: null, error: 'Another chip is already active.', code: 'CHIP_CONFLICT' });
  });

  it('cancelActiveChip calls DELETE /chips/active', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { ...stateDTO, activeChip: null }, error: null });

    // Act
    const res = await cancelActiveChip();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/chips/active', { method: 'DELETE' });
    expect(res.data?.activeChip).toBeNull();
  });
});
