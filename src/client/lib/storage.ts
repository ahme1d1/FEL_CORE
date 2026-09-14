import { getApiClientConfig } from '../platform/config.js';

/**
 * Key/value persistence, best-effort by contract.
 *
 * Ported from `FEL_WEBSITE/app/lib/storage.ts` — itself a web port of `FEL_APP`'s AsyncStorage util,
 * with the signatures kept `async` so the sixteen services that `await` every call would not have to
 * change when the backing store did. Only `safeLocalStorage()` moved out, into the host's
 * `StorageAdapter`.
 *
 * Every function swallows. Persistence here holds drafts, a credential and two device preferences —
 * never a fact the API owns — so a sandboxed iframe, a full quota or an absent `window` must degrade
 * to null/no-op rather than take a render down with it.
 */

export async function getItem(key: string): Promise<string | null> {
  try {
    return (await getApiClientConfig().storage.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await getApiClientConfig().storage.setItem(key, value);
  } catch {
    // swallow — persistence is best-effort in this app
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await getApiClientConfig().storage.removeItem(key);
  } catch {
    // swallow
  }
}

/**
 * Everything the client is allowed to persist. Deliberately short: the API owns every fact about an
 * account, so this registry holds only DRAFTS (work the user has started but not submitted), the
 * session CREDENTIAL itself, and DEVICE PREFERENCES the server does not model.
 *
 * Nothing here may be used to make a routing decision. `fel_onb` was — a device flag standing in for
 * `profile.onboardingCompleted` — and that mismatch is what let a signed-out visitor be routed into
 * the onboarding funnel instead of a login form. It is gone, along with twenty keys left over from
 * the retired mock/localStorage service layer and two that shadowed server-owned data
 * (`fel_manager_profile`, `fel_notifications`).
 */
export const STORAGE_KEYS = {
  /**
   * The onboarding capture step's name/teamName/favoriteClub. A DRAFT, not a decision: it records
   * which half of onboarding this device already filled in, so the gate can send a half-finished
   * manager to the wizard rather than back through capture.
   */
  ONBOARDING_CAPTURE: 'fel_onb_capture',
  /** In-progress team-wizard picks; the server has no draft endpoint. Cleared on commit. */
  WIZARD_DRAFT: 'fel_wizard_draft',

  // Live API session — the credential itself, which by definition lives here.
  ACCESS_TOKEN: 'fel_access_token',
  REFRESH_TOKEN: 'fel_refresh_token',

  /**
   * Client-generated so a reload mid-commit retries with the same key instead of double-charging.
   * The server consumes it; it does not hand one out.
   */
  TRANSFERS_IDEMPOTENCY_KEY: 'fel_transfers_idempotency_key',

  // Device preferences. Verified absent from FEL_API's schema — there is no settings model and no
  // persisted locale, so these have no server owner.
  LANGUAGE: 'fel_language',
  TWEAKS: 'fel_tweaks',
} as const;

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  try {
    await setItem(key, JSON.stringify(value));
  } catch {
    // swallow
  }
}

/**
 * `localStorage` is sync, so the app's `multiSet` atomicity concern disappears and this stays a
 * plain loop. An async adapter (AsyncStorage) keeps the same contract: best-effort, never throws.
 */
export async function setManyJSON(
  entries: ReadonlyArray<readonly [string, unknown]>,
): Promise<void> {
  try {
    for (const [k, v] of entries) {
      await setJSON(k, v);
    }
  } catch {
    // swallow — persistence is best-effort
  }
}
