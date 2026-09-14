/**
 * Pure helpers shared by the Squad pitch, bench and list views. Ports the
 * per-position grouping + sub-mode highlight logic out of FEL_APP's
 * `SquadScreen.tsx` (PitchView / PitchPlayer) so the Vue components stay thin.
 */
import type { PositionCode } from '../data/positions.js';
import { clubBy, type Player } from '../api/referenceCache.js';

/** Sub-mode visual state of a slot while a substitution source is picked. */
export type SlotState = 'none' | 'source' | 'target' | 'dim';

/** GK → FWD grouping of the starting XI (the pitch renders from live counts). */
export function groupXIByPosition(xi: Player[]): Record<PositionCode, Player[]> {
  return {
    GK: xi.filter((p) => p.pos === 'GK'),
    DEF: xi.filter((p) => p.pos === 'DEF'),
    MID: xi.filter((p) => p.pos === 'MID'),
    FWD: xi.filter((p) => p.pos === 'FWD'),
  };
}

/** Live formation label (e.g. "4-4-2") derived from the XI, not the stored id. */
export function formationLabel(xi: Player[]): string {
  const g = groupXIByPosition(xi);
  return `${g.DEF.length}-${g.MID.length}-${g.FWD.length}`;
}

/** Which highlight a slot gets: source, valid target, dimmed, or none. */
export function slotState(
  id: number,
  subSource: number | null,
  validTargets: Set<number>,
): SlotState {
  if (subSource == null) return 'none';
  if (id === subSource) return 'source';
  if (validTargets.has(id)) return 'target';
  return 'dim';
}

/**
 * Inline highlight style for a slot (border + fill). Mirrors the RN colors:
 * source → club color @ 20%, target → pos-green @ 30%. `dim` only sets opacity
 * (via a CSS class), so it returns no inline style here.
 */
export function slotStyle(player: Player, state: SlotState): Record<string, string> {
  if (state === 'source') {
    const clubColor = clubBy(player.club)?.color ?? '#888888';
    return { borderColor: clubColor, background: `${clubColor}33`, borderWidth: '2px' };
  }
  if (state === 'target') {
    return {
      borderColor: 'var(--pos-green)',
      background: 'rgba(107, 227, 157, 0.30)',
      borderWidth: '2px',
    };
  }
  return {};
}
