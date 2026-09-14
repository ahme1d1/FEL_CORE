import { describe, expect, it } from 'vitest';

import { mapTransferErrorCode, resolveTransferErrorMessage } from './transferErrors.js';

const identity = (key: string): string => key;

describe('mapTransferErrorCode', () => {
  const cases: [string, string][] = [
    ['DEADLINE_LOCKED', 'squad.locked.msg'],
    ['GAMEWEEK_LOCKED', 'squad.locked.msg'],
    ['INSUFFICIENT_FUNDS', 'transfers.banner.fundsShort'],
    ['CHIP_ALREADY_USED', 'chips.error.alreadyUsed'],
    ['CHIP_CONFLICT', 'chips.error.oneActive'],
    ['CHIP_LOCKED', 'chips.error.fhLocked'],
    ['NO_ACTIVE_CHIP', 'chips.error.noActive'],
    ['SQUAD_INVALID', 'errors.saveFailed'],
    ['PLAYER_NOT_FOUND', 'errors.saveFailed'],
    // Reachable from the UI (two tabs, one commits first), so it gets copy
    // that explains itself rather than the generic save-failed fallback (QA-02).
    ['TRANSFER_INVALID', 'transfers.error.invalid'],
    ['IDEMPOTENCY_KEY_REUSED', 'errors.saveFailed'],
  ];

  it.each(cases)('maps %s to %s', (code, expected) => {
    // Arrange / Act
    const key = mapTransferErrorCode(code);

    // Assert
    expect(key).toBe(expected);
  });

  it('returns null for an unmapped-but-known code', () => {
    // Arrange / Act
    const key = mapTransferErrorCode('NOT_FOUND');

    // Assert
    expect(key).toBeNull();
  });

  it('returns null when no code is given', () => {
    // Arrange / Act / Assert
    expect(mapTransferErrorCode(undefined)).toBeNull();
  });
});

describe('resolveTransferErrorMessage', () => {
  it('resolves a mapped code to its localized key', () => {
    // Arrange
    const res = { error: 'Insufficient funds for these transfers', code: 'INSUFFICIENT_FUNDS' };

    // Act
    const message = resolveTransferErrorMessage(res, identity);

    // Assert
    expect(message).toBe('transfers.banner.fundsShort');
  });

  it('falls back to the server message for an unmapped-but-known code', () => {
    // Arrange
    const res = { error: 'المورد غير موجود.', code: 'NOT_FOUND' };

    // Act
    const message = resolveTransferErrorMessage(res, identity);

    // Assert
    expect(message).toBe('المورد غير موجود.');
  });

  it('falls back to the generic key when there is no code or message', () => {
    // Arrange
    const res = { error: null };

    // Act
    const message = resolveTransferErrorMessage(res, identity);

    // Assert
    expect(message).toBe('errors.saveFailed');
  });
});
