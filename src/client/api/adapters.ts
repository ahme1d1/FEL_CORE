/**
 * Pure request/response adapters between FEL_API's wire contract and the
 * website's existing `ApiResponse<T>`/`ApiPage<T>` shapes. No Nuxt/$fetch
 * dependency on purpose — these are the functions the Step-3 unit tests
 * exercise directly.
 */
import type { ChipKind } from '../data/chips.js';
import type { EmblemId } from '../data/clubs.js';
import type { FormationId } from '../data/initialSquad.js';
import { rulesOrNull } from './rulesCache.js';
import type { LeagueType } from './leaguesService.js';
import type { NotificationKind } from './notificationsService.js';
import type { ApiPage, ApiResponse } from './types.js';

/** FEL_API's real response envelope (`ResponseEnvelopeInterceptor` / `AllExceptionsFilter`). */
export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  error: string | null;
  code: number;
}

/**
 * `code` here is the machine ErrorCode string from the wire's `error` field
 * (e.g. `DEADLINE_LOCKED`) — the wire's own `code` (HTTP status number) is
 * dropped, it's already redundant with the HTTP response status.
 */
export function mapEnvelope<T>(raw: ApiEnvelope<T>): ApiResponse<T> {
  if (raw.success) {
    return { success: true, data: raw.data, error: null };
  }
  return { success: false, data: null, error: raw.message, code: raw.error ?? undefined };
}

/** Re-shapes a failed `ApiResponse<unknown>` (data is always null on failure) to any `T`. */
export function asFailure<T>(res: ApiResponse<unknown>): ApiResponse<T> {
  return { success: false, data: null, error: res.error, code: res.code };
}

export interface PaginationMetaRaw {
  current_page: number;
  per_page: number;
  total: number;
}

/** FEL_API's Laravel-style paginator shape. */
export interface PaginatedRaw<T> {
  data: T[];
  meta: PaginationMetaRaw;
}

export function mapPage<T>(raw: PaginatedRaw<T>): ApiPage<T> {
  return {
    items: raw.data,
    total: raw.meta.total,
    page: raw.meta.current_page,
    limit: raw.meta.per_page,
  };
}

export function tenthsToDecimal(tenths: number): number {
  return tenths / 10;
}

export function decimalToTenths(decimal: number): number {
  return Math.round(decimal * 10);
}

// Validated passthroughs, not real transforms — FEL_API's public boundary
// already serializes these lowercase(-hyphenated), byte-identical to the
// website's local unions (verified by reading the API's boundary-mapping
// source). They exist as a contract-drift guard: fail fast and loud on an
// unrecognized value rather than silently lying about the type. Throwing
// here never breaks apiFetch's own "never throw across the seam" guarantee
// — callers compose these inside their own try/catch wrapper, turning a
// thrown Error into a clean failed `ApiResponse`, so a drift shows up as one
// failed response, not an uncaught exception.
const CHIP_KINDS: readonly ChipKind[] = ['wc', 'fh', 'bb', 'tc'];
const LEAGUE_TYPES: readonly LeagueType[] = ['classic', 'h2h'];
const EMBLEM_IDS: readonly EmblemId[] = [
  'eagle',
  'sword',
  'pyramid',
  'sun',
  'anchor',
  'flame',
  'gear',
  'spool',
  'shield',
  'palm',
  'flask',
  'bolt',
];
const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'goal',
  'assist',
  'yellow',
  'red',
  'injury',
  'price-up',
  'price-down',
  'deadline',
  'system',
];

function assertOneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unknown ${label} from API: ${value}`);
}

export function toChipKind(value: string): ChipKind {
  return assertOneOf(value, CHIP_KINDS, 'chip kind');
}

export function toLeagueType(value: string): LeagueType {
  return assertOneOf(value, LEAGUE_TYPES, 'league type');
}

export function toNotificationKind(value: string): NotificationKind {
  return assertOneOf(value, NOTIFICATION_KINDS, 'notification kind');
}

export function toEmblemId(value: string): EmblemId {
  return assertOneOf(value, EMBLEM_IDS, 'club emblem');
}

/**
 * A formation off the wire.
 *
 * Checked against the SERVER's list (`rules().formations`), not a local one — the server enforces
 * `@IsIn(FORMATIONS)` on every write, so a formation it sends is valid by construction and a
 * client-side list could only ever manufacture a false failure by lagging a release.
 *
 * Passes the value through untouched when the rules are not loaded yet. That case is real rather
 * than theoretical: `GET /bootstrap` carries a squad AND the rules in one payload, so a parser
 * that demanded the rules first could not read the response that delivers them.
 */
export function toFormationId(value: string): FormationId {
  const formations = rulesOrNull()?.formations;
  if (!formations) return value as FormationId;
  return assertOneOf<FormationId>(value, formations as FormationId[], 'formation');
}
