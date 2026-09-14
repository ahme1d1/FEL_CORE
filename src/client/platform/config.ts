import type { StorageAdapter } from './storage.js';

/**
 * The platform seam — a near-leaf module (one type-only import), so `client.ts` and `session.ts` can
 * both depend on it without risk of a cycle. Ported from `FEL_WEBSITE/app/services/api/config.ts`,
 * which was already the right shape: the host seeds it once at boot, because a plain module is not a
 * Nuxt context and cannot read runtime config itself.
 *
 * What is new is that **the HTTP call, the storage and the language are injected too**. On the
 * website `apiFetch` called the bare global `$fetch` — an ofetch instance Nuxt auto-injects, never
 * imported, which is exactly why a grep for framework imports reported that file as portable when it
 * was not. `X-Lang` was read straight from `document.cookie`, and persistence went through
 * `window.localStorage`. None of the three exists on a phone. All are now supplied by the host,
 * which is what keeps this package's runtime dependency count at zero.
 *
 * Everything here is needed at CALL time, never at module-evaluation time, so `configureApiClient()`
 * from a boot plugin is early enough. Reactivity is the one exception — it is needed at first *read*
 * — and that is why it has its own module-scope installer rather than living in this object.
 */

export type Lang = 'ar' | 'en';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  path: string;
  baseURL: string;
  method: HttpMethod;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * **ofetch-shaped, on purpose**: resolves the PARSED body on 2xx, and on a non-2xx **rejects** with
 * an object carrying `status` and the parsed `data`.
 *
 * That error shape is not incidental. `apiFetch`'s 401→refresh→retry reads `err.status`, and its
 * "the server sent a real envelope with the failure" branch reads `err.data`. A host that wires a
 * bare `fetch()` here — which resolves on 4xx and carries neither field — would turn every API error
 * into a generic network failure and silently disable the refresh flow, logging managers out for no
 * reason. Pass `ofetch`, or write the same twenty lines over `globalThis.fetch`.
 */
export type Fetcher = <T>(req: HttpRequest) => Promise<T>;

/** The subset of an ofetch error `apiFetch` actually reads. */
export interface HttpErrorLike {
  status?: number;
  data?: unknown;
}

export interface ApiClientConfig {
  apiBase: string;
  fetcher: Fetcher;
  storage: StorageAdapter;
  /**
   * The `X-Lang` header value, read FRESH per request. Deliberately a callback rather than a seeded
   * value: the language is a device preference that changes without a reload, and on the web
   * `useI18n()`/`useLang()` cannot be called at a Nuxt plugin's top level — which is why `client.ts`
   * read the cookie inline in the first place.
   */
  getLang(): Lang;
  /**
   * OPTIONAL. Fires when ANOTHER window changed a persisted key, so a login or logout in one tab is
   * adopted by the others. Web wires a filtered `storage` event; native passes nothing, because one
   * process has no tabs. Returns an unsubscribe.
   */
  onExternalStorageChange?: (cb: (key: string, value: string | null) => void) => () => void;
}

/**
 * Rejecting rather than throwing keeps `apiFetch`'s never-throws-across-the-seam contract, and
 * preserves today's behaviour exactly: under plain vitest the global `$fetch` is undefined, the
 * resulting `ReferenceError` is caught by the same `catch`, and every service resolves to
 * `{ success: false, code: 'NETWORK_ERROR' }`. Same outcome, with a message that names the cause.
 */
const NO_FETCHER: Fetcher = () =>
  Promise.reject(
    new Error('@fel/core/client: no fetcher configured — call configureApiClient({ fetcher })'),
  );

/**
 * A no-op store rather than a throwing one: persistence is best-effort by contract, and the original
 * degraded to null/no-op when `window` was absent so an accidental server call could not crash a
 * render. Reactivity is loud because a missing adapter breaks a screen; storage is quiet because a
 * missing one costs a draft.
 */
const NO_STORAGE: StorageAdapter = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const DEFAULTS: ApiClientConfig = {
  apiBase: '',
  fetcher: NO_FETCHER,
  storage: NO_STORAGE,
  getLang: () => 'ar',
};

let config: ApiClientConfig = { ...DEFAULTS };

export function configureApiClient(next: Partial<ApiClientConfig>): void {
  config = { ...config, ...next };
}

export function getApiClientConfig(): ApiClientConfig {
  return config;
}

/** Test seam. */
export function __resetApiClientConfigForTests(): void {
  config = { ...DEFAULTS };
}

/**
 * Resolve an API-served asset path (root-relative, e.g. "/api/v1/assets/crests/AHL.png" from a
 * club's `crestUrl`) against the API origin. Root-relative URLs ignore `apiBase`'s own path, so this
 * works whether or not the base carries the `/api/v1` prefix.
 */
export function assetUrl(path: string): string {
  const { apiBase } = config;
  if (!apiBase) return path;
  try {
    return new URL(path, apiBase).toString();
  } catch {
    return path;
  }
}
