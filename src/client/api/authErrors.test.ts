import { describe, expect, it } from 'vitest';

import { mapAuthErrorCode, resolveAuthErrorMessage } from './authErrors.js';

const identity = (key: string): string => key;

describe('mapAuthErrorCode', () => {
  const cases: [string, string][] = [
    ['INVALID_CREDENTIALS', 'auth.error.invalidCredentials'],
    ['ACCOUNT_DISABLED', 'auth.error.accountDisabled'],
    ['EMAIL_ALREADY_EXISTS', 'auth.error.emailTaken'],
    ['PASSWORD_WEAK', 'auth.error.passwordWeak'],
    ['OTP_INVALID', 'auth.error.badCode'],
    ['OTP_EXPIRED', 'auth.error.otpExpired'],
    ['OTP_TOO_MANY_ATTEMPTS', 'auth.error.tooManyAttempts'],
  ];

  it.each(cases)('maps %s to %s', (code, expected) => {
    // Arrange / Act
    const key = mapAuthErrorCode(code);

    // Assert
    expect(key).toBe(expected);
  });

  it('returns null for an unmapped-but-known code', () => {
    // Arrange / Act
    const key = mapAuthErrorCode('TOKEN_REUSE_DETECTED');

    // Assert
    expect(key).toBeNull();
  });

  it('returns null when no code is given', () => {
    // Arrange / Act / Assert
    expect(mapAuthErrorCode(undefined)).toBeNull();
  });
});

describe('resolveAuthErrorMessage', () => {
  it('resolves a mapped code to its localized key', () => {
    // Arrange
    const res = { error: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' };

    // Act
    const message = resolveAuthErrorMessage(res, identity);

    // Assert
    expect(message).toBe('auth.error.invalidCredentials');
  });

  it('falls back to the server message for an unmapped-but-known code', () => {
    // Arrange
    const res = { error: 'رمز الجلسة غير صالح.', code: 'TOKEN_REUSE_DETECTED' };

    // Act
    const message = resolveAuthErrorMessage(res, identity);

    // Assert
    expect(message).toBe('رمز الجلسة غير صالح.');
  });

  it('falls back to the generic key when there is no code or message', () => {
    // Arrange
    const res = { error: null };

    // Act
    const message = resolveAuthErrorMessage(res, identity);

    // Assert
    expect(message).toBe('auth.error.generic');
  });
});
