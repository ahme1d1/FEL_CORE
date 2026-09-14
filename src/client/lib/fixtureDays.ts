import type { Fixture } from '../data/fixtures.js';
import type { Lang } from './fmt.js';

export interface MatchDayRow {
  fixture: Fixture;
  /** Kickoff time only — the date lives in the group header. */
  time: string;
}

export interface MatchDay {
  /** Localized "Saturday 1 September" heading. */
  day: string;
  /** True when these matches are played on the viewer's today. */
  isToday: boolean;
  rows: MatchDayRow[];
}

export interface MatchDayOptions {
  lang: Lang;
  /** Shown when a fixture has no resolvable kickoff (a gameweek with no anchor yet). */
  tbd: string;
  /** Injected so the grouping stays a pure function under test. */
  now?: number;
}

/**
 * "Saturday 1 September" in the active language.
 *
 * `-u-nu-latn` forces Western digits. Plain `ar-EG` defaults to Arabic-Indic ones («٢٦»), which
 * would have made this heading the only place on the page not using Western numerals — the
 * gameweek stepper, the kickoff times and the fixture count all use them, and it is the documented
 * house rule for Arabic copy. (Inherited from `PitchFixtures`, where the panel was small enough
 * that nobody noticed; as a page heading it is obvious.)
 */
function dayHeading(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

/** "19:00" — locale-neutral digits, matching how the rest of the app prints kickoffs. */
function timeHeading(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A gameweek's fixtures, split into its match days.
 *
 * A fantasy gameweek is not a day — the 2026/27 season runs them Wednesday to Friday — so a flat
 * list of ten renders the six that have been played straight into the four that have not, with
 * nothing marking the join. On the fixtures page that was made worse by a two-column desktop grid,
 * which interleaves played and unplayed down the columns. Hiding the finished ones would be the
 * wrong fix: results are half of why the screen gets opened. Grouping is the right one.
 *
 * Lifted out of `PitchFixtures.vue`, which already did this for the panel under the squad pitch,
 * so the two surfaces cannot drift into two different ideas of where a day begins.
 *
 * `resolveIso` is injected because the two callers resolve kickoffs differently: fixtures now
 * carry an absolute `kickoffAt`, but a gameweek this client holds no anchor for still falls back
 * to the static schedule string. Returning `null` from it lands the fixture in a `tbd` group.
 */
export function groupByMatchDay(
  fixtures: readonly Fixture[],
  resolveIso: (f: Fixture) => string | null,
  opts: MatchDayOptions,
): MatchDay[] {
  const today = new Date(opts.now ?? Date.now());

  // Sort before grouping, not after: the runs below are consecutive-only, so unsorted input
  // would emit the same day twice (26th, 27th, 26th) instead of merging it.
  const sorted = [...fixtures].sort((a, b) => {
    const ai = resolveIso(a);
    const bi = resolveIso(b);
    if (ai && bi) return Date.parse(ai) - Date.parse(bi);
    // A fixture with no kickoff sorts last, so TBD never splits a real day in half.
    if (ai) return -1;
    if (bi) return 1;
    return a.koOffsetMin - b.koOffsetMin;
  });

  const groups: MatchDay[] = [];
  for (const fixture of sorted) {
    const iso = resolveIso(fixture);
    const day = iso ? dayHeading(iso, opts.lang) : opts.tbd;
    const row: MatchDayRow = { fixture, time: iso ? timeHeading(iso) : opts.tbd };
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.rows.push(row);
      continue;
    }
    groups.push({
      day,
      isToday: iso ? sameLocalDay(new Date(iso), today) : false,
      rows: [row],
    });
  }
  return groups;
}
