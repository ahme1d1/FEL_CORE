import type { Lang } from '../lib/fmt.js';

/**
 * Club TYPES + pure display helpers only. The club data itself lives in the
 * FEL_API database and hydrates at runtime into
 * `app/services/api/referenceCache.ts` — the frontend ships no club records
 * and no bundled crest/shirt images (assets are served by the API and arrive
 * as `crestUrl`/`shirtUrl` on each club).
 */

/**
 * Original heraldic emblems rendered procedurally inside the club crest
 * fallback (used only while a club's crest PNG fails to load).
 */
export type EmblemId =
  | 'eagle'    // Al Ahly (Eagles of the Nile)
  | 'sword'    // Zamalek (Knights), Tala'ea El Gaish (Army)
  | 'pyramid'  // Pyramids FC
  | 'sun'      // Ismaily (Dervishes), El Gouna (Red Sea)
  | 'anchor'   // Al Masry (Port Said), Ittihad (Alexandria), Canal SC
  | 'flame'    // Ceramica (kiln), ENPPI / Petrojet / Asyut Petroleum
  | 'gear'     // Mokawloon (contractors), Modern Sport
  | 'spool'    // Ghazl El Mahalla (textile factory)
  | 'shield'   // National Bank, Haras El Hodoud (border guard)
  | 'palm'     // Smouha, Wadi Degla
  | 'flask'    // Pharco (pharmaceutical), Abu Qir Fertilizers
  | 'bolt';    // ZED, Kahraba Ismailia (electricity)

export type KitPattern =
  | 'plain'        // solid color
  | 'stripes'      // vertical stripes (Striped clubs)
  | 'sash'         // diagonal sash across body
  | 'halves'       // left/right halves
  | 'hoops'        // horizontal hoops
  | 'pinstripe';   // thin vertical pinstripes

export interface Kit {
  pattern: KitPattern;
  /** Primary body color. */
  body: string;
  /** Secondary color used for stripes / sash / hoops / halves accent. */
  secondary: string;
  /** Sleeve color (defaults to body if same). */
  sleeves: string;
  /** Shorts / collar trim color. */
  trim: string;
}

export interface Club {
  id: string;
  // Display names — Arabic + English
  name: string;
  short: string;
  nameEn: string;
  shortEn: string;
  // Brand colors used by Crest + Shirt fallbacks and chrome
  color: string;
  ink: string;
  stroke?: string;
  // Real home kit (used by the procedural Shirt fallback)
  kit: Kit;
  // Emblem rendered inside the procedural crest fallback
  emblem: EmblemId;
  // Location
  city: string;
  cityEn: string;
  venue: string;
  venueEn: string;
  // API-served image assets, root-relative to the API origin
  // (e.g. "/api/v1/assets/crests/AHL.png") — resolve via assetUrl().
  crestUrl: string;
  shirtUrl: string;
}

export function clubName(c: Club, lang: Lang): string {
  return lang === 'en' ? c.nameEn : c.name;
}

export function clubShort(c: Club, lang: Lang): string {
  return lang === 'en' ? c.shortEn : c.short;
}

export function clubCity(c: Club, lang: Lang): string {
  return lang === 'en' ? c.cityEn : c.city;
}

export function clubVenue(c: Club, lang: Lang): string {
  return lang === 'en' ? c.venueEn : c.venue;
}
