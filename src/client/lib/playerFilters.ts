/**
 * Shared player-filter vocabulary for every screen that lists players — the
 * transfers market and the team wizard's picker.
 *
 * Pure on purpose: the value codec and the predicates have to work in the
 * wizard (client-side over the in-memory `PLAYERS` array) *and* map onto
 * `playersService.listPlayers` query params for transfers. The i18n-dependent
 * option lists live in `composables/usePlayerFilterOptions.ts` instead, so
 * this module stays testable without Nuxt.
 */
import { clubBy, clubName, clubShort, type Player } from '../api/referenceCache.js';
import type { Lang } from './fmt.js';
import type { PositionCode } from '../data/positions.js';
import type { PlayerSortKey } from '../api/playersService.js';

/** `'ALL' | 'POS:<code>' | 'CLUB:<id>'` — one combined dropdown, FPL-style. */
export type PlayerViewValue = string;

/**
 * The API can sort by these four; goals/assists/minutes are derived from
 * per-player history and sorted client-side by the caller that has it.
 */
export type PlayerSortId = PlayerSortKey | 'goals' | 'assists' | 'minutes';

export const DERIVED_SORTS: ReadonlySet<PlayerSortId> = new Set<PlayerSortId>([
  'goals',
  'assists',
  'minutes',
]);

export const ALL_PLAYER_SORTS: readonly PlayerSortId[] = [
  'total', 'form', 'price', 'sel', 'goals', 'assists', 'minutes',
];

/**
 * The wizard's reduced set. The derived three need a `getPlayerHistory` call
 * per player; firing that fan-out from inside the onboarding picker is not
 * worth it, and there is no server-side sort to fall back to when the wizard
 * filters the in-memory array itself.
 */
export const WIZARD_PLAYER_SORTS: readonly PlayerSortId[] = ['total', 'form', 'price', 'sel'];

/** £14.5m down to £4.0m in £0.5m steps. */
export const MAX_PRICE_STEPS: readonly number[] = (() => {
  const steps: number[] = [];
  for (let v = 14.5; v >= 4; v -= 0.5) steps.push(Math.round(v * 10) / 10);
  return steps;
})();

export interface PlayerFilterState {
  search: string;
  view: PlayerViewValue;
  /** `''` = any price · `'AFF'` = within budget · numeric string = ≤ that price. */
  maxPrice: string;
  sortBy: PlayerSortId;
}

export const DEFAULT_PLAYER_FILTERS: PlayerFilterState = {
  search: '',
  view: 'ALL',
  maxPrice: '',
  sortBy: 'total',
};

export function encodePosView(pos: PositionCode | 'ALL'): PlayerViewValue {
  return pos === 'ALL' ? 'ALL' : `POS:${pos}`;
}

export function encodeClubView(clubId: string): PlayerViewValue {
  return `CLUB:${clubId}`;
}

export function decodeView(view: PlayerViewValue): { pos?: PositionCode; club?: string } {
  if (view.startsWith('POS:')) return { pos: view.slice(4) as PositionCode };
  if (view.startsWith('CLUB:')) return { club: view.slice(5) };
  return {};
}

export function isFiltered(state: PlayerFilterState): boolean {
  return (
    state.search.trim() !== '' ||
    state.view !== 'ALL' ||
    state.maxPrice !== '' ||
    state.sortBy !== DEFAULT_PLAYER_FILTERS.sortBy
  );
}

/**
 * Resolve the price cap against the caller's budget ("Affordable" means the
 * transfers bank on one screen and the wizard's remaining budget on the
 * other).
 *
 * The `undefined` vs `0` distinction is load-bearing: `undefined` means "no
 * price filter", while a real `0` (Affordable with an empty bank) is a genuine
 * filter that must exclude everyone. `playersService` treats the two
 * differently, so this must never collapse them.
 */
export function resolveMaxPrice(maxPrice: string, budget: number): number | undefined {
  if (maxPrice === '') return undefined;
  if (maxPrice === 'AFF') return Math.max(0, budget);
  return Number(maxPrice);
}

/**
 * Name-or-club match, case-folded.
 *
 * `Player.name` is Arabic-only, so a name-only match left the English UI
 * unsearchable — typing "Ahly" found nothing even though every row renders its
 * club in English (QA-35). Match the club too, in whichever language it is
 * displayed.
 */
export function matchesQuery(player: Player, query: string, lang: Lang): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (player.name.toLowerCase().includes(q)) return true;
  const club = clubBy(player.club);
  if (!club) return player.club.toLowerCase().includes(q);
  return (
    player.club.toLowerCase().includes(q) ||
    clubShort(club, lang).toLowerCase().includes(q) ||
    clubName(club, lang).toLowerCase().includes(q)
  );
}

/** Descending by the chosen stat — ascending for price, where cheaper ranks first. */
export function comparePlayers(sort: PlayerSortId): (a: Player, b: Player) => number {
  switch (sort) {
    case 'price':
      return (a, b) => b.price - a.price;
    case 'form':
      return (a, b) => b.form - a.form;
    case 'sel':
      return (a, b) => b.sel - a.sel;
    default:
      // Derived sorts never reach here — their caller owns the aggregate data.
      return (a, b) => b.total - a.total;
  }
}
