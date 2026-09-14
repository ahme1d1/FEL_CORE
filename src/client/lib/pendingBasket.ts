/**
 * The pending-transfers basket as pure functions.
 *
 * Lives here rather than inside `stores/transfers.ts` for two reasons: the
 * basket rules are the trickiest correctness surface in the app and deserve
 * unit tests that don't need a Pinia harness, and `lib/transferEligibility.ts`
 * needs the `PendingTransfer` type — importing it from a store made a pure lib
 * depend on a Pinia module.
 *
 * Every function takes the current basket and returns a new one; nothing here
 * mutates its input.
 */
import { pBy } from '../api/referenceCache.js';

/**
 * One transfer slot. `inId: null` means "sold, replacement not chosen yet" —
 * an open vacancy. That is a first-class state the UI renders (an empty pitch
 * slot, a `+` on the sold player's market row), not just an intermediate.
 */
export interface PendingTransfer {
  outId: number;
  inId: number | null;
}

/** Mark a squad player as leaving, opening a vacancy. Idempotent. */
export function markOutIn(pending: readonly PendingTransfer[], id: number): PendingTransfer[] {
  if (pending.some((p) => p.outId === id)) return [...pending];
  return [...pending, { outId: id, inId: null }];
}

/**
 * Cancel the sale entirely — the player stays in the squad and any replacement
 * chosen for his slot is dropped with it. This is "undo the transfer", not
 * "change my mind about the incoming player" (see `clearReplacementIn`).
 */
export function restoreIn(pending: readonly PendingTransfer[], outId: number): PendingTransfer[] {
  return pending.filter((p) => p.outId !== outId);
}

/** Fill (or re-fill) the vacancy left by `outId`. */
export function setReplacementIn(
  pending: readonly PendingTransfer[],
  outId: number,
  inId: number,
): PendingTransfer[] {
  const exists = pending.some((p) => p.outId === outId);
  return exists
    ? pending.map((p) => (p.outId === outId ? { outId, inId } : p))
    : [...pending, { outId, inId }];
}

/**
 * Drop only the incoming pick, keeping the vacancy open — FPL's behaviour when
 * you remove a player you just brought in.
 *
 * MUST stay a `.map`. `firstVacancyFor` scans this array in order, and that
 * order is the "first sold, first refilled" contract; rebuilding the entry via
 * filter+concat would move the reopened vacancy to the end of the queue and
 * silently change which slot the next `+` fills.
 */
export function clearReplacementIn(
  pending: readonly PendingTransfer[],
  outId: number,
): PendingTransfer[] {
  return pending.map((p) => (p.outId === outId ? { outId: p.outId, inId: null } : p));
}

/** Which vacancy is this incoming player filling? `null` if he isn't one. */
export function outIdForIncoming(pending: readonly PendingTransfer[], inId: number): number | null {
  return pending.find((p) => p.inId === inId)?.outId ?? null;
}

export interface ReconcileResult {
  pending: PendingTransfer[];
  /** True when anything was dropped or downgraded — drives the "stale" toast. */
  changed: boolean;
}

/**
 * Repair the in-memory draft against the squad the manager actually owns now —
 * another tab can commit a transfer, moving the squad underneath an open
 * draft. Applies the same ownership rules `commit()` enforces, so nothing
 * survives that could only ever 422.
 *
 * A bad *incoming* half downgrades to an open vacancy instead of dropping the
 * whole entry: the manager's "sell X" intent is still perfectly valid, and
 * throwing it away silently undid a deliberate action. That downgrade leaves
 * the array length unchanged, which is exactly why callers must branch on
 * `changed` and never on a length comparison.
 */
export function reconcilePendingBasket(
  pending: readonly PendingTransfer[],
  ownedIds: readonly number[],
): ReconcileResult {
  const ownedSet = new Set(ownedIds);
  const seenOut = new Set<number>();
  const seenIn = new Set<number>();
  const next: PendingTransfer[] = [];
  let changed = false;

  for (const p of pending) {
    // Defensive: the basket is built in-memory now, so a malformed entry
    // shouldn't be reachable — but one bad row must never take the whole
    // basket down with it, and this costs nothing.
    const shapeOk =
      p != null && typeof p.outId === 'number' && (p.inId === null || typeof p.inId === 'number');
    if (!shapeOk) {
      changed = true;
      continue;
    }

    const outPlayer = pBy(p.outId);
    if (!outPlayer || !ownedSet.has(p.outId) || seenOut.has(p.outId)) {
      changed = true;
      continue;
    }
    seenOut.add(p.outId);

    if (p.inId == null) {
      next.push(p);
      continue;
    }

    const inPlayer = pBy(p.inId);
    const inOk =
      inPlayer != null &&
      !ownedSet.has(p.inId) &&
      !seenIn.has(p.inId) &&
      inPlayer.pos === outPlayer.pos;

    if (!inOk) {
      changed = true;
      next.push({ outId: p.outId, inId: null });
      continue;
    }

    seenIn.add(p.inId);
    next.push(p);
  }

  return { pending: next, changed };
}
