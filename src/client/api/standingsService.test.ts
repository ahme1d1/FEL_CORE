import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureApiClient } from '../platform/config.js';

const apiFetchMock = vi.fn();

vi.mock('./client.js', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  ok: (data: unknown) => ({ success: true, data, error: null }),
}));

import { difficulty, getStandings, type Standing } from './standingsService.js';

describe('getStandings', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    configureApiClient({ apiBase: '' });
  });

  it('passes the response through as-is (field-for-field identical shape)', async () => {
    configureApiClient({ apiBase: 'https://api.test' });
    const table = [{ club: 'AHL', p: 1, w: 1, d: 0, l: 0, gf: 1, ga: 0, pts: 3 }];
    apiFetchMock.mockResolvedValue({ success: true, data: table, error: null });

    const res = await getStandings();

    expect(apiFetchMock).toHaveBeenCalledWith('/standings');
    expect(res).toEqual({ success: true, data: table, error: null });
  });
});

describe('difficulty (pure tiering)', () => {
  // `p: 1` because the tiering only applies to a table that has actually been played — see the
  // all-zero case below. A club's position means nothing until somebody has kicked a ball.
  const make = (clubs: string[]): Standing[] =>
    clubs.map((club) => ({ club, p: 1, w: 0, d: 1, l: 0, gf: 0, ga: 0, pts: 1 }));

  it('tiers top-3 as 5, 4-6 as 4, 7-12 as 3, 13-18 as 2, rest as 1', () => {
    const clubs = Array.from({ length: 21 }, (_, i) => `C${i}`);
    const table = make(clubs);
    expect(difficulty(table, 'C0')).toBe(5);
    expect(difficulty(table, 'C2')).toBe(5);
    expect(difficulty(table, 'C3')).toBe(4);
    expect(difficulty(table, 'C5')).toBe(4);
    expect(difficulty(table, 'C6')).toBe(3);
    expect(difficulty(table, 'C11')).toBe(3);
    expect(difficulty(table, 'C12')).toBe(2);
    expect(difficulty(table, 'C17')).toBe(2);
    expect(difficulty(table, 'C18')).toBe(1);
  });

  it('defaults to tier 2 for a club not present in the table (unseeded club)', () => {
    expect(difficulty([], 'GON')).toBe(2);
  });

  it('treats a table where nobody has played as unranked, not as an ordering', () => {
    // The season-start table lists every club on zero points, ordered alphabetically. Reading
    // tiers off that would call the first three clubs in the alphabet the hardest fixtures in
    // the league, so every club stays neutral until results exist.
    const preSeason = Array.from({ length: 20 }, (_, i) => `C${i}`).map((club) => ({
      club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
    }));

    expect(preSeason.map((s) => difficulty(preSeason, s.club))).toEqual(
      Array.from({ length: 20 }, () => 2)
    );
  });

  it('stays neutral mid-round, while some clubs have played and others have not', () => {
    // The real case that caught this: one 0-0 draw on the opening day left two clubs on a point
    // and eighteen still in alphabet order. Tiering that would sell the alphabet as difficulty.
    const table = Array.from({ length: 20 }, (_, i) => `C${i}`).map((club, i) => ({
      club, p: i < 2 ? 1 : 0, w: 0, d: i < 2 ? 1 : 0, l: 0, gf: 0, ga: 0, pts: i < 2 ? 1 : 0,
    }));

    expect(table.map((s) => difficulty(table, s.club))).toEqual(
      Array.from({ length: 20 }, () => 2)
    );
  });

  it('starts tiering once every club has played', () => {
    const table = Array.from({ length: 20 }, (_, i) => `C${i}`).map((club) => ({
      club, p: 1, w: 0, d: 1, l: 0, gf: 0, ga: 0, pts: 1,
    }));

    expect(difficulty(table, 'C0')).toBe(5);
    expect(difficulty(table, 'C19')).toBe(1);
  });
});
