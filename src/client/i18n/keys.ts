/**
 * Every dictionary key `@fel/core/client` can hand to a translator.
 *
 * This file predates the dictionary. Until step 28b the strings lived in the consumer, so the
 * dependency ran backwards: each module named the keys it emits as a literal union, this file
 * collected them, and the consumer asserted the relationship. The dictionary is here now
 * (`./en.ts`), and `./contract.ts` makes that assertion against it — but the unions stay, because
 * they are what types `RuleError.key`, `chipReasonKey`'s return and the rest, and because they keep
 * the check EXACT: they name what is reachable, where the dictionary names what exists.
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
