import { getCurrentLang, type Lang } from '../lib/fmt.js';

import { CORE_AR } from './ar.js';
import { CORE_EN, type CoreKey } from './en.js';

/**
 * The non-hook translate, for callbacks outside a component's setup — store actions and service
 * pipelines, where there is no `useI18n()` to reach for. Components should use their framework's
 * own `t()`, which is reactive; this one reads a module-level `let` in `lib/fmt` that the host keeps
 * in sync (`FEL_WEBSITE/app/app.vue` watches vue-i18n's locale and calls `setCurrentLang`).
 *
 * Ported from `FEL_APP`'s `src/i18n/index.ts` via `FEL_WEBSITE/app/lib/translate.ts`, which stayed
 * behind in step 28a for one reason — it was the only module that VALUE-imported both dictionaries,
 * and they had not moved yet. Step 28b moved them, so it came too.
 *
 * `CoreKey`, not the consumer's wider `Key`: this dictionary is the app-zone half. A caller with a
 * `marketing.*` key is in the website's marketing zone, which has components and `useI18n()`.
 */
export const CORE_DICT: Record<Lang, Record<CoreKey, string>> = { en: CORE_EN, ar: CORE_AR };

export function translate(key: CoreKey): string {
  return CORE_DICT[getCurrentLang()][key];
}
