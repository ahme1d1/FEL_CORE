import { describe, expect, it } from 'vitest';

import {
  decimalToTenths,
  mapEnvelope,
  mapPage,
  tenthsToDecimal,
  toChipKind,
  toFormationId,
  toLeagueType,
  toNotificationKind,
  type ApiEnvelope,
  type PaginatedRaw,
} from './adapters.js';
import { __resetRulesForTests, __setRulesForTests } from './rulesCache.js';

describe('mapEnvelope', () => {
  it('maps a successful envelope to a plain ApiResponse', () => {
    // Arrange
    const raw: ApiEnvelope<{ id: number }> = {
      success: true,
      message: 'تمت العملية بنجاح.',
      data: { id: 1 },
      error: null,
      code: 200,
    };

    // Act
    const res = mapEnvelope(raw);

    // Assert
    expect(res).toEqual({ success: true, data: { id: 1 }, error: null });
  });

  it('maps a failed envelope to error=message and code=the machine error string', () => {
    // Arrange
    const raw: ApiEnvelope<null> = {
      success: false,
      message: 'الجلسة غير صالحة.',
      data: null,
      error: 'REFRESH_INVALID',
      code: 401,
    };

    // Act
    const res = mapEnvelope(raw);

    // Assert
    expect(res).toEqual({
      success: false,
      data: null,
      error: 'الجلسة غير صالحة.',
      code: 'REFRESH_INVALID',
    });
  });
});

describe('mapPage', () => {
  it('maps FEL_API Laravel-style pagination to ApiPage', () => {
    // Arrange
    const raw: PaginatedRaw<{ id: number }> = {
      data: [{ id: 1 }, { id: 2 }],
      meta: { current_page: 2, per_page: 50, total: 173 },
    };

    // Act
    const page = mapPage(raw);

    // Assert
    expect(page).toEqual({ items: [{ id: 1 }, { id: 2 }], total: 173, page: 2, limit: 50 });
  });
});

describe('tenthsToDecimal / decimalToTenths', () => {
  it('converts tenths to decimal millions', () => {
    expect(tenthsToDecimal(125)).toBe(12.5);
  });

  it('round-trips decimal millions through tenths', () => {
    expect(decimalToTenths(8.5)).toBe(85);
    expect(decimalToTenths(tenthsToDecimal(75))).toBe(75);
  });
});

describe('enum validators', () => {
  it('passes through a recognized chip kind', () => {
    expect(toChipKind('wc')).toBe('wc');
  });

  it('throws on an unrecognized chip kind', () => {
    expect(() => toChipKind('WC')).toThrow(/Unknown chip kind/);
  });

  it('passes through a recognized league type', () => {
    expect(toLeagueType('h2h')).toBe('h2h');
  });

  it('throws on an unrecognized league type', () => {
    expect(() => toLeagueType('CLASSIC')).toThrow(/Unknown league type/);
  });

  it('passes through a recognized notification kind', () => {
    expect(toNotificationKind('price-up')).toBe('price-up');
  });

  it('throws on an unrecognized notification kind', () => {
    expect(() => toNotificationKind('PRICE_UP')).toThrow(/Unknown notification kind/);
  });

  it('passes through a recognized formation', () => {
    expect(toFormationId('4-4-2')).toBe('4-4-2');
  });

  it('throws on a formation the SERVER does not list', () => {
    __setRulesForTests();

    expect(() => toFormationId('4-2-4')).toThrow(/Unknown formation/);
    expect(toFormationId('4-4-2')).toBe('4-4-2');
  });

  it('passes a formation through untouched before the rules have loaded', () => {
    // `GET /bootstrap` carries a squad AND the rules in one payload. A parser that demanded the
    // rules first could not read the response that delivers them, so "not loaded yet" must never
    // be treated as "not a formation".
    __resetRulesForTests();

    expect(toFormationId('4-2-4')).toBe('4-2-4');
  });
});
