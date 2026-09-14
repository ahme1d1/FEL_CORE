import { cell } from '../platform/reactivity.js';

import { apiFetch } from './client.js';
import { singleFlight, type SingleFlightCache } from './singleFlight.js';

/**
 * The game's rule constants, served by the API.
 *
 * This file exists so the client holds none of them. It used to hold eight — `BUDGET_CAP`,
 * `POSITION_CAPS`, `MAX_PER_CLUB`, `TOTAL_SQUAD_SIZE`, `HIT_COST_PER_EXTRA`, `XI_RULES`,
 * `FORMATION_IDS`, `MATCH_WINDOW_MS` — each written out again beside a comment asking whoever
 * changed `FEL_API` to remember to change this too. Nothing enforced that, and the same
 * arrangement for scoring under-counted Defensive Contribution by 2 points a match for six days
 * without failing once.
 *
 * **It costs no request.** `GET /bootstrap` carries the same object and the app already fetches it
 * before any `/app/**` route renders (`middleware/auth.global.ts` awaits it), so `setRules` is
 * normally called from there. `hydrateRules` is the fallback for the case where something needs
 * the rules and bootstrap has not supplied them — a signed-out surface, or a bootstrap that failed
 * — and it hits the public `GET /rules`.
 */
export interface XiBound {
  min: number;
  max: number;
}

export type RulePosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface SeasonRules {
  /** Starting year — 2026 is the 2026/27 season. */
  year: number;
  /** How many gameweeks this season HAS, counted from the server's own table. */
  gameweeks: number;
  /** Last gameweek of the first stage; the stage-2 rounds do not exist yet. */
  firstStageLastGw: number;
}

export interface Rules {
  budget: number;
  squadSize: number;
  xiSize: number;
  benchSize: number;
  composition: Record<RulePosition, number>;
  maxPerClub: number;
  xiRules: Record<RulePosition, XiBound>;
  formations: string[];
  hitCost: number;
  maxFreeTransfers: number;
  matchWindowMin: number;
  preSeasonLockedChips: string[];
  season: SeasonRules;
}

/**
 * A plain `let`, not a ref — the same shape as `referenceCache`'s `MARKET`/`CLUBS`, and for the
 * same reason: the rule functions that read it are pure and synchronous, and must not have to be
 * `.value`-unwrapped from inside a comparison. Reactivity lives on `hydrated` below.
 */
let RULES: Rules | null = null;

/** Opens once real rules are in hand. Never opens on failure. */
export const hydrated = cell(false, 'rulesCache.hydrated');

/**
 * The rules, or a thrown error naming the gate that should have prevented this.
 *
 * Throwing rather than substituting a default is the point. A default here would be a hardcoded
 * constant wearing a disguise — and it would be wrong exactly when it mattered, quietly validating
 * a squad against numbers the server never agreed to. Every caller runs inside the app zone, whose
 * pages gate on `referenceCache.hydrated`, which does not open until these have landed.
 */
export function rules(): Rules {
  if (!RULES) {
    throw new Error(
      'Game rules read before they were loaded — app-zone surfaces must gate on referenceCache.hydrated',
    );
  }
  return RULES;
}

/** The rules if they are loaded, else `null`. For the few places that legitimately run cold. */
export function rulesOrNull(): Rules | null {
  return RULES;
}

/** Adopt the rules `GET /bootstrap` carried. The ordinary path — no request of its own. */
export function setRules(next: Rules): void {
  RULES = next;
  hydrated.value = true;
}

const cache: SingleFlightCache<void> = { current: null };

/**
 * How long to wait for `GET /rules` before treating silence as failure.
 *
 * Matched to the `until(..., { timeout: 3000 })` guards in `middleware/auth.global.ts`, which
 * this await sits directly above. Not a game rule — a transport bound — so it stays here rather
 * than coming from `/rules` itself, which would be circular.
 */
export const RULES_TIMEOUT_MS = 3000;

/**
 * Fetch `GET /rules` — the fallback, for when bootstrap has not supplied them. Single-flighted,
 * and a no-op once they are in hand, so calling it defensively is free.
 *
 * **Bounded, and that is the point.** `apiFetch` sets no timeout and no `AbortSignal`, and
 * `auth.global.ts` awaits this before `/app/**`, `/team-wizard` and the whole auth zone — above
 * every `until()` guard, all of which ARE bounded. A *failed* read was always handled well (the
 * cache stays cold, `referenceCache.hydrated` stays shut, the shell draws its retry card); a read
 * that simply never answered wedged the route with nothing on screen at all — no shell, no card,
 * no error page. Measured at 25s against a stalled endpoint.
 *
 * The race lives INSIDE the single-flight factory deliberately: `singleFlight` clears its entry
 * when the promise it holds settles, so timing out here releases it and a retry gets a fresh
 * request. Racing outside would leave the stuck promise cached and make the retry button inert.
 *
 * A late answer is still adopted — the losing request is not cancelled, and rules arriving after
 * the deadline are better than no rules.
 */
export function hydrateRules(): Promise<void> {
  if (RULES) return Promise.resolve();
  return singleFlight(cache, async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = apiFetch<Rules>('/rules').then((res) => {
      // Left cold on failure rather than defaulted: `hydrated` staying shut is what makes the app
      // zone render its skeletons instead of numbers nobody stands behind.
      if (res.success && res.data) setRules(res.data);
    });
    const expiry = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RULES_TIMEOUT_MS);
    });
    try {
      await Promise.race([request, expiry]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  });
}

/**
 * The live rules, for tests.
 *
 * A suite has to pin behaviour against KNOWN numbers — «over budget» is only meaningful if the
 * budget is a specific figure — so this is deliberately a written-out copy, unlike anything in
 * app code. It is the one place that copy exists, and `tests/unit/rule-parity.test.ts` is what
 * stops it drifting from `FEL_API`'s constants.
 */
export const TEST_RULES: Rules = {
  budget: 100,
  squadSize: 15,
  xiSize: 11,
  benchSize: 4,
  composition: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  maxPerClub: 3,
  xiRules: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 2, max: 5 },
    FWD: { min: 1, max: 3 },
  },
  formations: ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'],
  hitCost: 4,
  maxFreeTransfers: 5,
  matchWindowMin: 120,
  preSeasonLockedChips: ['wc', 'fh'],
  season: { year: 2026, gameweeks: 20, firstStageLastGw: 19 },
};

/**
 * Test-only seam: install rules without a network. Never call from app code.
 *
 * Takes a full `Rules` rather than a partial, so a suite cannot accidentally pin behaviour to a
 * rule it forgot to set — the very failure mode this module removes.
 */
export function __setRulesForTests(next: Rules = TEST_RULES): void {
  setRules(next);
}

/** Test-only seam: return the cache to its cold state. Never call from app code. */
export function __resetRulesForTests(): void {
  RULES = null;
  hydrated.value = false;
  cache.current = null;
}
