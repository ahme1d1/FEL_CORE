import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

/**
 * A FRESH copy of the module per test.
 *
 * `tests/setup/rules.ts` imports `rulesCache` for every suite in the project, so by the time this
 * file's `vi.mock` applies, the real `./client` is already wired into the cached module. Resetting
 * the registry and re-importing is what puts the mock in front of it — and it also gives each test
 * its own `RULES`/single-flight state, which is what these assertions are about.
 */
async function freshModule() {
  vi.resetModules();
  return import('./rulesCache.js');
}

describe('hydrateRules', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
  });

  it('adopts the rules the API answers with', async () => {
    const m = await freshModule();
    apiFetchMock.mockResolvedValue({ success: true, data: m.TEST_RULES, error: null });
    await m.hydrateRules();
    expect(m.rulesOrNull()).toEqual(m.TEST_RULES);
    expect(m.hydrated.value).toBe(true);
  });

  it('leaves the cache cold when the read fails, so the shell draws its retry card', async () => {
    const m = await freshModule();
    apiFetchMock.mockResolvedValue({ success: false, data: null, error: 'NOT_FOUND' });
    await m.hydrateRules();
    expect(m.rulesOrNull()).toBeNull();
    expect(m.hydrated.value).toBe(false);
  });

  it('gives up on a request that never answers, instead of wedging every gated route', async () => {
    // The defect this pins: `apiFetch` sets no timeout and `auth.global.ts` awaits this ABOVE the
    // three `until(..., { timeout: 3000 })` guards. A hung `/rules` — as opposed to a failed one —
    // left `/app/**`, `/team-wizard` and the auth zone rendering nothing at all: no shell, no
    // retry card, no error page. Measured live at 25s with `document.body.innerText === ''`.
    const m = await freshModule();
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    const settled = vi.fn();
    void m.hydrateRules().then(settled);

    await vi.advanceTimersByTimeAsync(m.RULES_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    expect(settled).toHaveBeenCalled();
    expect(m.rulesOrNull()).toBeNull();
    expect(m.hydrated.value).toBe(false);
  });

  it('can be retried after a timeout — the single-flight entry does not stay stuck', async () => {
    // If the raced promise were left cached, a retry would hand back the SAME never-resolving
    // promise and the retry card's button would do nothing for the rest of the session.
    const m = await freshModule();
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    void m.hydrateRules();
    await vi.advanceTimersByTimeAsync(m.RULES_TIMEOUT_MS + 1);

    apiFetchMock.mockResolvedValue({ success: true, data: m.TEST_RULES, error: null });
    await m.hydrateRules();
    expect(m.rulesOrNull()).toEqual(m.TEST_RULES);
  });

  it('is a no-op once the rules are in hand', async () => {
    const m = await freshModule();
    apiFetchMock.mockResolvedValue({ success: true, data: m.TEST_RULES, error: null });
    await m.hydrateRules();
    apiFetchMock.mockClear();
    await m.hydrateRules();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
