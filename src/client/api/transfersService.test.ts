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

import { commitSwaps, getState } from './transfersService.js';

const stateDTO = {
  freeTransfers: 2,
  bank: 3.5,
  history: [],
  purchases: { 1: 5.5 },
  activeChip: null,
  chipsUsed: [],
};

describe('transfersService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('getState calls GET /transfers/state', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: stateDTO, error: null });

    // Act
    const res = await getState();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/transfers/state');
    expect(res).toEqual({ success: true, data: stateDTO, error: null });
  });

  it('commitSwaps sends the swaps body and forwards the Idempotency-Key header', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    const commitResult = {
      commit: { ts: 1000, gw: 7, swaps: [{ outId: 1, inId: 2, outSellPrice: 5, inPurchasePrice: 6 }], cost: 0, chipUsed: null },
      squad: { xi: [], bench: [], captain: 1, vice: 2, formation: '4-4-2' },
      freeTransfers: 1,
      bank: 2.5,
    };
    apiFetchMock.mockResolvedValue({ success: true, data: commitResult, error: null });

    // Act
    const res = await commitSwaps([{ outId: 1, inId: 2 }], 'test-key-123');

    // Assert
    expect(apiFetchMock).toHaveBeenCalledWith('/transfers/commit', {
      method: 'POST',
      body: { swaps: [{ outId: 1, inId: 2 }] },
      headers: { 'Idempotency-Key': 'test-key-123' },
    });
    expect(res).toEqual({ success: true, data: commitResult, error: null });
  });

  it('commitSwaps propagates a rejection (e.g. INSUFFICIENT_FUNDS) instead of throwing', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'Insufficient funds for these transfers',
      code: 'INSUFFICIENT_FUNDS',
    });

    // Act
    const res = await commitSwaps([{ outId: 1, inId: 2 }], 'test-key-456');

    // Assert
    expect(res).toEqual({
      success: false,
      data: null,
      error: 'Insufficient funds for these transfers',
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('commitSwaps propagates an idempotency-key reuse rejection instead of throwing', async () => {
    // Arrange
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: false,
      data: null,
      error: 'This idempotency key was already used with a different request.',
      code: 'IDEMPOTENCY_KEY_REUSED',
    });

    // Act
    const res = await commitSwaps([{ outId: 1, inId: 3 }], 'reused-key');

    // Assert
    expect(res.success).toBe(false);
    expect(res.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
