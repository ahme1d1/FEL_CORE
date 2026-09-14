import type { Squad } from '../data/initialSquad.js';

import { apiFetch } from './client.js';
import type { ManagerProfile } from './managerService.js';
import { setRules, type Rules } from './rulesCache.js';
import { singleFlight, type SingleFlightCache } from './singleFlight.js';
import type { ApiResponse } from './types.js';

/**
 * `GET /bootstrap` — aggregate startup payload (profile + account + squad + transfer/chip state
 * + rules).
 *
 * There is deliberately no gameweek block. It used to carry a hand-rolled `currentGw` that
 * reported the STORED `Gameweek.phase` column rather than the phase derived from deadlines, and
 * collapsed the editing gameweek with the watched one (QA-26). Nothing read it. `stores/gameweek`
 * owns that state, from `GET /gameweeks/current`, with its own polling and failure handling.
 */
export interface BootstrapPayload {
  profile: ManagerProfile;
  /**
   * The caller's ACCOUNT, as distinct from the manager profile above — `User` is 1:0..1 with
   * `ManagerProfile` and the two have separate write paths. Publishing `managerId` here is what
   * lets boot skip `GET /auth/me`, which was a whole request spent reading this one field.
   *
   * Optional for deploy skew, like `rules` below: a website release can reach production ahead of
   * the API release that publishes it, so `stores/auth.ts` falls back to `GET /auth/me`.
   *
   * `roles` is deliberately NOT here — only the admin dashboard reads it, and it stays on
   * `/auth/me`, which also remains the only identity read that works for an account with no
   * `ManagerProfile` and the only one the API marks `@AllowUnverified()`.
   */
  account?: {
    userId: string;
    managerId: string | null;
    email: string | null;
    isGuest: boolean;
  };
  squad: Squad | null;
  transferState: {
    freeTransfers: number;
    bank: number;
    activeChip: string | null;
    /** Same server-owned flag `GET /transfers/state` publishes — see `TransfersStateDTO`. */
    preSeason: boolean;
    firstEligibleGw: number | null;
  } | null;
  chips: {
    activeChip: string | null;
    chipsUsed: { chip: string; gw: number; ts: number }[];
    /** Per-chip playability — see `ChipAvailability` in `chipsService`. */
    chipsAvailable?: { kind: string; playable: boolean; reason: string | null }[];
  };
  /**
   * The game's rule constants. Optional only for deploy skew: a website release can reach
   * production ahead of the API release that publishes them, and `rulesCache` falls back to
   * `GET /rules` when this is absent.
   */
  rules?: Rules;
  unreadNotifications: number;
}

const cache: SingleFlightCache<ApiResponse<BootstrapPayload>> = { current: null };

/**
 * Single-flight `GET /bootstrap` — several stores (e.g. `teamWizard`'s
 * pre-season gate) can call this concurrently on boot without firing
 * duplicate requests.
 */
export function getBootstrap(): Promise<ApiResponse<BootstrapPayload>> {
  return singleFlight(cache, async () => {
    const res = await apiFetch<BootstrapPayload>('/bootstrap');
    // The rules are adopted HERE rather than by each caller, so there is one choke point and no
    // way to add a second bootstrap reader that forgets. This is what makes the rules free: the
    // app zone cannot render without this request, so they never need one of their own.
    if (res.success && res.data?.rules) setRules(res.data.rules);
    return res;
  });
}

/**
 * Drops any in-flight single-flight promise. Call on logout — otherwise a
 * fast logout+login on the same tab can join a stale in-flight `/bootstrap`
 * request started under the previous account instead of firing a fresh one.
 */
export function resetBootstrapCache(): void {
  cache.current = null;
}
