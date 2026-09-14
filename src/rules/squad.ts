import { FORMATIONS, MAX_PER_CLUB, SQUAD_COMPOSITION, STARTING_BUDGET_TENTHS } from './constants';
import { isValidXI } from './formation';
import {
  PlayerLookup,
  PositionCode,
  SquadInput,
  SquadInvalidReason,
  SquadValidationError,
  SquadValidationMode,
  SquadValidationResult,
} from './types';

const POSITIONS: PositionCode[] = ['GK', 'DEF', 'MID', 'FWD'];

export interface ValidateSquadOptions {
  /**
   * Skip the ≤100.0m budget check. Use for a lineup-only rearrange of an already-owned squad:
   * the owned set is invariant so budget was enforced at onboarding/transfer time, and live
   * squad value legitimately rises above 100.0m as prices increase (standard FPL behaviour).
   */
  skipBudget?: boolean;
  /**
   * Skip the captain/vice checks (`CAPTAIN_VICE`, `CAPTAIN_NOT_IN_XI`, `VICE_NOT_IN_XI`).
   *
   * For a caller that does not CHOOSE the armbands: the team wizard sends a squad without them
   * and the server derives both from the XI (`rules-engine/armbands.ts`) when it accepts one.
   * `POST /squad/validate` is a pre-flight for exactly that write, so refusing a squad for
   * lacking a decision the caller never makes made the pre-flight refuse what the write accepts
   * — which blocked onboarding outright.
   *
   * Opt-IN, and only `POST /squad/validate` opts in. Every write path leaves it unset and keeps
   * enforcing the armbands, so a path that genuinely forgot to set them still fails loudly.
   */
  skipArmbands?: boolean;
}

/**
 * Validate a squad against the canonical fantasy rules. Pure: returns a structured result
 * (callers map it to HTTP errors). Consolidates the former manager/squad-validation precursor.
 *
 * `final` (default) enforces the exact final-squad rules: 11 XI + 4 bench, no duplicates, a
 * known formation, exact 2/5/5/3 composition, ≤3 per club, total ≤ budget, distinct captain &
 * vice both in the XI, `bench[0]` a GK, and a formation-legal XI. `partial` relaxes the exact
 * requirements to upper bounds only (for in-progress edits). Pass `{ skipBudget: true }` when
 * the squad value isn't being changed (e.g. a lineup rearrange).
 */
export function validateSquad(
  input: SquadInput,
  players: PlayerLookup,
  mode: SquadValidationMode = 'final',
  opts: ValidateSquadOptions = {},
): SquadValidationResult {
  const errors: SquadValidationError[] = [];
  const fail = (code: SquadInvalidReason, message: string): void => {
    errors.push({ code, message });
  };

  const ids = [...input.xi, ...input.bench];
  const isFinal = mode === 'final';

  if (isFinal && (input.xi.length !== 11 || input.bench.length !== 4)) {
    fail('SIZE', 'Squad must have 11 XI and 4 bench');
  }
  if (new Set(ids).size !== ids.length) {
    fail('DUPLICATE', 'Squad has duplicate players');
  }
  if (isFinal && !(FORMATIONS as readonly string[]).includes(input.formation)) {
    fail('FORMATION', `Unknown formation ${input.formation}`);
  }

  const byPosition: Record<PositionCode, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byClub: Record<string, number> = {};
  let spentTenths = 0;
  for (const id of ids) {
    const p = players.get(id);
    if (!p) {
      fail('PLAYER_NOT_FOUND', `Unknown player ${id}`);
      continue;
    }
    byPosition[p.position]++;
    byClub[p.clubId] = (byClub[p.clubId] ?? 0) + 1;
    spentTenths += p.currentPriceTenths;
  }

  for (const pos of POSITIONS) {
    if (isFinal && byPosition[pos] !== SQUAD_COMPOSITION[pos]) {
      fail('COMPOSITION', `Expected ${SQUAD_COMPOSITION[pos]} ${pos}`);
    } else if (!isFinal && byPosition[pos] > SQUAD_COMPOSITION[pos]) {
      fail('COMPOSITION', `Too many ${pos}`);
    }
  }
  for (const [club, n] of Object.entries(byClub)) {
    if (n > MAX_PER_CLUB) fail('CLUB_CAP', `More than ${MAX_PER_CLUB} from ${club}`);
  }
  if (!opts.skipBudget && spentTenths > STARTING_BUDGET_TENTHS) {
    fail('BUDGET', 'Squad exceeds the 100.0m budget');
  }

  if (!opts.skipArmbands && input.captain === input.vice) {
    fail('CAPTAIN_VICE', 'Captain and vice must differ');
  }
  if (isFinal) {
    if (!opts.skipArmbands && !input.xi.includes(input.captain)) {
      fail('CAPTAIN_NOT_IN_XI', 'Captain must be in the XI');
    }
    if (!opts.skipArmbands && !input.xi.includes(input.vice)) {
      fail('VICE_NOT_IN_XI', 'Vice must be in the XI');
    }
    if (players.get(input.bench[0])?.position !== 'GK') {
      fail('BENCH_GK', 'bench[0] must be a goalkeeper');
    }
    if (!isValidXI(input.xi, players)) {
      fail('XI_ILLEGAL', 'Starting XI is not a legal formation');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    spentTenths,
    remainingTenths: STARTING_BUDGET_TENTHS - spentTenths,
    byPosition,
    byClub,
  };
}
