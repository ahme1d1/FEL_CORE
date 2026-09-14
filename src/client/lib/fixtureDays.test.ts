import { describe, expect, it } from 'vitest';

import { groupByMatchDay } from './fixtureDays.js';
import type { Fixture } from '../data/fixtures.js';
import type { Club } from '../data/clubs.js';

/** Only the code is read here — grouping is about kickoffs, not crests. */
const club = (id: string) => ({ id }) as Club;

const fx = (home: string, away: string, kickoffAt: string): Fixture => ({
  home,
  away,
  homeClub: club(home),
  awayClub: club(away),
  kickoffAt,
  koOffsetMin: 0,
  tv: '',
  venue: '',
});

const iso = (f: Fixture) => f.kickoffAt ?? null;
const OPTS = { lang: 'en' as const, tbd: 'TBD' };

describe('groupByMatchDay', () => {
  it('splits a gameweek spread over three days into three groups, in kickoff order', () => {
    // GW2 of the 2026/27 season is exactly this shape: Wed/Thu/Fri. The page used to render all
    // ten in one flat list, so six played matches ran into four unplayed ones with no boundary.
    const days = groupByMatchDay(
      [
        fx('SMC', 'ASY', '2026-08-26T14:00:00.000Z'),
        fx('MOD', 'GHZ', '2026-08-27T14:00:00.000Z'),
        fx('ZED', 'AHL', '2026-08-28T17:00:00.000Z'),
        fx('ENP', 'WDY', '2026-08-28T14:00:00.000Z'),
      ],
      iso,
      { ...OPTS, now: Date.parse('2026-08-28T12:00:00.000Z') },
    );

    expect(days).toHaveLength(3);
    expect(days.map((d) => d.rows.length)).toEqual([1, 1, 2]);
    // Within a day, earlier kickoff first — 14:00 before 17:00, not source order.
    expect(days[2]?.rows.map((r) => r.fixture.home)).toEqual(['ENP', 'ZED']);
  });

  it('marks only the group whose matches are played today', () => {
    // The whole point of grouping: "what is still to come" must be findable at a glance.
    const days = groupByMatchDay(
      [fx('SMC', 'ASY', '2026-08-26T14:00:00.000Z'), fx('ZED', 'AHL', '2026-08-28T17:00:00.000Z')],
      iso,
      { ...OPTS, now: Date.parse('2026-08-28T12:00:00.000Z') },
    );

    expect(days.map((d) => d.isToday)).toEqual([false, true]);
  });

  it('keeps same-day fixtures together even when the source list interleaves days', () => {
    const days = groupByMatchDay(
      [
        fx('A', 'B', '2026-08-26T14:00:00.000Z'),
        fx('C', 'D', '2026-08-27T14:00:00.000Z'),
        fx('E', 'F', '2026-08-26T17:00:00.000Z'),
      ],
      iso,
      { ...OPTS, now: Date.parse('2026-08-28T12:00:00.000Z') },
    );

    // Two groups, not three — a naive "start a group when the day changes" pass over unsorted
    // input would emit 26th, 27th, 26th.
    expect(days).toHaveLength(2);
    expect(days[0]?.rows).toHaveLength(2);
  });

  it('falls back to the TBD label when a fixture has no resolvable kickoff', () => {
    const days = groupByMatchDay([fx('A', 'B', '')], () => null, OPTS);

    expect(days[0]?.day).toBe('TBD');
    expect(days[0]?.rows[0]?.time).toBe('TBD');
    expect(days[0]?.isToday).toBe(false);
  });

  it('returns nothing for an empty gameweek rather than an empty group', () => {
    expect(groupByMatchDay([], iso, OPTS)).toEqual([]);
  });

  it('writes the Arabic heading with Western digits, like the rest of the app', () => {
    // Plain `ar-EG` yields «٢٦»; every other number on the page (gameweek, kickoff, match count)
    // is Western, and that is the documented convention for Arabic copy here.
    const days = groupByMatchDay([fx('SMC', 'ASY', '2026-08-26T14:00:00.000Z')], iso, {
      lang: 'ar',
      tbd: 'TBD',
      now: Date.parse('2026-08-28T12:00:00.000Z'),
    });

    expect(days[0]?.day).toContain('26');
    expect(days[0]?.day).not.toMatch(/[\u0660-\u0669]/);
  });
});
