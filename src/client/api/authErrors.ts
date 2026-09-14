import { mapGenericErrorCode, type GenericErrorKey } from './apiErrors.js';

/**
 * FEL_API auth error codes mapped to dedicated, localized i18n keys. Codes
 * NOT in this table (`REFRESH_INVALID`, `TOKEN_REUSE_DETECTED`,
 * `PROVIDER_TOKEN_INVALID`, `GUEST_RESTRICTED`, `LAST_CREDENTIAL`,
 * `IDENTITY_TAKEN`, `EMAIL_NOT_VERIFIED`, `TEAM_NAME_INVALID`) fall back to
 * the server's own bilingual `message` — confirmed either unreachable from
 * this app's auth forms (only reachable via `/auth/link`, not wired) or never
 * thrown by current backend code, so a fallback is correct, not a gap.
 * `EMAIL_NOT_VERIFIED` is the exception worth naming: the API throws it only
 * while its `EMAIL_VERIFICATION_REQUIRED` flag is on (currently off), and
 * `AuthFlow.submitLogin` intercepts that code before this table is consulted,
 * rendering `auth.error.emailNotVerified` itself.
 */
const ERROR_CODE_KEYS = {
  INVALID_CREDENTIALS: 'auth.error.invalidCredentials',
  ACCOUNT_DISABLED: 'auth.error.accountDisabled',
  EMAIL_ALREADY_EXISTS: 'auth.error.emailTaken',
  PASSWORD_WEAK: 'auth.error.passwordWeak',
  OTP_INVALID: 'auth.error.badCode',
  OTP_EXPIRED: 'auth.error.otpExpired',
  OTP_TOO_MANY_ATTEMPTS: 'auth.error.tooManyAttempts',
} as const;

export type AuthErrorCodeKey = (typeof ERROR_CODE_KEYS)[keyof typeof ERROR_CODE_KEYS];

/** Everything `resolveAuthErrorMessage` can hand to `t()`. */
export type AuthMessageKey = AuthErrorCodeKey | GenericErrorKey | 'auth.error.generic';

export function mapAuthErrorCode(code: string | undefined): AuthErrorCodeKey | null {
  if (!code) return null;
  return (ERROR_CODE_KEYS as Record<string, AuthErrorCodeKey | undefined>)[code] ?? null;
}

interface AuthErrorLike {
  error: string | null;
  code?: string;
}

/**
 * Resolves the best user-facing message for a failed `ApiResponse`: a
 * dedicated localized string when the code is mapped, else the server's own
 * already-bilingual `message`, else the generic fallback for pure network
 * failures (no code, no message).
 */
export function resolveAuthErrorMessage(res: AuthErrorLike, t: (key: AuthMessageKey) => string): string {
  const key = mapAuthErrorCode(res.code) ?? mapGenericErrorCode(res.code);
  if (key) return t(key);
  return res.error || t('auth.error.generic');
}
