import { mapEnvelope, type ApiEnvelope } from './adapters.js';
import { getApiClientConfig, type HttpErrorLike, type HttpMethod } from '../platform/config.js';
import { expireSession, getAccessToken, refreshSession } from './session.js';
import type { ApiResponse } from './types.js';

/**
 * `apiFetch` — the one HTTP path to FEL_API. Every service signature and the `ApiResponse<T>`
 * envelope match the backend contract exactly.
 *
 * The host injects the transport. It used to call the bare global `$fetch` — an ofetch instance
 * Nuxt auto-injects and nobody imports — and read `X-Lang` from a `document.cookie` regex defined
 * in this file. Neither exists on a phone, and neither showed up in a grep for framework imports,
 * which is why this file was mistaken for portable. Both now arrive through `configureApiClient`;
 * `getLang` stays a callback so a language switch needs no reconfiguration.
 *
 * `client.ts` and `session.ts` are mutually referential by design (`apiFetch`'s 401 handler needs
 * `session.refreshSession`; `refreshSession` reuses `apiFetch` itself rather than duplicating
 * base-URL/`X-Lang` assembly). This is a real 2-file import cycle, accepted deliberately — both
 * sides only touch each other inside function bodies, never at module top level, so every bundler
 * this ships through evaluates it safely.
 */

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function fail<T = never>(message: string): ApiResponse<T> {
  return { success: false, data: null, error: message };
}

export function unwrap<T>(res: ApiResponse<T>, fallback: T): T {
  return res.success && res.data != null ? res.data : fallback;
}

/** A true transport failure — no response body at all (offline, CORS block, DNS). */
export function mapFetchError<T>(err: unknown): ApiResponse<T> {
  const message = err instanceof Error ? err.message : 'Network error';
  return { success: false, data: null, error: message, code: 'NETWORK_ERROR' };
}

export type { HttpMethod };

export interface ApiFetchOptions {
  method?: HttpMethod;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Skip attaching the Bearer token and the 401→refresh→retry flow (login/signup/refresh itself). */
  skipAuth?: boolean;
  /** Internal — set on the single retry after a successful refresh, to prevent looping. */
  _retried?: boolean;
}

/**
 * Real HTTP path to FEL_API. Never throws across the seam — every branch
 * resolves to an `ApiResponse<T>`.
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<ApiResponse<T>> {
  const { apiBase, fetcher, getLang } = getApiClientConfig();
  const headers: Record<string, string> = { 'X-Lang': getLang(), ...opts.headers };
  const token = opts.skipAuth ? null : getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const raw = await fetcher<ApiEnvelope<T>>({
      path,
      baseURL: apiBase,
      method: opts.method ?? 'GET',
      body: opts.body,
      query: opts.query,
      headers,
    });
    return mapEnvelope(raw);
  } catch (err: unknown) {
    const fetchErr = err as HttpErrorLike;
    if (fetchErr?.status === 401 && !opts.skipAuth) {
      if (!opts._retried) {
        const refreshed = await refreshSession();
        if (refreshed) return apiFetch<T>(path, { ...opts, _retried: true });
      } else if (getAccessToken() === token) {
        // Refreshing didn't fix it — the retried request is still
        // unauthorized (revoked/banned/invalidated session server-side), so
        // this is a real auth failure, not a stale-token blip. Log out the
        // same way a failed refresh already does. Guarded on the token
        // that was actually used for this call still being current — mirrors
        // `doRefresh()`'s own stale-race guard, so a fresh login that lands
        // while another request's retry is still in flight doesn't get
        // wiped out by this one.
        expireSession();
      }
    }
    if (fetchErr?.data) return mapEnvelope(fetchErr.data as ApiEnvelope<T>);
    return mapFetchError<T>(err);
  }
}
