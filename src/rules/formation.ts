import { XI_RULES, XI_SIZE } from './constants';
import { PlayerLookup, PositionCode } from './types';

/** Count squad members by position. Unknown ids are skipped (validate them separately). */
export function countByPosition(
  ids: number[],
  players: PlayerLookup,
): Record<PositionCode, number> {
  const counts: Record<PositionCode, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of ids) {
    const p = players.get(id);
    if (p) counts[p.position]++;
  }
  return counts;
}

/**
 * Whether a starting XI is formation-legal: exactly 11 known players satisfying XI_RULES
 * (1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD). Mirrors FEL_APP/src/utils/squadSwap.isValidXI and is
 * the legality gate auto-subs use when deciding a substitution.
 */
export function isValidXI(xi: number[], players: PlayerLookup): boolean {
  if (xi.length !== XI_SIZE) return false;
  const counts: Record<PositionCode, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of xi) {
    const p = players.get(id);
    if (!p) return false;
    counts[p.position]++;
  }
  for (const pos of Object.keys(XI_RULES) as PositionCode[]) {
    const { min, max } = XI_RULES[pos];
    if (counts[pos] < min || counts[pos] > max) return false;
  }
  return true;
}
