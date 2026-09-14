import { describe, expect, it } from 'vitest';

import { configureApiClient } from '../platform/config.js';
import type { StorageAdapter } from '../platform/storage.js';
import {
  STORAGE_KEYS,
  getItem,
  getJSON,
  removeItem,
  setItem,
  setJSON,
  setManyJSON,
} from './storage.js';

function memory(): StorageAdapter & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** An ASYNC adapter — AsyncStorage's shape, which the signatures were kept async to accommodate. */
function asyncMemory(): StorageAdapter {
  const m = memory();
  return {
    getItem: async (k) => m.getItem(k),
    setItem: async (k, v) => void m.setItem(k, v),
    removeItem: async (k) => void m.removeItem(k),
  };
}

const throwing: StorageAdapter = {
  getItem: () => {
    throw new Error('sandboxed iframe');
  },
  setItem: () => {
    throw new Error('quota exceeded');
  },
  removeItem: () => {
    throw new Error('nope');
  },
};

describe('with no adapter configured', () => {
  it('degrades to null/no-op — an accidental server call must not crash a render', async () => {
    await expect(getItem('k')).resolves.toBeNull();
    await expect(setItem('k', 'v')).resolves.toBeUndefined();
    await expect(removeItem('k')).resolves.toBeUndefined();
    await expect(getJSON('k')).resolves.toBeNull();
  });
});

describe('with a sync adapter', () => {
  it('round-trips strings and JSON', async () => {
    configureApiClient({ storage: memory() });
    await setItem(STORAGE_KEYS.LANGUAGE, 'en');
    expect(await getItem(STORAGE_KEYS.LANGUAGE)).toBe('en');
    await setJSON(STORAGE_KEYS.WIZARD_DRAFT, { picks: [1, 2] });
    expect(await getJSON<{ picks: number[] }>(STORAGE_KEYS.WIZARD_DRAFT)).toEqual({ picks: [1, 2] });
  });

  it('removes', async () => {
    configureApiClient({ storage: memory() });
    await setItem('k', 'v');
    await removeItem('k');
    expect(await getItem('k')).toBeNull();
  });

  it('answers null for corrupt JSON rather than throwing', async () => {
    const m = memory();
    configureApiClient({ storage: m });
    m.map.set('k', '{not json');
    expect(await getJSON('k')).toBeNull();
  });

  it('writes every entry of setManyJSON', async () => {
    const m = memory();
    configureApiClient({ storage: m });
    await setManyJSON([
      ['a', 1],
      ['b', { x: true }],
    ]);
    expect(m.map.get('a')).toBe('1');
    expect(m.map.get('b')).toBe('{"x":true}');
  });
});

describe('with an ASYNC adapter', () => {
  it('behaves identically — the signatures were kept async for exactly this', async () => {
    configureApiClient({ storage: asyncMemory() });
    await setJSON(STORAGE_KEYS.ONBOARDING_CAPTURE, { teamName: 'الأهلي' });
    expect(await getJSON(STORAGE_KEYS.ONBOARDING_CAPTURE)).toEqual({ teamName: 'الأهلي' });
  });
});

describe('an adapter that throws', () => {
  it('is swallowed on every operation — persistence is best-effort', async () => {
    configureApiClient({ storage: throwing });
    await expect(getItem('k')).resolves.toBeNull();
    await expect(setItem('k', 'v')).resolves.toBeUndefined();
    await expect(removeItem('k')).resolves.toBeUndefined();
    await expect(setJSON('k', 1)).resolves.toBeUndefined();
  });
});

describe('STORAGE_KEYS', () => {
  it('holds only drafts, the credential, an idempotency key and device preferences', () => {
    expect(Object.values(STORAGE_KEYS).sort()).toEqual(
      [
        'fel_access_token',
        'fel_language',
        'fel_onb_capture',
        'fel_refresh_token',
        'fel_transfers_idempotency_key',
        'fel_tweaks',
        'fel_wizard_draft',
      ].sort(),
    );
  });
});
