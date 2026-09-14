/**
 * Every dictionary key `@fel/core/client` can hand to a translator.
 *
 * The package does not own the dictionaries — they live in the consumer, because 37% of them is
 * marketing copy a phone will never render and copy that changes weekly. So the dependency is
 * inverted: each module names the keys it emits as a literal union, and this file collects them.
 * A consumer asserts the relationship in one place; `FEL_WEBSITE/app/types/core-i18n-contract.ts`
 * is that assertion, and it prints the missing keys by name when it fails.
 *
 * Most of these unions are DERIVED from the map that produces them (`typeof X[keyof typeof X]`), so
 * adding a row to a table extends the union automatically. `SquadRuleErrorKey` is written out
 * because its keys are produced inline rather than from a table — but `RuleError.key` is typed by
 * it, so the compiler still refuses a key that is not listed.
 */
import type { GenericMessageKey } from '../api/apiErrors.js';
import type { AuthMessageKey } from '../api/authErrors.js';
import type { LeagueMessageKey } from '../api/leagueErrors.js';
import type { SquadRuleMessageKey } from '../api/squadErrors.js';
import type { TransferMessageKey } from '../api/transferErrors.js';
import type { ChipReasonKey } from '../lib/chipAvailability.js';
import type { BreakdownMessageKey } from '../lib/breakdownLabel.js';
import type { SquadRuleErrorKey } from '../lib/squadRules.js';
import type { ChipDescKey, ChipNameKey } from '../data/chips.js';

export type CoreMessageKey =
  | GenericMessageKey
  | AuthMessageKey
  | LeagueMessageKey
  | SquadRuleMessageKey
  | TransferMessageKey
  | ChipReasonKey
  | BreakdownMessageKey
  | SquadRuleErrorKey
  | ChipNameKey
  | ChipDescKey;
