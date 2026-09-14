import { describe, expect, it } from 'vitest';

import { assetUrl, configureApiClient, getApiClientConfig } from './config.js';

describe('defaults', () => {
  it('has an empty base — never a valid runtime state, only pre-boot', () => {
    expect(getApiClientConfig().apiBase).toBe('');
  });

  it('falls back to Arabic, the app default locale', () => {
    expect(getApiClientConfig().getLang()).toBe('ar');
  });

  it('REJECTS rather than throws with no fetcher, so apiFetch keeps its never-throws contract', async () => {
    await expect(getApiClientConfig().fetcher({} as never)).rejects.toThrow(/no fetcher configured/);
  });

  it('no-ops storage rather than throwing — persistence is best-effort', async () => {
    const { storage } = getApiClientConfig();
    expect(await storage.getItem('k')).toBeNull();
    expect(await storage.setItem('k', 'v')).toBeUndefined();
    expect(await storage.removeItem('k')).toBeUndefined();
  });
});

describe('configureApiClient', () => {
  it('merges rather than replaces, so a later partial call keeps the base', () => {
    configureApiClient({ apiBase: 'https://api.example.com/api/v1' });
    configureApiClient({ getLang: () => 'en' });
    expect(getApiClientConfig().apiBase).toBe('https://api.example.com/api/v1');
    expect(getApiClientConfig().getLang()).toBe('en');
  });

  it('reads the language FRESH on every call, so a mid-session switch needs no reconfigure', () => {
    let lang: 'ar' | 'en' = 'ar';
    configureApiClient({ getLang: () => lang });
    expect(getApiClientConfig().getLang()).toBe('ar');
    lang = 'en';
    expect(getApiClientConfig().getLang()).toBe('en');
  });
});

describe('assetUrl', () => {
  it('returns the path unchanged when no base is configured', () => {
    expect(assetUrl('/api/v1/assets/crests/AHL.png')).toBe('/api/v1/assets/crests/AHL.png');
  });

  it('resolves a root-relative path against the API ORIGIN, ignoring the base path', () => {
    configureApiClient({ apiBase: 'https://api.fantasyeg.com/api/v1' });
    expect(assetUrl('/api/v1/assets/crests/AHL.png')).toBe(
      'https://api.fantasyeg.com/api/v1/assets/crests/AHL.png',
    );
  });

  it('survives a malformed base instead of throwing', () => {
    configureApiClient({ apiBase: ':::not a url' });
    expect(assetUrl('/x.png')).toBe('/x.png');
  });
});
