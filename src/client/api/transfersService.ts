import type { ChipKind } from '../data/chips.js';

import type { ChipUsage } from './chipsService.js';
import { apiFetch, ok } from './client.js';
import type { SquadDTO } from './squadService.js';
import type { ApiResponse } from './types.js';
import { asFailure } from './adapters.js';

export interface PendingTransferDTO {
  outId: number;
  inId: number | null;
}

export interface TransferSwap {
  outId: number;
  inId: number;
  /**
   * The prices this swap executed at, per the server's commit response.
   *
   * Optional because a swap the CLIENT builds for a commit request carries neither — the server
   * decides both and sends them back. Every swap read out of `history` has them, and
   * `/app/points/:gw/transfers` prints them, so a swap arriving without one renders a dash rather
   * than a zero: a price of 0.0m is a claim, and "we were not told" is the truth.
   */
  outSellPrice?: number;
  inPurchasePrice?: number;
}

export interface TransferCommit {
  ts: number;
  gw: number;
  swaps: TransferSwap[];
  cost: number;
  chipUsed: ChipKind | null;
  /**
   * The free-transfer balance either side of this commit, frozen by the server at commit time.
   * `before - after` is how many this commit consumed — 0 under Wildcard and Free Hit, which
   * grant unlimited transfers and consume none.
   *
   * The screen used to recover that count by inverting the hit
   * (`swaps.length - cost / HIT_COST`), which needed the hit constant on the client, needed
   * rounding because nothing constrains a summed cost to a multiple of it, and was simply wrong
   * on a chip week: every commit is waived to `cost: 0` there, so the subtraction reported every
   * swap as free.
   *
   * Optional for deploy skew only — the website can reach production ahead of the API release
   * that publishes them.
   */
  freeTransfersBefore?: number;
  freeTransfersAfter?: number;
}

/**
 * Whether a chip can be played right now, and why not when it cannot.
 *
 * The client used to decide this from four local branches — pre-season lock, already-used,
 * one-per-gameweek, one-active. The "already used" one ran over the whole history while the server
 * scopes chip usage to the gameweek's season HALF, so a Wildcard spent in the first stage would
 * have been refused here and allowed there.
 */
export interface ChipAvailability {
  kind: ChipKind;
  playable: boolean;
  /** A stable code: `ACTIVE`, `PRESEASON_LOCKED`, `ALREADY_USED`, `ONE_PER_GW`, `ONE_ACTIVE`, `DEADLINE_PASSED`. */
  reason: string | null;
}

/** Purchase ledger: playerId → price paid. Drives the FPL sell-price rule. */
export type PurchaseLedger = Record<number, number>;

// ── pending basket ─────────────────────────────────────────────
// Client-local draft state — no server analog until commit.

// `getPending`/`savePending` used to persist the basket to localStorage. They
// are gone deliberately: an unconfirmed basket is a draft scoped to the
// Transfers screen, so there is nothing to save and nothing to restore. Only
// committed transfers persist, and those are server state.

export interface TransfersStateDTO {
  freeTransfers: number;
  bank: number;
  history: TransferCommit[];
  /** Wire object keys are strings (as all JSON keys are) — same runtime shape as `PurchaseLedger`, just a type-level formality. */
  purchases: PurchaseLedger;
  activeChip: ChipKind | null;
  chipsUsed: ChipUsage[];
  /**
   * What each owned player would sell for today, keyed by player id, in millions.
   *
   * Server-computed. The FPL rule is "keep half the profit, floored to 0.1m", and applying it
   * needs the purchase price from the ledger AND today's list price; the client used to do that
   * arithmetic itself in `lib/sellPrice.ts`, inventing a purchase price whenever the ledger had no
   * row. These arrive WITH the state rather than per basket edit, which is what keeps the running
   * bank instant while the pricing rule lives on the server.
   *
   * Optional for deploy skew only.
   */
  sellPrices?: Record<number, number>;
  /** Per-chip playability, server-decided. Optional for deploy skew only. */
  chipsAvailable?: ChipAvailability[];
  /**
   * Server-authoritative: is this manager still inside their initial squad-building window, where
   * transfers are unlimited and free? Never derive it on the client — this used to be guessed
   * from global gameweek state ("has any deadline passed"), which is a different question and
   * quoted every mid-season joiner a -4 the server was never going to charge.
   */
  preSeason: boolean;
  /** The gameweek that was current when this manager signed up; null for legacy accounts. */
  firstEligibleGw: number | null;
}

/** `GET /transfers/state` — bank, free transfers, ledger, history, chip state in one call. */
export async function getState(): Promise<ApiResponse<TransfersStateDTO>> {
  return apiFetch<TransfersStateDTO>('/transfers/state');
}

export interface CommitResult {
  commit: TransferCommit;
  squad: SquadDTO;
  freeTransfers: number;
  bank: number;
}

/** `POST /transfers/commit` — `idempotencyKey` lets a dropped-response retry replay safely instead of double-charging. */
export async function commitSwaps(
  swaps: { outId: number; inId: number }[],
  idempotencyKey: string,
): Promise<ApiResponse<CommitResult>> {
  return apiFetch<CommitResult>('/transfers/commit', {
    method: 'POST',
    body: { swaps },
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

// ── preview + auto-pick (server-decided) ───────────────────────

/** One basket entry as the server takes it: `inId` absent means the vacancy is still open. */
export interface PreviewEntry {
  outId: number;
  inId?: number;
}

/** A rule the server says this basket breaks. `code` is stable; map it, never print it raw. */
export interface TransferRuleError {
  code: string;
  message: string;
}

/** `POST /transfers/preview` — what a basket would cost, decided by the server, written nowhere. */
export interface TransferPreview {
  gw: number;
  bank: number;
  cost: number;
  freeTransfersBefore: number;
  freeTransfersAfter: number;
  sellPrices: Record<number, number>;
  openVacancies: number;
  /** "Could be committed right now." An empty basket is `false` — there is nothing to commit. */
  valid: boolean;
  errors: TransferRuleError[];
}

/**
 * Quote a basket without committing it.
 *
 * Runs the SAME evaluator `POST /transfers/commit` runs, so a manager cannot be shown one number
 * and charged another. Called at Confirm, never on every basket edit: the running bank comes off
 * the `sellPrices` that arrive with `getState`, so an edit costs no request at all.
 */
export async function previewSwaps(swaps: PreviewEntry[]): Promise<ApiResponse<TransferPreview>> {
  const res = await apiFetch<TransferPreview>('/transfers/preview', { method: 'POST', body: { swaps } });
  if (!res.success || !res.data) return asFailure<TransferPreview>(res);
  return ok(res.data);
}

/**
 * `POST /transfers/auto-pick` — fill the basket's open vacancies.
 *
 * Entries that already name an `inId` are left alone. The money is the server's (bank plus the
 * proceeds of everything being sold), and the `O(vacancies² × market)` reserve scan that used to
 * run in the browser runs where the roster already lives.
 */
export async function autoPickSwaps(
  pending: PreviewEntry[],
): Promise<ApiResponse<{ picks: { outId: number; inId: number }[] }>> {
  const res = await apiFetch<{ picks: { outId: number; inId: number }[] }>('/transfers/auto-pick', {
    method: 'POST',
    body: { pending },
  });
  if (!res.success || !res.data) return asFailure<{ picks: { outId: number; inId: number }[] }>(res);
  return ok(res.data);
}
