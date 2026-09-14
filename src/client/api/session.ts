import { getApiClientConfig } from '../platform/config.js';
import { cell, derive } from '../platform/reactivity.js';
import { getItem, removeItem, setItem, STORAGE_KEYS } from '../lib/storage.js';

import { apiFetch } from './client.js';
import { singleFlight, type SingleFlightCache } from './singleFlight.js';

/**
 * Live-API token session: access + refresh JWT storage, plus single-flight refresh-on-401
 * rotation. `stores/auth.ts` derives `authDone`/`hydrated` from `hasSession`/`hydrated` here —
 * these must stay genuinely tracked values (not plain module variables), since the website's
 * `auth.global.ts` gates on `until(() => auth.hydrated...)` and the marketing nav components
 * render off them. `cell`/`derive` are what carry that across hosts; on Vue they are backed by a
 * real `shallowRef`/`computed`.
 */
const accessToken = cell<string | null>(null, 'session.accessToken');
const refreshToken = cell<string | null>(null, 'session.refreshToken');

export const hasSession = derive(() => accessToken.value !== null, 'session.hasSession');
export const hydrated = cell(false, 'session.hydrated');

/**
 * The caller's own `managerId` (from `authService.me()`) — lets league/squad
 * UI identify "me" among real server member IDs. A tracked cell, not a getter
 * function, so `leaguesService.myMemberId`'s `derive()` can track it.
 * Populated by `stores/auth.ts`'s identity watcher once a session exists;
 * unset (and re-populated on the next login) across `clearSession()`.
 */
export const managerId = cell<string | null>(null, 'session.managerId');

export function setManagerId(id: string | null): void {
  managerId.value = id;
}

/**
 * Sibling of `onSessionExpired` for a logout that happened in *another tab*.
 * Deliberately not routed through `expireSession()`: the other tab already
 * revoked the token server-side, so re-POSTing `/auth/logout` is a wasted
 * (and failing) call, and "Session expired" is the wrong thing to tell someone
 * who just deliberately logged out.
 */
let onRemoteLogout: (() => void) | null = null;

export function onRemoteLogoutDetected(cb: () => void): void {
  onRemoteLogout = cb;
}

/**
 * Adopt tokens another tab wrote. FEL_API rotates the refresh token on every
 * use and revokes the one just spent, but each tab keeps its own in-memory
 * copy that only `setSession()` here ever updates — so a second tab kept
 * whatever token it read at page load. Once the first tab refreshed, the
 * second tab's copy was already revoked server-side, and its next refresh
 * spent a dead token: `doRefresh()` → `expireSession()` → the user is bounced
 * to `/login` from a perfectly good session (and, because the rejected
 * rotation kills the family, the first tab loses its session too on its next
 * refresh). `storage` only fires in *other* tabs, which is exactly the gap.
 *
 * A null `newValue` (the other tab logged out, or storage was cleared) is
 * adopted as well — a logout should propagate, not leave this tab holding a
 * session the user just ended.
 */
export function adoptStoredToken(key: string, value: string | null): void {
  if (key === STORAGE_KEYS.ACCESS_TOKEN) accessToken.value = value;
  else if (key === STORAGE_KEYS.REFRESH_TOKEN) refreshToken.value = value;
  else return;
  // Both tokens gone => the other tab logged out. Nulling the refs alone leaves
  // this tab half torn down: `managerId` still set, `/bootstrap` cache still
  // warm, and the user parked on a now-dead `/app` page (the same "left staring
  // at a stale page" problem `onSessionExpired` exists to solve).
  if (accessToken.value === null && refreshToken.value === null) {
    managerId.value = null;
    onRemoteLogout?.();
  }
}

/**
 * Cross-tab adoption, registered once.
 *
 * This was a `window.addEventListener('storage', …)` at module scope, guarded by
 * `import.meta.client && typeof window !== 'undefined'` — a Vite build macro and a browser global,
 * neither of which a phone has, and the macro is why the website's vitest config has to `define` it.
 * The host now supplies the subscription (or omits it: one process has no tabs), and the filtering
 * that used to live in the handler lives in the host's adapter with the API that needs it.
 *
 * Registered from `hydrateSession()` rather than at module scope because the host configures the
 * client after the module graph is evaluated — and because a prerender pass evaluates this module
 * with nothing configured at all. Guarded so a second `hydrateSession()` cannot double-subscribe.
 */
let crossTabAdoptionStarted = false;

function startCrossTabAdoption(): void {
  if (crossTabAdoptionStarted) return;
  crossTabAdoptionStarted = true;
  getApiClientConfig().onExternalStorageChange?.(adoptStoredToken);
}

/** Test seam — lets a suite re-arm the once-guard. */
export function __resetCrossTabAdoptionForTests(): void {
  crossTabAdoptionStarted = false;
}

export function getAccessToken(): string | null {
  return accessToken.value;
}

export function getRefreshToken(): string | null {
  return refreshToken.value;
}

export function setSession(tokens: { accessToken: string; refreshToken: string }): void {
  accessToken.value = tokens.accessToken;
  refreshToken.value = tokens.refreshToken;
  // Plain strings, not JSON — setItem/getItem (not setJSON/getJSON), so the
  // read path doesn't have to JSON.parse a value the write path never stringified.
  void setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  void setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
}

export function clearSession(): void {
  accessToken.value = null;
  refreshToken.value = null;
  managerId.value = null;
  void removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  void removeItem(STORAGE_KEYS.REFRESH_TOKEN);
}

export async function hydrateSession(): Promise<void> {
  startCrossTabAdoption();
  const [access, refresh] = await Promise.all([
    getItem(STORAGE_KEYS.ACCESS_TOKEN),
    getItem(STORAGE_KEYS.REFRESH_TOKEN),
  ]);
  accessToken.value = access;
  refreshToken.value = refresh;
  hydrated.value = true;
}

// Lets `stores/auth.ts` react to a hard logout (failed refresh) without
// `session.ts` importing the store — importing it here would risk a cycle
// through `authService.ts` → `client.ts` → `session.ts`.
let onExpire: ((refreshTokenAtExpiry: string | null) => void) | null = null;

export function onSessionExpired(cb: (refreshTokenAtExpiry: string | null) => void): void {
  onExpire = cb;
}

/**
 * The one real auth-failure exit: wipe the local session and notify
 * `stores/auth.ts` so it runs the full logout (`authService.logout()`,
 * bootstrap-cache reset). Shared by every place that discovers the current
 * session is dead — a missing/failed refresh token here, and `apiFetch`'s
 * still-401-after-retry case.
 *
 * Captures the refresh token *before* `clearSession()` wipes it and hands it
 * to the callback — `authService.logout()`'s own `getRefreshToken()` read
 * would otherwise come back `null` here (unlike the explicit-logout path,
 * this callback always runs after the token is already gone from storage),
 * silently skipping the server-side revoke.
 *
 * Idempotent: a page can have several stores each independently discovering
 * the same dead session (e.g. a batch of authenticated fetches on load, each
 * hitting a 401 in its own `apiFetch` call). `refreshCache`'s single-flight
 * only dedupes calls that overlap in time — a caller whose 401 lands just
 * after the first `doRefresh()` already settled starts a fresh one, which
 * would otherwise re-fire `onExpire()` (duplicate toast/redirect) for a
 * session that's already gone.
 */
export function expireSession(): void {
  if (accessToken.value === null && refreshToken.value === null) return;
  const refreshTokenAtExpiry = refreshToken.value;
  clearSession();
  onExpire?.(refreshTokenAtExpiry);
}

const refreshCache: SingleFlightCache<boolean> = { current: null };

/**
 * Single-flight refresh rotation. FEL_API rotates the refresh token on
 * every use and revokes the whole session family if a stale token is reused
 * — firing concurrent refresh calls would log the user out, so every
 * caller (apiFetch's 401 handler) must await this same shared promise.
 */
export function refreshSession(): Promise<boolean> {
  return singleFlight(refreshCache, doRefresh);
}

async function doRefresh(): Promise<boolean> {
  // Defense-in-depth: if this somehow runs before hydrateSession() resolves
  // (the plugin awaits it, so this shouldn't happen on the normal boot path),
  // don't treat "not loaded yet" as "no session" — bail without wiping a
  // token we haven't actually read from storage.
  if (!hydrated.value) return false;
  // Defense in depth for the cross-tab rotation the `storage` listener above
  // handles: re-read at spend time rather than trusting this tab's cached
  // copy, which also covers the window before that event has been delivered.
  const stored = await getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (stored !== null && stored !== refreshToken.value) refreshToken.value = stored;
  if (!refreshToken.value) {
    expireSession();
    return false;
  }
  const tokenAtStart = refreshToken.value;
  const res = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: tokenAtStart },
    skipAuth: true,
  });
  // The session may have been cleared (logout) or replaced (a fresh login)
  // while this request was in flight — discard the result silently instead
  // of resurrecting/clobbering a session that's no longer the current one.
  if (refreshToken.value !== tokenAtStart) return false;
  if (res.success && res.data) {
    setSession(res.data);
    return true;
  }
  expireSession();
  return false;
}
