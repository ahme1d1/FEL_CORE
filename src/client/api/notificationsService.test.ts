import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

vi.mock('../lib/storage.js', () => ({
  getJSON: vi.fn(),
  setJSON: vi.fn(),
  STORAGE_KEYS: { NOTIFICATIONS: 'fel_notifications' },
}));

import { clear, list, markAllRead, markRead, unreadCount } from './notificationsService.js';

const notification = {
  id: 'n-1',
  kind: 'price-up',
  title: 'Price rise',
  body: 'A player you own just rose in price.',
  ts: 1000,
  read: false,
};

describe('notificationsService', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('list requests a single generously-sized page and maps each kind through the adapter', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: [notification], meta: { current_page: 1, per_page: 100, total: 1 } },
      error: null,
    });

    const res = await list();

    expect(apiFetchMock).toHaveBeenCalledWith('/notifications', { query: { per_page: 100 } });
    expect(res.data).toEqual([notification]);
  });

  it('list surfaces an unrecognized kind as a failure instead of lying about the type', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { data: [{ ...notification, kind: 'PRICE_UP' }], meta: { current_page: 1, per_page: 100, total: 1 } },
      error: null,
    });

    const res = await list();

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown notification kind/);
  });

  it('unreadCount unwraps the {count} envelope', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { count: 3 }, error: null });

    const res = await unreadCount();

    expect(apiFetchMock).toHaveBeenCalledWith('/notifications/unread-count');
    expect(res.data).toBe(3);
  });

  it('markRead PATCHes /notifications/:id/read and returns the small status object', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { id: 'n-1', read: true }, error: null });

    const res = await markRead('n-1');

    expect(apiFetchMock).toHaveBeenCalledWith('/notifications/n-1/read', { method: 'PATCH' });
    expect(res.data).toEqual({ id: 'n-1', read: true });
  });

  it('markAllRead POSTs /notifications/read-all and returns {updated}, never an array', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { updated: 5 }, error: null });

    const res = await markAllRead();

    expect(apiFetchMock).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST' });
    expect(res.data).toEqual({ updated: 5 });
  });

  it('clear DELETEs /notifications and discards the {deleted} count', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: true, data: { deleted: 2 }, error: null });

    const res = await clear();

    expect(apiFetchMock).toHaveBeenCalledWith('/notifications', { method: 'DELETE' });
    expect(res).toEqual({ success: true, data: null, error: null });
  });

  it('clear propagates a failure instead of throwing', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'Network error', code: 'NETWORK_ERROR' });

    const res = await clear();

    expect(res).toEqual({ success: false, data: null, error: 'Network error', code: 'NETWORK_ERROR' });
  });
});
