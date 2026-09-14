import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { logout, signup } from './authService.js';
import { clearSession, hasSession, setSession } from './session.js';

describe('logout', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ success: true, data: null, error: null });
    clearSession();
  });

  it('revokes the currently stored refresh token when no override is passed', async () => {
    // Arrange
    setSession({ accessToken: 'a1', refreshToken: 'stored-r' });

    // Act
    await logout();

    // Assert
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith('/auth/logout', {
      method: 'POST',
      body: { refreshToken: 'stored-r' },
    });
  });

  it('does not call the API when there is no override and no stored token', async () => {
    // Arrange / Act
    await logout();

    // Assert
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('revokes the override token instead of the stored one when both are present', async () => {
    // Arrange — simulates the auto-expire path: the captured (now-stale)
    // token differs from whatever the store currently holds.
    setSession({ accessToken: 'a1', refreshToken: 'stored-r' });

    // Act
    await logout('captured-r');

    // Assert
    expect(apiFetchMock).toHaveBeenCalledExactlyOnceWith('/auth/logout', {
      method: 'POST',
      body: { refreshToken: 'captured-r' },
    });
  });

  it('honors an explicit null override and skips the network call, even when a real token is currently stored', async () => {
    // Arrange — regression test: `refreshTokenOverride ?? getRefreshToken()`
    // would previously treat an explicit `null` the same as "not passed" and
    // fall through to the (unrelated, currently-stored) token instead of
    // respecting the caller's explicit "there was nothing to revoke".
    setSession({ accessToken: 'a1', refreshToken: 'unrelated-stored-r' });

    // Act
    await logout(null);

    // Assert
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Whether a new account must verify its email is the server's call, reported as
 * `verificationRequired` on the signup response — there is no client-side flag. These three cases
 * are the whole contract.
 */
describe('signup', () => {
  const SIGNUP_INPUT = { name: 'Me', email: 'me@example.com', password: 'pw', teamName: 'T' };
  const BUNDLE = { accessToken: 'a1', refreshToken: 'r1', profile: { name: 'Me' } };

  beforeEach(() => {
    apiFetchMock.mockReset();
    clearSession();
  });

  it('commits the session immediately when the server says verification is not required', async () => {
    // Arrange
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...BUNDLE, emailVerified: false, verificationRequired: false },
      error: null,
    });

    // Act
    const res = await signup(SIGNUP_INPUT);

    // Assert
    expect(res.data?.verificationRequired).toBe(false);
    expect(hasSession.value).toBe(true);
  });

  it('leaves the session pending when verification is required', async () => {
    // Arrange
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...BUNDLE, emailVerified: false, verificationRequired: true },
      error: null,
    });

    // Act
    const res = await signup(SIGNUP_INPUT);

    // Assert
    expect(res.data?.verificationRequired).toBe(true);
    expect(hasSession.value).toBe(false);
  });

  it('treats a missing verificationRequired as required, so an older API keeps the strict flow', async () => {
    // Arrange — an API deployed before EMAIL_VERIFICATION_REQUIRED existed. This is what lets the
    // website ship ahead of the API without changing any behaviour.
    apiFetchMock.mockResolvedValue({
      success: true,
      data: { ...BUNDLE, emailVerified: false },
      error: null,
    });

    // Act
    const res = await signup(SIGNUP_INPUT);

    // Assert
    expect(res.data?.verificationRequired).toBe(true);
    expect(hasSession.value).toBe(false);
  });
});
