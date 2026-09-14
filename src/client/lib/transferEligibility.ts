/**
 * Pure eligibility/vacancy logic for the Transfers list pane, layered over
 * `squadRules`. Ports the `squadIds` / `effectiveCurrent` memos of FEL_APP
 * `AddPlayerScreen.tsx`, generalized from a single locked slot to "first
 * unfilled vacancy matching the candidate's position" (the web list pane is
 * the picker for every open slot at once).
 */
import type { PositionCode } from '../data/positions.js';
import { pBy, type Player } from '../api/referenceCache.js';
import { canPick, type RuleError } from './squadRules.js';
import type { PendingTransfer } from './pendingBasket.js';

export interface EligibilityCtx {
  /** Raw owned squad: `[...xi, ...bench]` (pre-pending). */
  squadIds: number[];
  pending: PendingTransfer[];
  /** Live bank from the transfers store (already credits sells / debits buys). */
  bank: number;
}

export type IneligibleReason =
  | { kind: 'rule'; error: RuleError }
  | { kind: 'noVacancy'; pos: PositionCode }
  | { kind: 'noFunds' }
  /** Already leaving the squad — can't be bought into another vacancy. */
  | { kind: 'outgoing' };

/**
 * What a given player id is, relative to the squad + basket. Drives which
 * affordance a market row or pitch tile shows, so the list and the pitch can
 * never disagree about the same player.
 *
 * - `owned`      — in the committed squad, untouched → "×" (sell)
 * - `markedOut`  — sold, no replacement chosen → "+" (cancel the sale)
 * - `swappedOut` — sold *and* replaced → disabled "+" ("being transferred out")
 * - `pendingIn`  — an incoming pick → "×" (drop the pick, keep the vacancy)
 * - `free`       — untouched by either → "+" (buy, if eligible)
 */
export type PlayerSlotState = 'owned' | 'markedOut' | 'swappedOut' | 'pendingIn' | 'free';

export interface SlotStateCtx {
  squadIds: number[];
  pending: PendingTransfer[];
}

/**
 * Every id the squad or basket touches. Anything absent is `free`.
 *
 * Squad first, pending second, so a basket entry always wins over raw squad
 * membership — the bug this replaces read squad membership alone, which never
 * changes until commit, so a player you had just sold still rendered "×".
 */
export function buildSlotStates(ctx: SlotStateCtx): Map<number, PlayerSlotState> {
  const map = new Map<number, PlayerSlotState>();
  for (const id of ctx.squadIds) map.set(id, 'owned');
  for (const p of ctx.pending) {
    map.set(p.outId, p.inId == null ? 'markedOut' : 'swappedOut');
    if (p.inId != null) map.set(p.inId, 'pendingIn');
  }
  return map;
}

/**
 * First unfilled pending vacancy whose outgoing player matches `pos`.
 * Scans in `pending` array order (= markOut order), so fills are
 * deterministic: first sold, first refilled.
 */
export function firstVacancyFor(pos: PositionCode, ctx: EligibilityCtx): number | null {
  for (const p of ctx.pending) {
    if (p.inId == null && pBy(p.outId)?.pos === pos) return p.outId;
  }
  return null;
}

/**
 * Owned ids with all *filled* swaps applied — the set that blocks a candidate
 * as "already picked". Unfilled outs stay owned until commit.
 *
 * Deliberately unchanged when the FPL-parity affordances landed. Dropping
 * unfilled outs from this set looks like the natural fix for "the player I
 * just sold reads as already picked", but it lets him be bought back into his
 * own vacancy — `firstVacancyFor` returns that very slot, `canPick` passes
 * against the 14 remaining ids, and you get `{outId: X, inId: X}`, which
 * `commit()` rejects with no way to clear the basket. `reasonFor`'s `outgoing`
 * guard handles that case ahead of this set instead, and generalises to any
 * vacancy rather than only the player's own.
 */
export function effectiveIds(ctx: EligibilityCtx): Set<number> {
  const ids = new Set(ctx.squadIds);
  for (const p of ctx.pending) {
    if (p.inId != null) {
      ids.delete(p.outId);
      ids.add(p.inId);
    }
  }
  return ids;
}

/**
 * The set `canPick` validates a candidate against: the squad as it will be once every *filled*
 * swap is applied and every *open* vacancy is empty. Size is `15 − open vacancies`, so ≤ 14
 * whenever there is a vacancy to fill at all.
 *
 * Every unfilled out is dropped, not just the one being filled. Dropping only that one — which
 * this did — left each OTHER marked-out player counted against his club, so the answer depended
 * on which slot `firstVacancyFor` happened to return, i.e. on removal ORDER: sell a Zamalek
 * midfielder then an Ahly one and a replacement Ahly midfielder was refused "max 3 from Ahly";
 * sell the same two the other way round and the identical basket allowed it. `autoPick`
 * (`stores/transfers.ts`) always counted clubs this way, so the two surfaces disagreed.
 *
 * Deliberately not keyed on the vacancy any more: since `firstVacancyFor` only ever returns an
 * unfilled out, the target is always in the dropped set, and the result is the same for every
 * position — so `buildEligibility` computes it once.
 *
 * The remaining rules stay sound on a shorter set: a candidate fills exactly one vacancy and
 * vacancies are position-matched, so the position caps still bite; and length ≤ 14 keeps
 * `canPick`'s `squadFull` guard and `validateSquad`'s `overSize` out of reach from this path.
 * (Drops from the raw squad, not from `effectiveIds` — see the RN memo.)
 */
export function effectiveCurrent(ctx: EligibilityCtx): number[] {
  const swap = new Map<number, number>();
  const unfilled = new Set<number>();
  for (const p of ctx.pending) {
    if (p.inId != null) swap.set(p.outId, p.inId);
    else unfilled.add(p.outId);
  }
  return ctx.squadIds.filter((id) => !unfilled.has(id)).map((id) => swap.get(id) ?? id);
}

/**
 * Eligibility for every listed player in one pass. Shared structures
 * (owned set, per-position vacancy + its 14-id set) are computed once, so a
 * 170-row list does O(rows) work, not O(rows × squad).
 */
export function buildEligibility(
  players: Player[],
  ctx: EligibilityCtx,
): Map<number, IneligibleReason | null> {
  const owned = effectiveIds(ctx);
  const outgoing = new Set(ctx.pending.map((p) => p.outId));
  const bankTenths = Math.round(ctx.bank * 10);
  // One set for every candidate: it no longer varies by which vacancy is being filled.
  const current = effectiveCurrent(ctx);
  const vacancyByPos = new Map<PositionCode, number | null>();

  function vacancyFor(pos: PositionCode): number | null {
    // `undefined` means "not looked up yet"; a cached `null` means "genuinely no vacancy".
    let vacancy = vacancyByPos.get(pos);
    if (vacancy === undefined) {
      vacancy = firstVacancyFor(pos, ctx);
      vacancyByPos.set(pos, vacancy);
    }
    return vacancy;
  }

  function reasonFor(p: Player): IneligibleReason | null {
    // Must run BEFORE the `owned` check, for two different reasons.
    //
    // Correctness: a player with a *filled* swap is already absent from
    // `effectiveIds`, so without this he reads as eligible and a "+" would
    // build `{outId: someOtherSlot, inId: him}` — a basket that passes
    // `canSave`, then gets rejected by `commit()`'s `ownedSet.has(inId)` guard
    // with no way to clear it (the QA-03 jam). Unreachable while the list
    // keyed its affordance off raw squad membership; live the moment it
    // doesn't.
    //
    // Messaging: an *unfilled* out is still in `owned`, so it would otherwise
    // report "already picked", which is the opposite of what's true — he's on
    // his way out. Cancelling that sale is `restore`, not a buy.
    if (outgoing.has(p.id)) return { kind: 'outgoing' };
    if (owned.has(p.id)) return { kind: 'rule', error: { key: 'rules.alreadyPicked' } };
    if (vacancyFor(p.pos) == null) return { kind: 'noVacancy', pos: p.pos };
    // Tenths math: the store bank is rounded to 0.1 but float subtraction dust
    // (e.g. -1.4e-14) would otherwise flip a just-affordable buy to blocked.
    if (bankTenths < Math.round(p.price * 10)) return { kind: 'noFunds' };
    // `skipBudget` because the bank above is the funds gate here, not the static
    // £100.0m cap — the same call `commit()` and FEL_API's own rules engine
    // make. Leaving the cap on double-counted the basket, because `effectiveCurrent`
    // used to drop only the vacancy being filled: every OTHER marked-out player was
    // still priced into the squad while `bank` had already credited his sale.
    // Two sales and a signing the manager could plainly afford then read
    // "Over budget", and a third sale made it worse rather than better. That same
    // stale set was also still counting those players against the 3-per-club cap;
    // `effectiveCurrent` now drops all of them, which fixes both halves at the source.
    const pick = canPick(current, p.id, { skipBudget: true });
    if (!pick.ok) return { kind: 'rule', error: pick.reason };
    return null;
  }

  const map = new Map<number, IneligibleReason | null>();
  for (const p of players) map.set(p.id, reasonFor(p));
  return map;
}
