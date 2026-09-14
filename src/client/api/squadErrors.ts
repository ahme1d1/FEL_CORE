import { rulesOrNull } from './rulesCache.js';

/**
 * `POST /squad/validate`'s rule codes, in this app's own words.
 *
 * The wizard used to print `errors[0].message` straight onto the screen. That field is the rules
 * engine's English prose, written for logs — so an RTL Arabic wizard showed "Captain must be in
 * the XI" verbatim. The transfers path has mapped its codes through `transferRuleMessage` since
 * it was written; this path mapped nothing.
 *
 * Deliberately partial. `COMPOSITION` ("Expected 5 DEF") and `CLUB_CAP` name a position or a club
 * that the wire does not carry as data, and this app's own copy for them interpolates exactly
 * those values — so a mapping would print a literal `{pos}` or `{club}`. Those fall through to the
 * server's sentence, which is at least true. The same trade `transferRuleMessage` documents.
 */
const SQUAD_RULE_KEYS = {
  PLAYER_NOT_FOUND: 'rules.unknownPlayer',
  DUPLICATE: 'rules.alreadyPicked',
  FORMATION: 'rules.illegalFormation',
  XI_ILLEGAL: 'rules.illegalFormation',
  BUDGET: 'rules.overBudget',
  CAPTAIN_VICE: 'rules.captainVice',
  CAPTAIN_NOT_IN_XI: 'rules.captainInSquad',
  VICE_NOT_IN_XI: 'rules.viceInSquad',
  SIZE: 'rules.exactSize',
} as const;

export type SquadRuleCodeKey = (typeof SQUAD_RULE_KEYS)[keyof typeof SQUAD_RULE_KEYS];

/** Everything `squadRuleMessage` can hand to `t()`. */
export type SquadRuleMessageKey = SquadRuleCodeKey | 'errors.saveFailed';

/**
 * The dictionary key for one squad rule code, or `null` when this build has no copy for it.
 *
 * `Object.hasOwn`, never a bare index: the lookup walks the prototype chain otherwise, so a wire
 * code of `constructor` comes back as a function — not nullish, so `??` never fires — and reaches
 * `t()`. The failure `breakdownLabel` documents, in a map fed from the same place.
 */
export function mapSquadRuleCode(code: string | undefined): SquadRuleCodeKey | null {
  if (!code) return null;
  return Object.hasOwn(SQUAD_RULE_KEYS, code)
    ? ((SQUAD_RULE_KEYS as Record<string, SquadRuleCodeKey>)[code] ?? null)
    : null;
}

/**
 * The message for one rule the server says a squad breaks.
 *
 * `rules.exactSize` is the one key here that interpolates, and its `{n}` is a served constant, so
 * it is filled from `rulesOrNull()` rather than written out. Cold rules fall back to the server's
 * sentence rather than printing a literal `{n}` — `rulesOrNull`, not `rules()`, because a message
 * function is no place to throw.
 */
export function squadRuleMessage(
  rule: { code: string; message: string },
  t: (key: SquadRuleMessageKey) => string,
): string {
  const key = mapSquadRuleCode(rule.code);
  if (!key) return rule.message || t('errors.saveFailed');
  if (key === 'rules.exactSize') {
    const size = rulesOrNull()?.squadSize;
    if (size === undefined) return rule.message || t(key);
    return t(key).replace('{n}', String(size));
  }
  return t(key);
}
