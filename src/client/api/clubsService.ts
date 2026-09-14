import type { Club, Kit } from '../data/clubs.js';

import { toEmblemId } from './adapters.js';
import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

/**
 * FEL_API's `ClientClub` (`GET /clubs`) — field-for-field identical to the
 * website's local `Club`. `crestUrl`/`shirtUrl` are root-relative paths into
 * the API's static assets mount (resolve via `assetUrl()` from `./config`).
 * `emblem` is validated through `toEmblemId` as a contract-drift guard even
 * though the value already matches the local `EmblemId` union byte-for-byte
 * today.
 */
export interface ClubDTO {
  id: string;
  name: string;
  short: string;
  nameEn: string;
  shortEn: string;
  color: string;
  ink: string;
  stroke?: string;
  kit: Kit;
  emblem: string;
  city: string;
  cityEn: string;
  venue: string;
  venueEn: string;
  crestUrl: string;
  shirtUrl: string;
}

/** Exported so `fixturesService` can map the clubs `GET /fixtures` now embeds through one mapper. */
export function mapClub(dto: ClubDTO): Club {
  return { ...dto, emblem: toEmblemId(dto.emblem) };
}

/**
 * `GET /clubs` — near-static, cached 300s server-side (in step with `/players`,
 * so the two halves of the reference set never disagree about which club a
 * player belongs to). `crestUrl`/`shirtUrl` carry a `?v=` content hash, which
 * is how a re-drawn crest or kit reaches a browser holding the old one; the
 * 300s is therefore also the ceiling on how long that takes.
 */
export async function getClubs(): Promise<ApiResponse<Club[]>> {
  const res = await apiFetch<ClubDTO[]>('/clubs');
  if (!res.success || !res.data) return { success: false, data: null, error: res.error, code: res.code };
  try {
    return ok(res.data.map(mapClub));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown club data from API';
    return { success: false, data: null, error: message };
  }
}
