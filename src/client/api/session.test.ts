import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '../lib/storage.js';

/**
 * Regression guard for the cross-tab logout: FEL_API rotates the refresh token
 * on every use and revokes the one just spent, so a tab that keeps serving its
 * page-load copy will eventually spend a token another tab already burned —
 * the server rejects it, `expireSession()` fires, and the user is bounced to
 * `/login` from a session that was never actually dead.
 */

const storage = new Map<string, string>();

vi.mock('../lib/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/storage.js')>();
  return {
    ...actual,
    getItem: vi.fn(async (k: string) => storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void storage.delete(k)),
  };
});

const apiFetch = vi.fn();
vi.mock('./client.js', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

describe('session — cross-tab refresh-token rotation', () => {
  beforeEach(() => {
    storage.clear();
    apiFetch.mockReset();
    vi.resetModules();
  });

  it('adopts a refresh token rotated by another tab instead of its stale copy', async () => {
    const session = await import('./session.js');

    // This tab loaded with the original pair.
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v1');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v1');
    await session.hydrateSession();
    expect(session.getRefreshToken()).toBe('refresh-v1');

    // Another tab refreshed first: it wrote the rotated pair to localStorage,
    // and the server has now revoked `refresh-v1`.
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v2');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v2');
    session.adoptStoredToken(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v2');
    session.adoptStoredToken(STORAGE_KEYS.ACCESS_TOKEN, 'access-v2');

    apiFetch.mockResolvedValue({
      success: true,
      data: { accessToken: 'access-v3', refreshToken: 'refresh-v3' },
      error: null,
    });

    const expired = vi.fn();
    session.onSessionExpired(expired);

    await expect(session.refreshSession()).resolves.toBe(true);

    // The live token, never the revoked page-load copy.
    const body = apiFetch.mock.calls[0]?.[1]?.body as { refreshToken: string };
    expect(body.refreshToken).toBe('refresh-v2');
    expect(body.refreshToken).not.toBe('refresh-v1');
    expect(expired).not.toHaveBeenCalled();
  });

  it('re-reads storage at spend time even if the storage event never arrived', async () => {
    const session = await import('./session.js');

    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v1');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v1');
    await session.hydrateSession();

    // Another tab rotated, but this tab got no `storage` event (delivery gap).
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v2');

    apiFetch.mockResolvedValue({
      success: true,
      data: { accessToken: 'access-v3', refreshToken: 'refresh-v3' },
      error: null,
    });
    const expired = vi.fn();
    session.onSessionExpired(expired);

    await expect(session.refreshSession()).resolves.toBe(true);

    const body = apiFetch.mock.calls[0]?.[1]?.body as { refreshToken: string };
    expect(body.refreshToken).toBe('refresh-v2');
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('session — cross-tab logout propagation', () => {
  beforeEach(() => {
    storage.clear();
    apiFetch.mockReset();
    vi.resetModules();
  });

  it('tears the session down locally when another tab clears both tokens', async () => {
    // Arrange — a live session in this tab.
    const session = await import('./session.js');
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v1');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v1');
    await session.hydrateSession();
    session.setManagerId('mgr-1');

    const remoteLogout = vi.fn();
    const expired = vi.fn();
    session.onRemoteLogoutDetected(remoteLogout);
    session.onSessionExpired(expired);

    // Act — the other tab logged out, wiping both keys.
    session.adoptStoredToken(STORAGE_KEYS.ACCESS_TOKEN, null);
    session.adoptStoredToken(STORAGE_KEYS.REFRESH_TOKEN, null);

    // Assert
    expect(session.hasSession.value).toBe(false);
    expect(session.managerId.value).toBeNull();
    expect(remoteLogout).toHaveBeenCalledTimes(1);
    // Not the expiry path: that would re-revoke an already-dead token and toast
    // "Session expired" at a user who logged out on purpose.
    expect(expired).not.toHaveBeenCalled();
  });

  it('does not fire while the other token is still present', async () => {
    // Arrange
    const session = await import('./session.js');
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v1');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v1');
    await session.hydrateSession();

    const remoteLogout = vi.fn();
    session.onRemoteLogoutDetected(remoteLogout);

    // Act — only the access token was evicted; the session is still refreshable.
    session.adoptStoredToken(STORAGE_KEYS.ACCESS_TOKEN, null);

    // Assert
    expect(session.getRefreshToken()).toBe('refresh-v1');
    expect(remoteLogout).not.toHaveBeenCalled();
  });

  it('ignores storage keys that are not session tokens', async () => {
    // Arrange
    const session = await import('./session.js');
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, 'access-v1');
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-v1');
    await session.hydrateSession();

    const remoteLogout = vi.fn();
    session.onRemoteLogoutDetected(remoteLogout);

    // Act — an unrelated key (theme, tweaks, …) changed in the other tab.
    session.adoptStoredToken(STORAGE_KEYS.LANGUAGE, null);

    // Assert
    expect(session.hasSession.value).toBe(true);
    expect(session.getRefreshToken()).toBe('refresh-v1');
    expect(remoteLogout).not.toHaveBeenCalled();
  });
});

/**
 * The cross-tab subscription itself, which used to be a `window.addEventListener('storage', …)` at
 * module scope and was covered by nothing — there was no seam to reach it through.
 *
 * Worth guarding now for two reasons. It moved: the host supplies the subscription, so "did anyone
 * actually subscribe" is a real question this package can answer. And it is registered from
 * `hydrateSession()` rather than at import, because the host configures the client after the module
 * graph is evaluated — a prerender pass evaluates this module with nothing configured at all.
 */
describe('cross-tab adoption wiring', () => {
  beforeEach(() => {
    storage.clear();
    apiFetch.mockReset();
    vi.resetModules();
  });

  it('subscribes through the host, and the callback adopts a token', async () => {
    const { configureApiClient } = await import('../platform/config.js');
    const session = await import('./session.js');

    let notify: ((key: string, value: string | null) => void) | null = null;
    const unsubscribe = vi.fn();
    configureApiClient({
      onExternalStorageChange: (cb) => {
        notify = cb;
        return unsubscribe;
      },
    });

    await session.hydrateSession();
    expect(notify, 'hydrateSession did not register a cross-tab listener').not.toBeNull();

    notify!(STORAGE_KEYS.ACCESS_TOKEN, 'access-from-another-tab');
    expect(session.getAccessToken()).toBe('access-from-another-tab');
  });

  it('subscribes ONCE, so a second hydrate cannot double-adopt every change', async () => {
    const { configureApiClient } = await import('../platform/config.js');
    const session = await import('./session.js');

    const subscribe = vi.fn(() => () => {});
    configureApiClient({ onExternalStorageChange: subscribe });

    await session.hydrateSession();
    await session.hydrateSession();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('works when the host offers no subscription at all — a phone has no tabs', async () => {
    const session = await import('./session.js');
    await expect(session.hydrateSession()).resolves.toBeUndefined();
  });
});
