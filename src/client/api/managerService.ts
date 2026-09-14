import type { Squad } from '../data/initialSquad.js';

import { apiFetch, ok } from './client.js';
import type { ApiResponse } from './types.js';

export interface ManagerProfile {
  name: string;
  teamName: string;
  favoriteClub: string | null;
  avatarSeed: number;
  createdAt: number;
  /**
   * Server-authoritative "the team-creation wizard has been completed"
   * (`ManagerProfile.onboardingCompletedAt !== null`). This is the ONLY
   * correct source for that question — squad presence says nothing, since
   * every signup is provisioned a full default squad. See `stores/teamWizard`.
   */
  onboardingCompleted: boolean;
}

// Empty on purpose: the onboarding capture form must open with placeholders,
// not filler values the user has to notice and delete ("أنا"/"فريقي" shipped
// as real names before). UI surfaces render their own fallback when empty.
export function getDefaultProfile(_lang: 'ar' | 'en' = 'ar'): ManagerProfile {
  return {
    name: '',
    teamName: '',
    favoriteClub: null,
    avatarSeed: 1,
    createdAt: 0,
    // Safe default: a profile we haven't loaded yet must not read as
    // "onboarded" — that would let an un-onboarded manager past the gate.
    onboardingCompleted: false,
  };
}

export async function getProfile(): Promise<ApiResponse<ManagerProfile>> {
  return apiFetch<ManagerProfile>('/manager/profile');
}

export async function updateProfile(patch: Partial<ManagerProfile>): Promise<ApiResponse<ManagerProfile>> {
  // Explicit whitelist: the server's ValidationPipe is `forbidNonWhitelisted`,
  // so forwarding a raw patch (which may carry `createdAt`) would 400.
  const body: Partial<Pick<ManagerProfile, 'name' | 'teamName' | 'favoriteClub' | 'avatarSeed'>> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.teamName !== undefined) body.teamName = patch.teamName;
  if (patch.favoriteClub !== undefined) body.favoriteClub = patch.favoriteClub;
  if (patch.avatarSeed !== undefined) body.avatarSeed = patch.avatarSeed;
  return apiFetch<ManagerProfile>('/manager/profile', { method: 'PATCH', body });
}

export interface OnboardingSquadInput {
  xi: number[];
  bench: number[];
  /**
   * The armbands, OMITTED by the wizard.
   *
   * They set the scoring multiplier, and FPL's squad selection has no armband step — they appear
   * already assigned. The client used to rank the XI itself (`lib/autoCaptain.ts`) and POST the
   * result; the server does that now and this is left unset, so there is one ranking rather than
   * a browser's and a server's. Still accepted, and still validated, for any caller that has a
   * real choice to send.
   */
  captain?: number;
  vice?: number;
  formation: string;
}

export interface CompleteOnboardingInput {
  teamName: string;
  favoriteClub?: string;
  squad: OnboardingSquadInput;
}

/**
 * `POST /manager/onboarding/complete` — profile + squad in one call, the
 * team-wizard finish path (see `useTeamWizardBuilder.ts`'s `finishLive`).
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput,
): Promise<ApiResponse<{ profile: ManagerProfile; squad: Squad }>> {
  return apiFetch('/manager/onboarding/complete', { method: 'POST', body: { ...input } });
}
