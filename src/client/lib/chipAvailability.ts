/**
 * The server's chip verdict, translated for the two places that render it.
 *
 * `GET /transfers/state` and `GET /chips/state` publish `chipsAvailable` — one `{kind, playable,
 * reason}` per chip — because the client used to decide this from four local branches and one of
 * them was wrong: "already used" tested the WHOLE history while the server scopes chip usage to
 * the gameweek's `(season, seasonHalf)`, so a Wildcard spent in the first stage would have been
 * refused here and allowed there.
 *
 * Those branches were removed from `stores/transfers.ts`'s `activateChip` and left standing in
 * `components/ChipPlayRow.vue`, which decides what the CARD looks like — so the client still
 * refused, at the card, a chip the server granted, and with the card disabled there was no dialog
 * and no route to the server's answer. This module is the one definition both now read.
 */

/**
 * Reason code → dictionary key.
 *
 * `ACTIVE` is deliberately absent: the chip in force is a STATE, not an error, and the card says
 * so with its own styling. The store's `activateChip` never sees it either — it returns early on
 * a repeat press.
 */
export const CHIP_REASON_KEYS = {
  PRESEASON_LOCKED: 'chips.error.preSeason',
  ALREADY_USED: 'chips.error.alreadyUsed',
  ONE_PER_GW: 'chips.error.onePerGW',
  ONE_ACTIVE: 'chips.error.oneActive',
  DEADLINE_PASSED: 'chips.error.deadlinePassed',
} as const;

export type ChipReasonKey = (typeof CHIP_REASON_KEYS)[keyof typeof CHIP_REASON_KEYS];

/**
 * The dictionary key naming one refusal, or `null` when this build has no name for it.
 *
 * `Object.hasOwn`, never a bare `[reason] ?? fallback`: an index lookup walks the prototype chain,
 * so a wire value of `constructor` or `toString` comes back as a FUNCTION — which is not nullish,
 * so the `??` never fires — and is handed to `t()` as if it were a key. Exactly the failure
 * `breakdownLabel` documents, and the reason it uses `hasOwn` too. FEL_API owns this union and
 * deploys separately, so an unmapped code is a matter of time, not of malice.
 */
export function chipReasonKey(reason: string | null | undefined): ChipReasonKey | null {
  if (!reason) return null;
  return Object.hasOwn(CHIP_REASON_KEYS, reason)
    ? ((CHIP_REASON_KEYS as Record<string, ChipReasonKey>)[reason] ?? null)
    : null;
}

/** What a chip card looks like. Mirrors `ChipCardState` in `ChipCardInline.vue`. */
export type ChipCardState = 'available' | 'played' | 'active' | 'disabled';

/**
 * The card state one server verdict implies.
 *
 * The default is `disabled`, and that is the load-bearing part. `ONE_PER_GW` used to fall through
 * to `available`, so the card offered a control that could only fail: the confirm dialog opened,
 * Activate was enabled, and the refusal arrived inline afterwards — the QA-33 regression, fixed
 * for `ONE_ACTIVE` and missed for its neighbour. A reason this build cannot NAME still disables
 * the card: an unnamed refusal is honest, a button that cannot work is not.
 */
export function cardStateForReason(reason: string | null | undefined): ChipCardState {
  if (!reason) return 'available';
  if (reason === 'ACTIVE') return 'active';
  if (reason === 'ALREADY_USED') return 'played';
  return 'disabled';
}
