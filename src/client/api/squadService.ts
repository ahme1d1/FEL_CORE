import type { FormationId, Squad } from '../data/initialSquad.js';

import { asFailure } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

/** FEL_API's `ClientSquadView`/`PutSquadDto` wire shape (`GET/PUT /squad`). */
export interface SquadDTO {
  xi: number[];
  bench: number[];
  /** Non-null for any account past onboarding — every signup server-provisions a full squad with an armband set. */
  captain: number | null;
  vice: number | null;
  formation: string;
  updatedAt?: string;
}

/** A captain/vice-less squad is a broken server state (shouldn't happen post-onboarding) — surface it as a failure rather than fabricate an armband. */
function toSquad(dto: SquadDTO): ApiResponse<Squad> {
  if (dto.captain == null || dto.vice == null) {
    return { success: false, data: null, error: 'Squad is missing captain/vice.' };
  }
  return ok({
    xi: dto.xi,
    bench: dto.bench,
    captain: dto.captain,
    vice: dto.vice,
    formation: dto.formation as FormationId,
  });
}

function fromSquad(squad: Squad): SquadDTO {
  return { xi: squad.xi, bench: squad.bench, captain: squad.captain, vice: squad.vice, formation: squad.formation };
}

/** `GET /squad` */
export async function getSquad(): Promise<ApiResponse<Squad>> {
  const res = await apiFetch<SquadDTO>('/squad');
  if (!res.success || !res.data) return asFailure<Squad>(res);
  return toSquad(res.data);
}

/** `PUT /squad` — lineup-only rearrange; cannot add/remove players (server enforces same-15 ownership). */
export async function saveSquad(squad: Squad): Promise<ApiResponse<Squad>> {
  const res = await apiFetch<SquadDTO>('/squad', { method: 'PUT', body: { ...fromSquad(squad) } });
  if (!res.success || !res.data) return asFailure<Squad>(res);
  return toSquad(res.data);
}

// ── validate + auto-pick (server-decided) ──────────────────────

/** A rule the server says a squad breaks. `code` is stable (`BUDGET`, `CLUB_CAP`, …). */
export interface SquadRuleError {
  code: string;
  message: string;
}

/** `POST /squad/validate` — every rule a squad breaks, not just the first. */
export interface SquadValidation {
  valid: boolean;
  errors: SquadRuleError[];
  spent: number;
  remaining: number;
  byPosition: Record<string, number>;
  byClub: Record<string, number>;
}

export interface ValidateSquadInput {
  playerIds: number[];
  xiIds?: number[];
  benchIds?: number[];
  captain?: number;
  vice?: number;
  mode?: 'partial' | 'final';
}

/**
 * Ask the server what is wrong with a squad, without saving it.
 *
 * The authority at Confirm — `useTeamWizardBuilder.finish()` calls it before submitting. The
 * wizard still evaluates locally on every pick, because that has to be instant, but what it
 * evaluates against are the server's own published rules and this is what has the last word.
 *
 * Returns EVERY broken rule, not just the first: `POST /manager/onboarding/complete` throws on the
 * earliest failure, which is right for a write and useless for telling someone what to fix.
 */
export async function validateSquad(input: ValidateSquadInput): Promise<ApiResponse<SquadValidation>> {
  const res = await apiFetch<SquadValidation>('/squad/validate', { method: 'POST', body: { ...input } });
  if (!res.success || !res.data) return asFailure<SquadValidation>(res);
  return ok(res.data);
}

/**
 * `POST /squad/auto-pick` — complete a squad from whatever is already placed.
 *
 * All-or-nothing: a refusal means no legal squad fits the remaining budget, and nothing should
 * change. The heuristic (top-K draw, form weighted against season total, cheapest-reserve
 * lookahead) lives in the server's rules engine now — it used to be written twice on the client,
 * once for the wizard and once for the transfers basket.
 */
export async function autoPickSquad(keep: number[]): Promise<ApiResponse<{ playerIds: number[] }>> {
  const res = await apiFetch<{ playerIds: number[] }>('/squad/auto-pick', { method: 'POST', body: { keep } });
  if (!res.success || !res.data) return asFailure<{ playerIds: number[] }>(res);
  return ok(res.data);
}
