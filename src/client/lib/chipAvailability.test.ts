import { describe, expect, it } from 'vitest';

import { CORE_AR } from '../i18n/ar.js';
import { CORE_EN } from '../i18n/en.js';

import { cardStateForReason, chipReasonKey, CHIP_REASON_KEYS } from './chipAvailability.js';

describe('chipReasonKey', () => {
  it('maps every reason the server can send', () => {
    // The union in FEL_API's `chip-kind.ts` (`ChipUnplayableReason`). `ACTIVE` is deliberately
    // absent: a card showing the chip in force says so with its own state, not an error sentence.
    for (const reason of ['PRESEASON_LOCKED', 'ALREADY_USED', 'ONE_PER_GW', 'ONE_ACTIVE', 'DEADLINE_PASSED']) {
      expect(chipReasonKey(reason), reason).not.toBeNull();
    }
  });

  it('answers null for a reason this client has not heard of', () => {
    expect(chipReasonKey('SOME_FUTURE_REASON')).toBeNull();
    expect(chipReasonKey(null)).toBeNull();
  });

  it('every mapped key exists in BOTH dictionaries, with copy behind it', () => {
    // Restored in step 28b. The compile-time contract proves the keys exist; only a walk catches a
    // key whose Arabic value was left empty, which renders as a blank refusal on the chip card.
    for (const key of Object.values(CHIP_REASON_KEYS)) {
      expect(CORE_EN[key], `EN missing ${key}`).toBeTruthy();
      expect(CORE_AR[key], `AR missing ${key}`).toBeTruthy();
    }
  });

  it('answers null for a prototype key rather than a function', () => {
    // A bare index walks the prototype chain: `['constructor']` returns a function, which is not
    // nullish, so a `?? fallback` does not catch it and `t(fn)` reaches the message compiler.
    // Same failure mode `breakdownLabel` documents — hence `Object.hasOwn`.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(chipReasonKey(key), key).toBeNull();
    }
  });
});

describe('cardStateForReason', () => {
  it('shows the chip in force as active, and a spent one as played', () => {
    expect(cardStateForReason('ACTIVE')).toBe('active');
    expect(cardStateForReason('ALREADY_USED')).toBe('played');
  });

  it('disables every other refusal — including ONE_PER_GW', () => {
    // ONE_PER_GW used to fall through to `available`, so the card offered a control that could
    // only fail: the dialog opened, Activate was enabled, and the refusal arrived inline.
    expect(cardStateForReason('ONE_PER_GW')).toBe('disabled');
    expect(cardStateForReason('ONE_ACTIVE')).toBe('disabled');
    expect(cardStateForReason('PRESEASON_LOCKED')).toBe('disabled');
    expect(cardStateForReason('DEADLINE_PASSED')).toBe('disabled');
  });

  it('disables an unknown refusal rather than offering it', () => {
    // The server owns this union and deploys separately. "Not playable, and we cannot say why"
    // must still not offer a control — an unnamed refusal is honest, a dead button is not.
    expect(cardStateForReason('SOME_FUTURE_REASON')).toBe('disabled');
  });

  it('is available only when there is no reason at all', () => {
    expect(cardStateForReason(null)).toBe('available');
  });
});
