import { mapGenericErrorCode, type GenericErrorKey } from './apiErrors.js';

/**
 * FEL_API error codes for squad/transfers/chips mapped to the existing
 * confirm-dialog/toast copy (integration step 5). One shared table since
 * squad, transfers, and chips render on the same transfers/squad pages.
 *
 * `SQUAD_INVALID`/`PLAYER_NOT_FOUND` fall back to the generic save-failed
 * copy: they signal the client's own pre-checks (squad composition, ownership)
 * missed something the server caught, which shouldn't happen via normal UI
 * flows — no dedicated copy is warranted.
 *
 * `TRANSFER_INVALID` used to fall back the same way, on the same "can't happen
 * via the UI" reasoning. It can: two tabs on the transfers page, one commits,
 * and the other's basket now references a player the manager no longer owns
 * (QA-02). It gets copy that actually tells the user what to do.
 * `IDEMPOTENCY_KEY_REUSED` falls back the same way: it should never surface
 * given the key strategy (a fresh key per distinct swap set), so treat it as
 * a bug signal rather than user-facing copy worth writing.
 *
 * `CHIP_CONFLICT` is overloaded server-side for two distinct situations
 * ("another chip active this GW" and "a different chip already used this
 * exact GW") that the client used to distinguish with two separate checks
 * (`chips.error.oneActive` / `onePerGW`). Since one server code can't tell
 * them apart, keep the client-side pre-checks in `activateChip()` for the
 * common case (more specific, no round-trip) and only fall back to the
 * generic `oneActive` copy here for a conflict the client's own guard missed.
 */
const ERROR_CODE_KEYS = {
  DEADLINE_LOCKED: 'squad.locked.msg',
  GAMEWEEK_LOCKED: 'squad.locked.msg',
  // The previous gameweek is past its deadline and still being frozen. Transient by nature —
  // the copy asks for a retry rather than reporting a lock.
  GAMEWEEK_PROCESSING: 'gw.processing.msg',
  INSUFFICIENT_FUNDS: 'transfers.banner.fundsShort',
  CHIP_ALREADY_USED: 'chips.error.alreadyUsed',
  CHIP_CONFLICT: 'chips.error.oneActive',
  CHIP_LOCKED: 'chips.error.fhLocked',
  NO_ACTIVE_CHIP: 'chips.error.noActive',
  PRESEASON_LOCKED: 'chips.error.preSeason',
  SQUAD_INVALID: 'errors.saveFailed',
  PLAYER_NOT_FOUND: 'errors.saveFailed',
  TRANSFER_INVALID: 'transfers.error.invalid',
  IDEMPOTENCY_KEY_REUSED: 'errors.saveFailed',
} as const;

export type TransferErrorCodeKey = (typeof ERROR_CODE_KEYS)[keyof typeof ERROR_CODE_KEYS];

/** Everything the two resolvers below can hand to `t()`. */
export type TransferMessageKey = TransferErrorCodeKey | GenericErrorKey | 'errors.saveFailed';

export function mapTransferErrorCode(code: string | undefined): TransferErrorCodeKey | null {
  if (!code) return null;
  // `hasOwn`, not a bare index: the lookup walks the prototype chain otherwise, so a server code
  // of `constructor` or `toString` returns a FUNCTION — not nullish, so the `??` never fires — and
  // is handed to `t()` as a key. Same failure `breakdownLabel` documents; this table is fed from
  // the same place (the wire) and deploys separately from the server that fills it.
  return Object.hasOwn(ERROR_CODE_KEYS, code)
    ? ((ERROR_CODE_KEYS as Record<string, TransferErrorCodeKey | undefined>)[code] ?? null)
    : null;
}

interface TransferErrorLike {
  error: string | null;
  code?: string;
}

/**
 * Resolves the best user-facing message for a failed squad/transfers/chips
 * `ApiResponse`: a dedicated localized string for a mapped code, else the
 * server's own already-bilingual `message`, else the generic fallback.
 */
export function resolveTransferErrorMessage(res: TransferErrorLike, t: (key: TransferMessageKey) => string): string {
  const key = mapTransferErrorCode(res.code) ?? mapGenericErrorCode(res.code);
  if (key) return t(key);
  return res.error || t('errors.saveFailed');
}

/**
 * The message for one rule the PREVIEW says a basket breaks.
 *
 * Different shape from `resolveTransferErrorMessage`, which reads a failed `ApiResponse`: a
 * preview SUCCEEDS and carries its verdict in the body, so what arrives is a `{code, message}`
 * rather than an HTTP failure. Same table underneath, so the sentence a manager sees at Confirm is
 * the one they would have seen had the commit refused.
 *
 * Falls back to the server's own `message` — which is English prose meant for logs, but a true
 * statement about their basket — rather than to a generic failure. An unmapped code means the
 * server knows a rule this build does not, and saying nothing useful about it is worse than
 * saying something plain. Same principle `breakdownLabel` applies to an unknown `BreakdownKind`.
 */
export function transferRuleMessage(
  rule: { code: string; message: string },
  t: (key: TransferMessageKey) => string,
): string {
  const key = mapTransferErrorCode(rule.code);
  return key ? t(key) : rule.message || t('errors.saveFailed');
}
