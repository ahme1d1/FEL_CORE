import type { ChipKind } from '../data/chips.js';
import type { FormationId, Squad } from '../data/initialSquad.js';

import { asFailure } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

/**
 * The lineup a manager had locked in for a gameweek, frozen at the deadline.
 * Scoring a locked/live/finished GW reads this instead of the live (editing)
 * squad — which is what makes plan-ahead dual-track and stable past-GW points
 * possible (see scoringService `resolveSquadForGW`).
 */
export interface GWSquadSnapshot {
  gw: number;
  squad: Squad;
  /** Chip that was active when the GW locked (drives tc/bb scoring). */
  chip: ChipKind | null;
  ts: number;
}

export type SnapshotMap = Record<number, GWSquadSnapshot>;

/** FEL_API's `ClientSnapshot` (`GET /squad/snapshots/:gw`) — no timestamp on the wire; nothing local reads `GWSquadSnapshot.ts` for logic, so it's stamped at read time. */
interface SnapshotDTO {
  xi: number[];
  bench: number[];
  captain: number;
  vice: number;
  formation: string;
  chip: ChipKind | null;
}

/**
 * Single-GW read — the only shape FEL_API actually exposes
 * (`GET /squad/snapshots/:gw`, confirmed in FEL_API's `squad.controller.ts`).
 * There is no bulk-list endpoint, so callers must fetch/cache per gameweek
 * (see `squadStore`'s in-memory cache) rather than requesting the whole map
 * in one call. A 404 (`NOT_FOUND`) means the GW hasn't locked yet — a normal
 * "no snapshot" result, not a failure.
 */
export async function getSnapshot(gw: number): Promise<ApiResponse<GWSquadSnapshot | null>> {
  const res = await apiFetch<SnapshotDTO>(`/squad/snapshots/${gw}`);
  if (!res.success || !res.data) {
    if (res.code === 'NOT_FOUND') return ok(null);
    return asFailure<GWSquadSnapshot | null>(res);
  }
  const dto = res.data;
  return ok<GWSquadSnapshot | null>({
    gw,
    squad: {
      xi: dto.xi,
      bench: dto.bench,
      captain: dto.captain,
      vice: dto.vice,
      formation: dto.formation as FormationId,
    },
    chip: dto.chip,
    ts: Date.now(),
  });
}
