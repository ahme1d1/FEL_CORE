import type { PositionCode } from './positions.js';

/** Mirrors FEL_API's `PlayerNewsStatus` enum (prisma/schema.prisma). */
export type PlayerNewsStatus = 'AVAILABLE' | 'DOUBTFUL' | 'INJURED' | 'SUSPENDED';

/**
 * Player TYPES + pure helpers only. The roster itself lives in the FEL_API
 * database (see `../FEL_API/src/seed-data/players.ts` for the seed) and
 * hydrates at runtime into `app/services/api/referenceCache.ts` — the frontend
 * ships no player records. `pBy`/`playerRanking` live on the cache, backed by
 * the hydrated data.
 */
export interface Player {
  id: number;
  /** Arabic display name (canonical for this app). */
  name: string;
  /** Club ID (uppercase 3-letter code). */
  club: string;
  pos: PositionCode;
  price: number;
  form: number;
  total: number;
  sel: number;
  news?: string | null;
  /**
   * Structured availability, straight from the API. Prefer these over `news` — that field is
   * free text an admin types, and classifying it by string compare (`news === 'إصابة'`) is what
   * mislabelled flagged players and left a status-only flag invisible on every pitch. Use
   * `availabilityOf()` / `reasonOf()` in `app/lib/availability.ts`; don't read it raw.
   */
  newsStatus?: PlayerNewsStatus | null;
  /**
   * Root-relative headshot path served by FEL_API (`/api/v1/assets/players/<id>.webp`),
   * resolved against the API origin by `assetUrl()`. Null when the API has no
   * photo for this player — coverage is partial, so `PlayerPortrait` falls back
   * to its procedural portrait rather than requesting a URL that 404s.
   */
  photoUrl?: string | null;
  /**
   * False once a player leaves the league. They stay owned, stay on the pitch and stay
   * sellable — they just can't be bought. The reference cache hydrates every player so any
   * owned id resolves; `MARKET` is the buyable subset. See `referenceCache.ts`.
   */
  isActive: boolean;
}

// `priceChange()` and `ownershipDelta()` used to live here. Both derived a
// number from the player's *id* (`p.id * 37 % 11 - 5`), so every "▲ 0.3m" and
// "Own ↑1.2%" the UI showed was a function of a database key, not of anything
// that happened. Real replacements: `GET /players/price-changes` returns actual
// movement recorded by the price-change job (PriceChangesSheet reads it), and
// each player's real current ownership arrives as `sel` on the player record.

export interface FormHistoryEntry {
  gw: number;
  opp: string;
  home: boolean;
  pts: number;
}

// The RN-ported `recentFormHistory()` generator lived here and was removed
// (QA-44) — it invented completed fixtures, opponents and point totals from a
// seed anchored to a hardcoded gameweek. `FormHistoryEntry` is kept as the
// shape any *real* history source should produce.

export type RankableStat = 'price' | 'form' | 'total' | 'sel';

export interface PlayerRank {
  rank: number;
  total: number;
}

export function ptsPerMatch(p: Player): number {
  const played = Math.max(1, Math.round(p.total / Math.max(1, p.form)));
  return Math.round((p.total / played) * 10) / 10;
}
