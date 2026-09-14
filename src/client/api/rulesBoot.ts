import { getBootstrap } from './bootstrapService.js';
import { hydrateRules, hydrated as rulesHydrated, RULES_TIMEOUT_MS } from './rulesCache.js';
import { hasSession } from './session.js';

/**
 * Get the game's rules in hand without spending a request on them.
 *
 * `GET /bootstrap` already carries them and every signed-in boot makes that request anyway, so the
 * cheapest way to have the rules is to **join the bootstrap already in flight** — `getBootstrap` is
 * single-flighted, and `getBootstrap` is also the single choke point that calls `setRules`. Asking
 * `hydrateRules()` first instead races it and fetches `GET /rules` every single time.
 *
 * ## Why this is a module and not a method on `rulesCache`
 *
 * It needs `bootstrapService`, and `bootstrapService` imports `setRules` from `rulesCache`. Putting
 * this there would close that loop, and a cycle in this directory is not a style question: importing
 * a store from another store already failed here as a TDZ error thrown inside a watcher, which Vue
 * only logs.
 *
 * ## Why there are two exports
 *
 * `referenceCache` and the route gate want the same logic under different failure policies, and
 * collapsing them got one of them wrong each way round. They share one body, below.
 *
 * The duplicate request this removes was found and measured by step 24's deploy-skew spec, which
 * deliberately left it alone: the fix belongs with a bound, and the bound is the whole difference
 * between the two callers.
 */
async function joinBootstrapThenFallback(): Promise<void> {
  if (rulesHydrated.value) return;
  // Joins the in-flight request rather than adding one. Skipped with no session, where `/bootstrap`
  // can only answer 401.
  if (hasSession.value) await getBootstrap();
  // A no-op once the rules are in — and the real fallback when they are not: a signed-out surface,
  // or a bootstrap that failed. That path hits the public `GET /rules`, itself already bounded.
  await hydrateRules();
}

/**
 * For `referenceCache.hydrateReferenceCache`, which is fire-and-forget from the boot plugin.
 *
 * **Unbounded, deliberately.** Reference hydration is all-or-nothing on `rulesHydrated`, so giving
 * this a deadline would fail the whole cache — and draw the app zone's retry card — over a bootstrap
 * that was merely slow rather than broken. Nothing is waiting on this call for a route to render.
 */
export function ensureRules(): Promise<void> {
  return joinBootstrapThenFallback();
}

/**
 * For `middleware/auth.global.ts`, which awaits this **above** three `until(…, {timeout: 3000})`
 * guards before `/app/**`, `/team-wizard` and the whole auth zone.
 *
 * **Bounded, and by a single deadline for the whole thing — not 3s for the bootstrap and then 3s
 * more for the fallback.** `apiFetch` sets no timeout and no `AbortSignal`, so an endpoint that
 * simply never answers wedges the route with nothing on screen at all: no shell, no retry card, no
 * error page. That was measured at 25s against a stalled `/rules` and is what `RULES_TIMEOUT_MS`
 * exists to stop; awaiting a bootstrap here without the same bound would have quietly reopened it.
 *
 * A late answer is still adopted — the losing request is not cancelled, and rules arriving after the
 * deadline are better than no rules. Whoever navigates next simply finds them already there.
 */
export function ensureRulesForRoute(): Promise<void> {
  if (rulesHydrated.value) return Promise.resolve();
  return withDeadline(joinBootstrapThenFallback(), RULES_TIMEOUT_MS);
}

/**
 * Resolve when `work` settles or the deadline passes, whichever is first. **Never rejects**, and the
 * `.catch` is what makes that true rather than merely likely.
 *
 * Two reasons it has to hold. `middleware/auth.global.ts` AWAITS this before the route renders, so a
 * rejection here is a Nuxt error page where the shell's own retry card belongs — and the retry card is
 * already the designed failure screen: a failed read leaves the rules cache cold, which keeps
 * `referenceCache.hydrated` shut, which is what draws it. Nothing is swallowed silently. And second,
 * when the deadline wins the race, a `work` that rejects LATER has no handler at all, which surfaces
 * as an unhandled rejection in the console — noise blamed on whatever ran next.
 *
 * In practice `apiFetch` never throws across the seam, so neither case should arise. This costs one
 * line and removes the need for that to keep being true.
 */
async function withDeadline(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([work.catch(() => undefined), expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
