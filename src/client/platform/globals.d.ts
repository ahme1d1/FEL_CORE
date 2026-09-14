/**
 * The ONLY host globals `src/client` uses.
 *
 * Declared here rather than by adding `"DOM"` to `lib`, because `"DOM"` would also hand this half
 * `document`, `window`, `localStorage` and `fetch` — and the entire point of the three seams is that
 * none of those can be reached from package code. A DOM reference sneaking back in must be a
 * compile error, not something a reviewer has to catch.
 *
 * Enumerated by inspection of every moved file: `setTimeout`/`clearTimeout` (`rulesCache`'s timeout
 * race and `rulesBoot`'s deadline) and `URL` (`config.assetUrl`). `Intl`, `Date`, `JSON`, `Math` and
 * `encodeURIComponent` are all in `lib.es2022` already.
 *
 * `.d.ts` inputs are not emitted, and neither handle type appears in a public signature, so nothing
 * here reaches a consumer's types.
 */

type FelTimerHandle = unknown;

declare function setTimeout(handler: () => void, timeout?: number): FelTimerHandle;
declare function clearTimeout(handle?: FelTimerHandle): void;

declare class URL {
  constructor(url: string, base?: string);
  toString(): string;
}

/** Used by `squadSwap.test.ts` to deep-copy a fixture. Universal since Node 17 / all target browsers. */
declare function structuredClone<T>(value: T): T;
