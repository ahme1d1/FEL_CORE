/**
 * The persistence seam.
 *
 * `FEL_WEBSITE/app/lib/storage.ts` was already a web port of `FEL_APP`'s AsyncStorage util, with
 * `async` signatures kept **precisely so the ported services would not have to change** when the
 * backing store did. That foresight is what makes this seam nearly free: only the
 * `window.localStorage` access moves out to the host.
 *
 * Sync on web, async on native — the package always awaits, so both fit. The swallow-errors
 * contract lives in `lib/storage.ts` so every host inherits it; the host-specific guards
 * (`typeof window`, the sandboxed-iframe throw) live in the host's adapter.
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
