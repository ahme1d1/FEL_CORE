import { asFailure } from './adapters.js';
import { apiFetch, ok } from './client.js';
import { getRefreshToken, setSession } from './session.js';
import type { ApiResponse } from './types.js';

/**
 * Auth service. Mirrors the FEL_API `/auth/*` contract (`../FEL_API` /
 * `FEL_APP/docs/API_CONTRACT.md` §1): every method keeps its signature + the
 * `ApiResponse<T>` envelope, and `AuthContext`/the web auth store consume it
 * unchanged.
 */

export type OtpPurpose = 'verify' | 'reset';

export interface AuthProfile {
  name: string;
  email: string;
}

/** `{ token, refreshToken, profile }` per the contract. */
export interface AuthSession {
  token: string;
  refreshToken: string;
  profile: AuthProfile;
}

/**
 * `signup` adds the server's answer to "does this account have to verify its
 * email first?" — see `signup` for why the server owns that decision.
 */
export interface SignupResult extends AuthSession {
  verificationRequired: boolean;
}

/** OTP verify returns just a (reset/session) token. */
export interface AuthToken {
  token: string;
}

/** `GET /auth/me` — the caller's identity (mirrors FEL_API's `ClientIdentity`). */
export interface AuthIdentity {
  userId: string;
  managerId: string | null;
  displayName: string | null;
  teamName: string | null;
  email: string | null;
  roles: string[];
  isGuest: boolean;
}

export type SocialProvider = 'google' | 'apple' | 'facebook';

export interface SocialLoginInput {
  provider: SocialProvider;
  /** ID token (google/apple) or access token (facebook) from the provider's JS SDK. */
  credential: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
export interface SignupInput {
  name: string;
  email: string;
  password: string;
  teamName: string;
}
export interface OtpRequestInput {
  email: string;
  purpose: OtpPurpose;
}
export interface OtpVerifyInput {
  email: string;
  code: string;
  purpose: OtpPurpose;
}
export interface PasswordResetInput {
  email: string;
  code: string;
  newPassword: string;
}

/** FEL_API `SignupDto`/`OnboardingDto` team-name bounds (`@Length(2, 30)`). */
export const TEAM_NAME_LEN = { min: 2, max: 30 } as const;

/** Live shape shared by login/signup/social — `apiFetch`'s envelope already unwraps the rest. */
interface LiveAuthBundle {
  accessToken: string;
  refreshToken: string;
  profile: { name: string };
}

/** `/auth/signup`'s envelope. `verificationRequired` is optional: an API older than the flag omits it. */
type LiveSignupBundle = LiveAuthBundle & { emailVerified: boolean; verificationRequired?: boolean };

function toAuthSession(bundle: LiveAuthBundle, email: string): AuthSession {
  setSession({ accessToken: bundle.accessToken, refreshToken: bundle.refreshToken });
  return { token: bundle.accessToken, refreshToken: bundle.refreshToken, profile: { name: bundle.profile.name, email } };
}

/** Same shape as `toAuthSession`, but doesn't commit to `session.ts` — for signup, where the session must stay pending until OTP verify succeeds (see `signup`'s doc comment). */
function toPendingAuthSession(bundle: LiveAuthBundle, email: string): AuthSession {
  return { token: bundle.accessToken, refreshToken: bundle.refreshToken, profile: { name: bundle.profile.name, email } };
}

/** `POST /auth/login` */
export async function login(input: LoginInput): Promise<ApiResponse<AuthSession>> {
  const res = await apiFetch<LiveAuthBundle>('/auth/login', { method: 'POST', body: { ...input }, skipAuth: true });
  if (!res.success || !res.data) return asFailure<AuthSession>(res);
  return ok(toAuthSession(res.data, input.email));
}

/**
 * `POST /auth/signup` — accepts `teamName` (required by the server DTO) but
 * does not write it to the manager profile: onboarding owns that write, and
 * echoing a fallback placeholder here would clobber a saved name.
 *
 * Whether the new account has to verify its email before it can play is the
 * **server's** call, not ours: the API reads its `EMAIL_VERIFICATION_REQUIRED`
 * runtime flag and reports the answer as `verificationRequired`. There is no
 * matching client-side flag on purpose — two switches that must agree is a way
 * to lock managers out (server enforcing while the client never shows the
 * verify screen), and this way the owner can flip the policy from the admin
 * config API with no web rebuild.
 *
 * - `verificationRequired: true` → the session stays **pending**: committing it
 *   now would make `auth.authDone` true before the OTP is confirmed, so a
 *   reload or a direct `/app` visit would bypass verification entirely. The
 *   tokens are committed only once `stores/auth.ts`'s `verifyOtp` succeeds for
 *   `purpose:'verify'` — see that store for the pending-session handoff.
 * - `verificationRequired: false` → commit immediately, exactly like
 *   `login`/`socialLogin`.
 *
 * A **missing** field means an API deployed before the flag existed, so it is
 * read as `true` — the stricter, pre-existing behaviour. That is what lets this
 * change ship to the web before the API without altering anything.
 */
export async function signup(input: SignupInput): Promise<ApiResponse<SignupResult>> {
  const res = await apiFetch<LiveSignupBundle>('/auth/signup', {
    method: 'POST',
    body: { ...input },
    skipAuth: true,
  });
  if (!res.success || !res.data) return asFailure<SignupResult>(res);
  const verificationRequired = res.data.verificationRequired !== false;
  const session = verificationRequired
    ? toPendingAuthSession(res.data, input.email)
    : toAuthSession(res.data, input.email);
  return ok({ ...session, verificationRequired });
}

/** `POST /auth/otp/request` — send the verify/reset code. */
export async function otpRequest(input: OtpRequestInput): Promise<ApiResponse<null>> {
  const res = await apiFetch<{ ok: boolean }>('/auth/otp/request', {
    method: 'POST',
    body: { channel: 'email', identifier: input.email, purpose: input.purpose },
    skipAuth: true,
  });
  if (!res.success) return asFailure<null>(res);
  return ok(null);
}

/**
 * `POST /auth/otp/verify` — `verify`/`reset` purposes return `{ok:true}` (no
 * token — that only happens for the `login` purpose, unused by this app), so
 * this returns a harmless placeholder token; nothing downstream reads it.
 */
export async function otpVerify(input: OtpVerifyInput): Promise<ApiResponse<AuthToken>> {
  const res = await apiFetch<{ ok: boolean }>('/auth/otp/verify', {
    method: 'POST',
    body: { channel: 'email', identifier: input.email, code: input.code, purpose: input.purpose },
    skipAuth: true,
  });
  if (!res.success) return asFailure<AuthToken>(res);
  return ok({ token: '' });
}

/** `POST /auth/password/reset` */
export async function passwordReset(input: PasswordResetInput): Promise<ApiResponse<null>> {
  const res = await apiFetch<{ ok: boolean }>('/auth/password/reset', {
    method: 'POST',
    body: { ...input },
    skipAuth: true,
  });
  if (!res.success) return asFailure<null>(res);
  return ok(null);
}

/**
 * `POST /auth/logout` — revokes the refresh token. Always resolves `ok(null)`
 * regardless of the server's outcome: the caller (`stores/auth.ts`'s
 * `reset()`) treats this as fire-and-forget — the user's intent to leave
 * shouldn't block on network flakiness or an already-expired token.
 *
 * `refreshTokenOverride` lets the auto-expire path (`session.ts`'s
 * `expireSession()`, via `stores/auth.ts`'s `handleSessionExpired()`) pass in
 * the token it captured *before* `clearSession()` ran — by the time that path
 * reaches here, `getRefreshToken()` already reads back `null`.
 */
export async function logout(refreshTokenOverride?: string | null): Promise<ApiResponse<null>> {
  const refreshToken = refreshTokenOverride === undefined ? getRefreshToken() : refreshTokenOverride;
  if (refreshToken) {
    await apiFetch<unknown>('/auth/logout', { method: 'POST', body: { refreshToken } });
  }
  return ok(null);
}

/**
 * `GET /auth/me` — the caller's identity.
 *
 * Called by `stores/auth.ts`'s `fetchIdentity()` on boot and on every login, with a bounded
 * retry. It reads exactly ONE field — `managerId` — which `leaguesService.myMemberId` uses for
 * the "is this row me" check on every board; `email`, `roles`, `isGuest`, `displayName` and
 * `teamName` are all discarded. (This docstring previously claimed only a dev harness called it,
 * which was already untrue.)
 *
 * Kept as its own route rather than folded into `/manager/profile`: it is keyed on the USER, not
 * the manager, so it is the only identity read that works for an account with no `ManagerProfile`
 * — and the only one the API marks `@AllowUnverified()`, which a client mid-OTP-verification
 * needs.
 */
export async function me(): Promise<ApiResponse<AuthIdentity>> {
  return apiFetch<AuthIdentity>('/auth/me');
}

/** `DELETE /auth/me` — anonymize-in-place account deletion. */
export async function deleteAccount(): Promise<ApiResponse<null>> {
  const res = await apiFetch<unknown>('/auth/me', { method: 'DELETE' });
  if (!res.success) return asFailure<null>(res);
  return ok(null);
}

/**
 * `POST /auth/social/{google,apple,facebook}` — google/apple take `{idToken}`,
 * facebook takes `{accessToken}`. `credential` is whichever the provider's JS
 * SDK produced (see `useSocialAuth`).
 */
export async function socialLogin(input: SocialLoginInput): Promise<ApiResponse<AuthSession>> {
  const body = input.provider === 'facebook' ? { accessToken: input.credential } : { idToken: input.credential };
  const res = await apiFetch<LiveAuthBundle>(`/auth/social/${input.provider}`, {
    method: 'POST',
    body,
    skipAuth: true,
  });
  if (!res.success || !res.data) return asFailure<AuthSession>(res);
  // No email in this response shape — nothing reads AuthSession.profile.email for the social path.
  return ok(toAuthSession(res.data, ''));
}
