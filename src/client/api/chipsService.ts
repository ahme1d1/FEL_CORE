import type { ChipKind } from '../data/chips.js';

import { apiFetch } from './client.js';
import type { ApiResponse } from './types.js';
import type { ChipAvailability } from './transfersService.js';

/**
 * Chip logic, split out of `transfersService.ts` to mirror FEL_API's own
 * module boundary (`chips.controller.ts`/`chips.service.ts` are separate
 * from `transfers.service.ts` there too).
 */

export interface ChipUsage {
  chip: ChipKind;
  gw: number;
  ts: number;
}

/** FEL_API's `ChipStateView` (`GET /chips/state`, and the response shape of activate/cancel too). */
export interface ChipsStateDTO {
  activeChip: ChipKind | null;
  chipsUsed: ChipUsage[];
  canCancelActiveChip: boolean;
  /**
   * Whether each chip can be played right now, and why not when it cannot — server-decided.
   *
   * Optional for deploy skew only. With it absent the client attempts the activation and lets the
   * server refuse; it must never fall back to deciding for itself, because its own version of
   * "already used" ignored the season half and would refuse a chip the server grants.
   */
  chipsAvailable?: ChipAvailability[];
}

/** `GET /chips/state` */
export async function getChipsState(): Promise<ApiResponse<ChipsStateDTO>> {
  return apiFetch<ChipsStateDTO>('/chips/state');
}

/** `POST /chips/:kind/activate` — `kind` sent lowercase; server accepts either case but every response is lowercase. */
export async function activateChip(kind: ChipKind, gw: number): Promise<ApiResponse<ChipsStateDTO>> {
  return apiFetch<ChipsStateDTO>(`/chips/${kind}/activate`, { method: 'POST', body: { gw } });
}

/** `DELETE /chips/active` */
export async function cancelActiveChip(): Promise<ApiResponse<ChipsStateDTO>> {
  return apiFetch<ChipsStateDTO>('/chips/active', { method: 'DELETE' });
}
