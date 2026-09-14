import { describe, expect, it } from 'vitest';

import { CORE_AR } from './ar.js';
import { CORE_EN, type CoreKey } from './en.js';
import { translate } from './translate.js';
import { setCurrentLang } from '../lib/fmt.js';

/**
 * What the types already prove, and what they do not.
 *
 * `CORE_AR: Record<CoreKey, string>` makes a missing Arabic key AND an extra one compile errors, so
 * key-set parity needs no test. Two things survive that annotation and reach a screen:
 * an empty string, and a value left in the wrong language. The first is checkable; the second is
 * only checkable for the shape that has actually shipped as a bug — an Arabic entry that is still
 * the English sentence.
 */
describe('the app-zone dictionary', () => {
  it('has the same keys in both languages', () => {
    // Belt and braces over the `Record<CoreKey, string>` annotation: a `.d.ts` says what the source
    // claimed, and a consumer pinning a bad tag would believe it.
    expect(Object.keys(CORE_AR).sort()).toEqual(Object.keys(CORE_EN).sort());
  });

  it('leaves no value empty in either language', () => {
    const blank = (d: Record<string, string>): string[] =>
      Object.entries(d)
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k);

    expect(blank(CORE_EN), 'English values that are empty').toEqual([]);
    expect(blank(CORE_AR), 'Arabic values that are empty').toEqual([]);
  });

  it('carries Arabic in the Arabic half', () => {
    // Not every value can differ — 'VS', 'FDR' and the like are the same string in both — so this
    // asserts the population, not each row. A copy-paste of the English half would collapse it.
    const arabic = /[؀-ۿ]/;
    const translated = Object.values(CORE_AR).filter((v) => arabic.test(v)).length;
    expect(translated / Object.keys(CORE_AR).length).toBeGreaterThan(0.8);
  });
});

describe('translate', () => {
  it('reads the language the host set, not a default', () => {
    const key = 'common.close' satisfies CoreKey;

    setCurrentLang('en');
    expect(translate(key)).toBe(CORE_EN[key]);

    setCurrentLang('ar');
    expect(translate(key)).toBe(CORE_AR[key]);
  });
});
