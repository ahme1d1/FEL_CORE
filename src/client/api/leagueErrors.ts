/**
 * FEL_API error codes for leagues/cup mapped to existing copy (integration
 * step 7). `LEAGUE_FULL` and `LEAGUE_LOCKED` get dedicated keys — retrying with
 * the same code is pointless for both, so they deserve distinct copy from the
 * generic `leagues.join.cantJoin` ("try another code"). Everything else
 * (`INVALID_CODE`, `LEAGUE_NOT_FOUND`, `ALREADY_MEMBER`, `NOT_LEAGUE_MEMBER`,
 * `NOT_MEMBER`, `SQUAD_HIDDEN`, `CUP_NOT_FOUND`, `NOT_IN_CUP`) falls back to
 * the server's own bilingual `message` or the generic join-failure copy —
 * same "don't over-build copy for edge cases" reasoning as `transferErrors.ts`.
 */
const ERROR_CODE_KEYS = {
  LEAGUE_FULL: 'leagues.join.full',
  // Same reasoning as `LEAGUE_FULL`: a H2H league locks once its fixtures are generated (FPL's
  // rule), so retrying — with this code or any other — cannot work, and "try another code" would
  // send the reader looking for a code that does not exist.
  LEAGUE_LOCKED: 'leagues.join.locked',
} as const;

export type LeagueErrorCodeKey = (typeof ERROR_CODE_KEYS)[keyof typeof ERROR_CODE_KEYS];

/** Everything `resolveLeagueErrorMessage` can hand to `t()`. */
export type LeagueMessageKey = LeagueErrorCodeKey | 'leagues.join.cantJoin';

export function mapLeagueErrorCode(code: string | undefined): LeagueErrorCodeKey | null {
  if (!code) return null;
  return (ERROR_CODE_KEYS as Record<string, LeagueErrorCodeKey | undefined>)[code] ?? null;
}

interface LeagueErrorLike {
  error: string | null;
  code?: string;
}

/**
 * Resolves the best user-facing message for a failed league/cup
 * `ApiResponse`: a dedicated localized string for a mapped code, else the
 * server's own already-bilingual `message`, else the generic join-failure
 * fallback.
 */
export function resolveLeagueErrorMessage(res: LeagueErrorLike, t: (key: LeagueMessageKey) => string): string {
  const key = mapLeagueErrorCode(res.code);
  if (key) return t(key);
  if (res.error) return res.error;
  return t('leagues.join.cantJoin');
}
