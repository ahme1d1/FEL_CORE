import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const hasSessionRef = { value: false };

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

vi.mock('./session.js', () => ({
  get hasSession() {
    return hasSessionRef;
  },
}));

/**
 * A FRESH copy of the module graph per test — same reason as `rulesCache.test.ts`.
 *
 * `tests/setup/rules.ts` imports `rulesCache` for every suite in the project, so the real `./client`
 * is already wired into the cached module by the time this file's `vi.mock` applies. Resetting the
 * registry and re-importing puts the mocks in front of it, and gives each test its own cold `RULES`
 * and its own single-flight slots — which is what every assertion here is about.
 *
 * `__resetRulesForTests()` is the other half: the global hook installs the rules before every test,
 * and a boot-path test has to start from nothing.
 */
async function freshModules() {
  vi.resetModules();
  const rulesCache = await import('./rulesCache.js');
  rulesCache.__resetRulesForTests();
  const rulesBoot = await import('./rulesBoot.js');
  return { rulesBoot, rulesCache };
}

/** Requests `apiFetch` was asked for, by path. */
const paths = () => apiFetchMock.mock.calls.map((c) => c[0] as string);

describe('ensureRules — the boot path', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    hasSessionRef.value = false;
  });

  /**
   * The whole point. `/bootstrap` carries the rules and every signed-in boot makes that request
   * anyway — asking `hydrateRules()` first raced it and fetched `/rules` as well, on every single
   * cold load. Measured by step 24's deploy-skew spec, fixed here.
   */
  it('takes the rules off the bootstrap it joins, spending no request on /rules', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockImplementation((path: string) =>
      path === '/bootstrap'
        ? Promise.resolve({ success: true, data: { rules: rulesCache.TEST_RULES }, error: null })
        : Promise.reject(new Error(`unexpected request: ${path}`)),
    );

    await rulesBoot.ensureRules();

    expect(paths()).toEqual(['/bootstrap']);
    expect(paths()).not.toContain('/rules');
    expect(rulesCache.hydrated.value).toBe(true);
  });

  // A signed-out surface cannot read `/bootstrap` at all — it is `JwtAuthGuard`, so asking would
  // spend a request to be told 401. The public `GET /rules` is the answer there.
  it('goes straight to /rules with no session, rather than spending a 401', async () => {
    hasSessionRef.value = false;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockResolvedValue({ success: true, data: rulesCache.TEST_RULES, error: null });

    await rulesBoot.ensureRules();

    expect(paths()).toEqual(['/rules']);
  });

  // Deploy skew: a website release can reach production ahead of the API release that publishes the
  // rules on `/bootstrap`. The fallback is what keeps the app zone alive through that window.
  it('falls back to /rules when the bootstrap answers without them', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/bootstrap'
          ? { success: true, data: { profile: {} }, error: null }
          : { success: true, data: rulesCache.TEST_RULES, error: null },
      ),
    );

    await rulesBoot.ensureRules();

    expect(paths()).toEqual(['/bootstrap', '/rules']);
    expect(rulesCache.hydrated.value).toBe(true);
  });

  // Already in hand (the ordinary case on every navigation after the first): no request, and no
  // await on a bootstrap that might be slow.
  it('asks for nothing at all once the rules are loaded', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    rulesCache.__setRulesForTests();

    await rulesBoot.ensureRules();

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  // The cache is all-or-nothing on `rulesHydrated`, so a failure has to leave it shut — that is what
  // makes the shell draw its retry card instead of numbers nobody stands behind.
  it('leaves the cache cold when both reads fail', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'nope' });

    await rulesBoot.ensureRules();

    expect(rulesCache.hydrated.value).toBe(false);
    expect(rulesCache.rulesOrNull()).toBeNull();
  });
});

describe('ensureRulesForRoute — the same thing, bounded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    hasSessionRef.value = false;
  });

  /**
   * `middleware/auth.global.ts` awaits this ABOVE three `until(…, {timeout: 3000})` guards, and
   * `apiFetch` sets no timeout of its own. A `/bootstrap` that never answers therefore wedges
   * `/app/**`, `/team-wizard` and the whole auth zone with nothing on screen — no shell, no retry
   * card, no error page. Measured at 25s against a stalled endpoint before `RULES_TIMEOUT_MS`
   * existed; this is the test that stops the fix from reopening it.
   */
  it('resolves on its deadline when the bootstrap never answers', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    let settled = false;
    const wait = rulesBoot.ensureRulesForRoute().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(rulesCache.RULES_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    await wait;
    expect(settled).toBe(true);
  });

  /**
   * ONE deadline for the whole wait, not one per read. A hung bootstrap followed by a hung `/rules`
   * would otherwise take 2 × `RULES_TIMEOUT_MS`, which is exactly the hang this bound exists to
   * cap — just half as obvious.
   */
  it('spends one deadline in total, not one per read', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    let settled = false;
    const wait = rulesBoot.ensureRulesForRoute().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(rulesCache.RULES_TIMEOUT_MS + 1);
    await wait;
    expect(settled).toBe(true);
  });

  it('returns immediately when the rules are already in hand', async () => {
    const { rulesBoot, rulesCache } = await freshModules();
    rulesCache.__setRulesForTests();

    await rulesBoot.ensureRulesForRoute();

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  // A late answer is still adopted: the losing request is not cancelled, and rules arriving after the
  // deadline are better than no rules. Whoever navigates next simply finds them there.
  it('still adopts rules that land after the deadline', async () => {
    hasSessionRef.value = false;
    const { rulesBoot, rulesCache } = await freshModules();
    let land: (v: unknown) => void = () => {};
    apiFetchMock.mockReturnValue(new Promise((resolve) => (land = resolve)));

    // Started BEFORE the clock moves — the deadline's timer does not exist until the call does.
    const wait = rulesBoot.ensureRulesForRoute();
    await vi.advanceTimersByTimeAsync(rulesCache.RULES_TIMEOUT_MS + 1);
    await wait;
    expect(rulesCache.hydrated.value).toBe(false);

    land({ success: true, data: rulesCache.TEST_RULES, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(rulesCache.hydrated.value).toBe(true);
  });
});

describe('withDeadline, via ensureRulesForRoute', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    hasSessionRef.value = false;
  });

  /**
   * The route gate awaits this BEFORE the page renders, so a rejection here is a Nuxt error page
   * where the shell's own retry card belongs. The card is the designed failure screen — a failed read
   * leaves the rules cache cold, which keeps `referenceCache.hydrated` shut, which draws it — so
   * resolving is what surfaces the failure properly, not what hides it.
   */
  it('resolves rather than rejecting when a read throws outright', async () => {
    hasSessionRef.value = true;
    const { rulesBoot, rulesCache } = await freshModules();
    apiFetchMock.mockRejectedValue(new Error('apiFetch broke its never-throw contract'));

    await expect(rulesBoot.ensureRulesForRoute()).resolves.toBeUndefined();
    expect(rulesCache.hydrated.value).toBe(false);
  });
});
