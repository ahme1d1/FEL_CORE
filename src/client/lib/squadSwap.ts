import type { FormationId, Squad } from '../data/initialSquad.js';
import type { PositionCode } from '../data/positions.js';
import { pBy, type Player } from '../api/referenceCache.js';
import { rules } from '../api/rulesCache.js';
import { formationLabel } from './squadLayout.js';

export interface MeasuredSlot {
  playerId: number;
  pos: PositionCode;
  group: 'xi' | 'bench';
  cx: number;
  cy: number;
}

/**
 * Inclusive bounds for the starting XI.
 *
 * Served by the API (`rules().xiRules`) rather than written here. They used to be a local table
 * beside a comment calling them "standard FPL rules", byte-identical to `XI_RULES` in
 * `FEL_API`'s rules engine and kept that way by nobody.
 */
export function xiRules(): Record<PositionCode, { min: number; max: number }> {
  return rules().xiRules;
}

export function isValidXI(xi: number[]): boolean {
  const r = rules();
  if (xi.length !== r.xiSize) return false;
  const counts: Record<PositionCode, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of xi) {
    const p = pBy(id);
    if (!p) return false;
    counts[p.pos]++;
  }
  for (const pos of Object.keys(r.xiRules) as PositionCode[]) {
    const { min, max } = r.xiRules[pos];
    if (counts[pos] < min || counts[pos] > max) return false;
  }
  return true;
}

/**
 * Decide whether `aId` can swap with `bId` inside `squad`. The single owner of
 * substitution legality — every input path (click, and drag while it is
 * enabled) routes through here, so they cannot diverge. FPL rules:
 * - GK only swaps with GK (keeps 1 GK in XI + 1 reserve on bench[0]).
 * - Two starters never swap: FPL has no within-XI reorder.
 * - Within-bench swaps are allowed between any outfielders (bench order sets
 *   auto-sub priority).
 * - Cross-group swaps require the resulting XI to satisfy the served XI bounds.
 */
export function canSwap(squad: Squad, aId: number, bId: number): boolean {
  if (aId === bId) return false;
  const a = pBy(aId);
  const b = pBy(bId);
  if (!a || !b) return false;

  const aInXI = squad.xi.includes(aId);
  const bInXI = squad.xi.includes(bId);
  const aInBench = squad.bench.includes(aId);
  const bInBench = squad.bench.includes(bId);
  if (!(aInXI || aInBench) || !(bInXI || bInBench)) return false;

  if (a.pos === 'GK' || b.pos === 'GK') {
    return a.pos === 'GK' && b.pos === 'GK';
  }

  // Pitch rows are derived from position (`groupXIByPosition`), so a same-row
  // reorder only ever traded two cards on screen — it changed no formation, no
  // scoring and no auto-sub order. Real FPL offers no such move, and it was
  // reachable by drag only, which is what made drag and click disagree.
  if (aInXI && bInXI) return false;

  if (aInBench && bInBench) {
    return true;
  }

  const next = swapPlayers(squad, aId, bId);
  return isValidXI(next.xi);
}

/**
 * Swap two players inside a squad. Captain and vice are bound to the XI slot,
 * not the player — if a cross-group swap moves the captain (or vice) to the
 * bench, the armband transfers to the player coming into XI. Bench players
 * can never hold captain/vice.
 */
export function swapPlayers(squad: Squad, aId: number, bId: number): Squad {
  if (aId === bId) return squad;
  const replace = (arr: number[]) =>
    arr.map((id) => (id === aId ? bId : id === bId ? aId : id));
  const xi = replace(squad.xi);
  const bench = replace(squad.bench);

  const inXI = new Set(xi);
  const transferArmband = (id: number): number => {
    if (inXI.has(id)) return id;
    if (id === aId) return bId;
    if (id === bId) return aId;
    return id;
  };

  // A cross-group swap can change the DEF/MID/FWD split, so the formation
  // label must be re-derived from the new XI rather than carried over stale.
  const xiPlayers = xi.map(pBy).filter((p): p is Player => p != null);
  const formation = formationLabel(xiPlayers) as FormationId;

  return {
    ...squad,
    xi,
    bench,
    captain: transferArmband(squad.captain),
    vice: transferArmband(squad.vice),
    formation,
  };
}

/**
 * Find the nearest measured slot to the given screen point, ignoring the
 * dragged player itself. Validity of the swap is the caller's concern
 * (see `canSwap`) — this returns purely the geometric nearest neighbour.
 */
export function nearestSlot(
  slots: Iterable<MeasuredSlot>,
  point: { x: number; y: number },
  selfId: number
): MeasuredSlot | null {
  let best: MeasuredSlot | null = null;
  let bestDist = Infinity;
  for (const slot of slots) {
    if (slot.playerId === selfId) continue;
    const dx = slot.cx - point.x;
    const dy = slot.cy - point.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      best = slot;
    }
  }
  return best;
}

export function posOf(playerId: number): PositionCode | null {
  const p = pBy(playerId);
  return p ? p.pos : null;
}
