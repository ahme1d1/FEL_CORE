import type { PositionCode } from '../data/positions.js';
import { pBy, type Player } from '../api/referenceCache.js';
import { rules } from '../api/rulesCache.js';
import { isValidXI } from './squadSwap.js';

/**
 * The squad rules, served by the API.
 *
 * These four used to be literals here — `BUDGET_CAP = 100.0`, a 2/5/5/3 table, `MAX_PER_CLUB = 3`,
 * `TOTAL_SQUAD_SIZE = 15` — each a hand copy of a constant in `FEL_API`'s rules engine, with
 * nothing anywhere comparing the two. They arrive on `GET /bootstrap` now and cost no request.
 *
 * Thin accessors rather than re-exported values, because `rules()` is only safe once the app-zone
 * gate has opened and a module-level `const` would read it at import time.
 */
export const budgetCap = (): number => rules().budget;
export const positionCaps = (): Record<PositionCode, number> => rules().composition;
export const maxPerClub = (): number => rules().maxPerClub;
export const totalSquadSize = (): number => rules().squadSize;

/**
 * Every key `validateSquad`/`canPick` can put on a `RuleError`.
 *
 * Written out rather than imported from the dictionaries: this package cannot reach them, and
 * `string` would drop the guarantee that each one exists. Because `RuleError.key` is typed by this
 * union, every inline `key: '…'` below is checked against it — a typo is a compile error, and a new
 * message has to be named here first. `FEL_WEBSITE` proves the union is a subset of its `Key`.
 */
export type SquadRuleErrorKey =
  | 'rules.unknownPlayer'
  | 'rules.alreadyPicked'
  | 'rules.overBudget'
  | 'rules.exactSize'
  | 'rules.overSize'
  | 'rules.exactPosCount'
  | 'rules.overPosCap'
  | 'rules.overClubCap'
  | 'rules.captainVice'
  | 'rules.captainInSquad'
  | 'rules.viceInSquad'
  | 'rules.illegalFormation'
  | 'rules.squadFull'
  | 'errors.actionFailed';

export interface RuleError {
  key: SquadRuleErrorKey;
  args?: Record<string, string | number>;
}

export interface SquadValidation {
  valid: boolean;
  errors: RuleError[];
  spent: number;
  remaining: number;
  byPos: Record<PositionCode, number>;
  byClub: Record<string, number>;
}

export type SquadValidationMode = 'partial' | 'final';

export interface ValidateSquadOptions {
  /**
   * Skip the ≤£100.0m budget check. Mirrors FEL_API's rules-engine `skipBudget`
   * option, used for a lineup-only rearrange of an already-owned squad (budget
   * was enforced at pick/transfer time; live value can legitimately rise above
   * the cap as prices change). Defaults to `false` — no existing call site
   * passes this yet, so behavior is unchanged until one opts in.
   */
  skipBudget?: boolean;
  /**
   * Restrict `captain`/`vice` validity to this starting-XI id set instead of
   * "anywhere in the 15" — a benched player can never captain a real FPL
   * squad. Omit to fall back to squad-wide membership (unchanged behavior for
   * existing callers).
   *
   * In `final` mode it also gates the FORMATION check: the server rejects an XI that is not a
   * legal shape (`isValidXI`), and this client used to have no equivalent at all — the squad
   * screen covered it through `canSwap`, while the wizard's final check did not, so a wizard
   * squad could be confirmed and then refused on save.
   */
  xiIds?: Set<number>;
}

/** The four positions, as a fixed list — see the composition loop in `validateSquad`. */
const POSITIONS: PositionCode[] = ['GK', 'DEF', 'MID', 'FWD'];

/** Round to 0.1m to keep money math free of float drift (mirrors transferEligibility.ts). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function validateSquad(
  playerIds: number[],
  captain?: number,
  vice?: number,
  mode: SquadValidationMode = 'partial',
  opts: ValidateSquadOptions = {}
): SquadValidation {
  const errors: RuleError[] = [];
  const seen = new Set<number>();
  const duplicateIds = new Set<number>();
  const players: Player[] = [];

  for (const id of playerIds) {
    if (seen.has(id)) {
      duplicateIds.add(id);
      continue;
    }
    seen.add(id);
    const player = pBy(id);
    if (player) players.push(player);
    else errors.push({ key: 'rules.unknownPlayer' });
  }

  if (duplicateIds.size > 0) errors.push({ key: 'rules.alreadyPicked' });

  const budget = budgetCap();
  const spent = round1(players.reduce((sum, p) => sum + p.price, 0));
  const remaining = round1(budget - spent);

  const byPos: Record<PositionCode, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byClub: Record<string, number> = {};
  for (const p of players) {
    byPos[p.pos]++;
    byClub[p.club] = (byClub[p.club] ?? 0) + 1;
  }

  const caps = positionCaps();
  const size = totalSquadSize();
  const clubCap = maxPerClub();

  if (!opts.skipBudget && spent > budget) errors.push({ key: 'rules.overBudget' });
  if (mode === 'final' && playerIds.length !== size) {
    errors.push({ key: 'rules.exactSize', args: { n: size } });
  } else if (playerIds.length > size) {
    errors.push({ key: 'rules.overSize' });
  }

  // The literal four, never `Object.keys(caps)`. A position missing from the served composition
  // would silently drop both the over-cap check AND the exact-count check for it, so a squad with
  // no goalkeeper would pass `final` — the server's own serializer spec calls out this exact
  // failure mode. An absent cap is an error here, not permission.
  for (const pos of POSITIONS) {
    if (caps[pos] === undefined) {
      // `errors.actionFailed`, not `rules.unknownPlayer`: the squad is fine — the COMPOSITION the
      // server published is missing a position, so we cannot judge it. Naming a player that does
      // not exist sent the reader looking for a fault in their own team. The severity is the part
      // that matters and is unchanged: an absent cap is an error, never permission.
      errors.push({ key: 'errors.actionFailed' });
      continue;
    }
    if (mode === 'final' && byPos[pos] !== caps[pos]) {
      errors.push({ key: 'rules.exactPosCount', args: { pos, n: caps[pos] } });
    } else if (byPos[pos] > caps[pos]) {
      errors.push({ key: 'rules.overPosCap', args: { pos } });
    }
  }

  for (const [club, count] of Object.entries(byClub)) {
    if (count > clubCap) {
      errors.push({ key: 'rules.overClubCap', args: { n: clubCap, club } });
    }
  }

  if (captain !== undefined && vice !== undefined && captain === vice) {
    errors.push({ key: 'rules.captainVice' });
  }
  if (mode === 'final') {
    // Armbands are only judged when the caller CHOSE them. The wizard no longer does — the server
    // assigns captain and vice from the XI (`rules-engine/armbands.ts`) — so demanding them here
    // would block Confirm on something this client does not decide. A caller that does pass one
    // still gets both rules; passing neither says "the server will pick", which it will.
    const eligible = (id: number | undefined): boolean =>
      id !== undefined && (opts.xiIds ? opts.xiIds.has(id) : seen.has(id));
    if (captain !== undefined && !eligible(captain)) {
      errors.push({ key: 'rules.captainInSquad' });
    }
    if (vice !== undefined && !eligible(vice)) {
      errors.push({ key: 'rules.viceInSquad' });
    }
    // The two rules the server enforces and this file used to omit entirely, so its `final`
    // answer was a strict subset of the server's — a squad could pass here and be refused on save.
    if (opts.xiIds && !isValidXI([...opts.xiIds])) {
      errors.push({ key: 'rules.illegalFormation' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    spent,
    remaining,
    byPos,
    byClub,
  };
}

/**
 * Can `candidateId` join `current`? `opts` is forwarded to `validateSquad`, so
 * a caller with its own funds gate can waive the static budget check while
 * keeping size/position/club/duplicate rules — see `skipBudget` above.
 */
export function canPick(
  current: number[],
  candidateId: number,
  opts: ValidateSquadOptions = {}
): { ok: true } | { ok: false; reason: RuleError } {
  const candidate = pBy(candidateId);
  if (!candidate) return { ok: false, reason: { key: 'rules.unknownPlayer' } };
  if (current.includes(candidateId)) return { ok: false, reason: { key: 'rules.alreadyPicked' } };
  // At a complete squad, every row would otherwise be labelled "Squad has too
  // many players" — the 16-id probe below trips `rules.overSize`. The squad
  // isn't over-size, it's full, and that's what the row should say (QA-19).
  if (current.length >= totalSquadSize()) return { ok: false, reason: { key: 'rules.squadFull' } };

  const next = [...current, candidateId];
  const v = validateSquad(next, undefined, undefined, 'partial', opts);
  if (!v.valid) return { ok: false, reason: v.errors[0] };
  return { ok: true };
}

/**
 * Translate a RuleError into a user-facing string using a translator and the
 * error's args. The translator should be `useT()` from LanguageContext.
 */
export function formatRuleError(
  err: RuleError,
  translate: (key: SquadRuleErrorKey) => string
): string {
  let out = translate(err.key);
  if (err.args) {
    for (const [k, v] of Object.entries(err.args)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}
