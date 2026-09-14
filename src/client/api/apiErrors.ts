/**
 * Transport-level codes `apiFetch`/`mapEnvelope` can produce regardless of
 * domain (see `client.ts`'s `mapFetchError` and FEL_API's global throttle
 * filter). Domain resolvers (`authErrors.ts`, `transferErrors.ts`) check this
 * first so a dropped connection or a 429 doesn't fall through to their
 * generic `res.error` fallback and leak the raw, untranslated browser/HTTP
 * string (integration step 09 failure-path QA).
 */
const GENERIC_CODE_KEYS = {
  NETWORK_ERROR: 'errors.offline',
  RATE_LIMITED: 'errors.rateLimited',
} as const;

/** The keys this table can yield. */
export type GenericErrorKey = (typeof GENERIC_CODE_KEYS)[keyof typeof GENERIC_CODE_KEYS];

/** Everything `resolveGenericErrorMessage` can hand to `t()` — the table plus its fallback. */
export type GenericMessageKey = GenericErrorKey | 'errors.actionFailed';

export function mapGenericErrorCode(code: string | undefined): GenericErrorKey | null {
  if (!code) return null;
  return (GENERIC_CODE_KEYS as Record<string, GenericErrorKey | undefined>)[code] ?? null;
}

interface GenericErrorLike {
  error: string | null;
  code?: string;
}

/** Resolver for call sites with no domain-specific error table of their own. */
export function resolveGenericErrorMessage(res: GenericErrorLike, t: (key: GenericMessageKey) => string): string {
  const key = mapGenericErrorCode(res.code);
  if (key) return t(key);
  return res.error || t('errors.actionFailed');
}

/**
 * ## Why this file names its own keys
 *
 * These used to be typed `Key`, imported from the website's `i18n/locales/en.ts`. The package
 * cannot reach that file, and substituting `string` would silently drop the guarantee that every
 * key a resolver emits actually exists in both dictionaries.
 *
 * So the direction is inverted: the map IS the source of truth, the union is derived from it, and
 * the consumer proves the dictionaries satisfy it. That is strictly stronger than before, because
 * contravariance turns every call site into the check — a call passing `t: (k: Key) => string`
 * compiles only if this union is a SUBSET of `Key`. Name a key the dictionaries lack and the call
 * site stops compiling. `FEL_WEBSITE/app/types/core-i18n-contract.ts` covers the call sites that
 * pass vue-i18n's `t` (which takes a bare `string` and so cannot check itself).
 */
