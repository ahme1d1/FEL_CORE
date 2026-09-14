import type { CoreKey } from './en.js';
import type { CoreMessageKey } from './keys.js';

/**
 * Every dictionary key this package can emit must exist in the dictionary it now ships.
 *
 * Until step 28b this assertion lived in the CONSUMER (`FEL_WEBSITE/app/types/core-i18n-contract.ts`)
 * because the consumer owned the strings, and it could only ever be as good as the consumer's
 * typecheck. Now both sides are here, so it fires in the repo that can fix it — and it is exact:
 * `CoreKey` is this package's own keyset, not a superset that also holds 430 marketing keys.
 *
 * It is stronger than annotating call sites. Contravariance already turns every
 * `t: (key: CoreKey) => string` parameter into a check, but the call sites that pass a framework's
 * own `t` — which takes a bare `string` — cannot check anything. This covers those.
 *
 * Never imported. `npm run typecheck` compiles `src/client/**`, which is the whole mechanism.
 */
type MissingFromDictionary = Exclude<CoreMessageKey, CoreKey>;

type Contract = [MissingFromDictionary] extends [never]
  ? true
  : {
      ERROR: '@fel/core/client names message keys its own dictionary does not have';
      missing: MissingFromDictionary;
    };

export const coreI18nContract: Contract = true;
