import { describe, expect, test } from 'vitest';

import { CORE_AR } from '../i18n/ar.js';
import { CORE_EN } from '../i18n/en.js';

import { BREAKDOWN_KEYS, breakdownLabelKey } from './breakdownLabel.js';
import { BREAKDOWN_KINDS, type BreakdownKind } from './scoring.js';

describe('breakdownLabelKey', () => {
  // `contract.ts` proves at compile time that every key here EXISTS in the dictionary. What it
  // cannot prove is that somebody left a value non-empty, which is the half this walk covers —
  // restored in step 28b, when the dictionary moved into the package and made it reachable again.
  test.each(BREAKDOWN_KINDS)('%s resolves to a key both dictionaries answer', (kind) => {
    const key = breakdownLabelKey(kind);
    expect(key, `no label key mapped for breakdown kind "${kind}"`).not.toBeNull();
    expect(CORE_EN[key!], `missing English label for "${kind}"`).toBeTruthy();
    expect(CORE_AR[key!], `missing Arabic label for "${kind}"`).toBeTruthy();
  });

  test('covers every kind, with nothing left over', () => {
    expect(Object.keys(BREAKDOWN_KEYS).sort()).toEqual([...BREAKDOWN_KINDS].sort());
  });

  /**
   * The regression. `rows` comes from FEL_API, which owns `BreakdownKind` and shipped `defcon`
   * without the website knowing — so the cast here is not a test contrivance, it is the real
   * shape of the wire. The old code passed this straight to `t(undefined)`, and production showed
   * the row with no label at all: a bare `1` and `2` above the total. Returning `null` lets the
   * caller fall back to the raw kind instead.
   */
  test('answers null for a kind this build has never heard of, rather than throwing', () => {
    const fromAFutureServer = 'someRuleWeHaveNotShippedYet' as BreakdownKind;
    expect(() => breakdownLabelKey(fromAFutureServer)).not.toThrow();
    expect(breakdownLabelKey(fromAFutureServer)).toBeNull();
  });

  test('is not fooled by a name Object.prototype happens to own', () => {
    // `BREAKDOWN_KEYS['constructor']` is a function, not a key — a bare `[kind]` lookup with no
    // `?? null` would hand `t()` something even less printable than undefined.
    expect(breakdownLabelKey('constructor' as BreakdownKind)).toBeNull();
  });
});
