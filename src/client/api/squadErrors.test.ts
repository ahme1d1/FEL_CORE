import { describe, expect, it, vi } from 'vitest';

import { mapSquadRuleCode, squadRuleMessage } from './squadErrors.js';
import { TEST_RULES } from './rulesCache.js';

/** A translator that echoes the key, so these assertions are about MAPPING, not copy. */
const echo = (key: string): string => key;

describe('mapSquadRuleCode', () => {
  it('maps the codes this app has its own words for', () => {
    for (const code of [
      'PLAYER_NOT_FOUND', 'DUPLICATE', 'FORMATION', 'XI_ILLEGAL',
      'BUDGET', 'CAPTAIN_VICE', 'CAPTAIN_NOT_IN_XI', 'VICE_NOT_IN_XI', 'SIZE',
    ]) {
      expect(mapSquadRuleCode(code), code).not.toBeNull();
    }
  });

  it('leaves COMPOSITION and CLUB_CAP unmapped, by design', () => {
    // Their copy interpolates a position or club the wire does not carry as data, so a mapping
    // would print a literal `{pos}` / `{club}`. They fall through to the server's own sentence.
    expect(mapSquadRuleCode('COMPOSITION')).toBeNull();
    expect(mapSquadRuleCode('CLUB_CAP')).toBeNull();
  });

  it('answers null for an unknown code and for a prototype key', () => {
    expect(mapSquadRuleCode('SOME_FUTURE_CODE')).toBeNull();
    expect(mapSquadRuleCode(undefined)).toBeNull();
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(mapSquadRuleCode(key), key).toBeNull();
    }
  });
});

describe('squadRuleMessage', () => {
  it('uses this app\'s copy, never the server\'s English prose', () => {
    // The defect: the wizard printed `errors[0].message` verbatim, so an RTL Arabic screen read
    // "Captain must be in the XI".
    const out = squadRuleMessage({ code: 'CAPTAIN_NOT_IN_XI', message: 'Captain must be in the XI' }, echo);
    expect(out).toBe('rules.captainInSquad');
    expect(out).not.toContain('Captain must be');
  });

  it('fills {n} on the size rule from the SERVED squad size, not a literal', () => {
    const out = squadRuleMessage({ code: 'SIZE', message: 'Squad must have 11 XI and 4 bench' }, (k) =>
      k === 'rules.exactSize' ? 'Squad must have exactly {n} players' : k,
    );
    expect(out).toBe(`Squad must have exactly ${TEST_RULES.squadSize} players`);
    expect(out).not.toContain('{n}');
  });

  it('falls back to the server sentence for a code it cannot name', () => {
    const out = squadRuleMessage({ code: 'COMPOSITION', message: 'Expected 5 DEF' }, echo);
    expect(out).toBe('Expected 5 DEF');
  });

  it('falls back to the generic failure when the server sent no sentence either', () => {
    expect(squadRuleMessage({ code: 'WHAT', message: '' }, echo)).toBe('errors.saveFailed');
  });
});
