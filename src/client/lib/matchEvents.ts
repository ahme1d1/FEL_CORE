import type { MatchEventRow } from '../api/fixturesService.js';

/**
 * Groups one match's player rows into the sections the match sheet renders.
 *
 * Deliberately NOT a timeline. `PlayerMatchEvent` is unique on `(gameweek, player)`, so every row
 * is an aggregate for the whole gameweek — "2 goals", never "23' and 67'". Anything minute-stamped
 * would be invented.
 *
 * Kept pure and separate from the sheet so the ordering rules are testable without a DOM.
 */

export type MatchEventKind =
  | 'goals'
  | 'assists'
  | 'yellow'
  | 'red'
  | 'penalties'
  | 'saves'
  | 'bonus'
  | 'bps'
  | 'defcon';

/**
 * Qualifies an entry when its section alone does not say enough. Cards are no longer tagged: a
 * booking and a sending-off are separate sections now, so the section heading already says it and
 * a chip on the row would only repeat it.
 */
export type MatchEventTag = 'ownGoal' | 'penSaved' | 'penMissed';

export interface MatchEventEntry {
  /** The whole row, so a tapped entry can open that player's profile. */
  player: MatchEventRow;
  /** Rendered as ×N only above 1. */
  count: number;
  tag: MatchEventTag | null;
}

export interface MatchEventSection {
  kind: MatchEventKind;
  /** Away side first, the order the hero and `FixtureRow` both use. */
  away: MatchEventEntry[];
  home: MatchEventEntry[];
  /**
   * Anyone who belongs to neither side. Rare but real: the query also returns rows explicitly
   * tagged with this fixture, and a player who changed clubs after the match now reads as a third
   * club. The two columns say which team by POSITION, so these cannot go in one without claiming
   * something false — they get their own full-width row, with a crest, and are never misfiled.
   */
  other: MatchEventEntry[];
}

/** Which side of the pitch a row belongs to. */
export interface MatchSides {
  home: string;
  away: string;
}

/**
 * Section order, top to bottom. Sections with nothing in them are dropped, not rendered empty.
 *
 * Everything that happened on the pitch first, then the three award sections in FPL's own order —
 * the awarded points, then the score that decided them, then the defensive work that is one of its
 * inputs. Reading down, each section explains the one above it.
 */
const SECTION_ORDER: MatchEventKind[] = [
  'goals',
  'assists',
  'yellow',
  'red',
  'penalties',
  'saves',
  'bonus',
  'bps',
  'defcon',
];

function entry(player: MatchEventRow, count: number, tag: MatchEventTag | null): MatchEventEntry {
  return { player, count, tag };
}

/**
 * Most first. Ties keep the caller's order, which is stable across reopens but is no longer plain
 * player id: `GET /fixtures/:id/events` returns players with a reportable event first, then those
 * listed on their stats row alone, each block ordered by id. Deterministic either way — only the
 * reason is worth stating correctly.
 */
function byCountDesc(a: MatchEventEntry, b: MatchEventEntry): number {
  return b.count - a.count;
}

function goalEntries(players: MatchEventRow[]): MatchEventEntry[] {
  const scored = players.filter((p) => p.goals > 0).map((p) => entry(p, p.goals, null));
  // An own goal sits under Goals because that is where a reader looks for it, but always after the
  // real ones and always tagged. The crest stays the scorer's own club — the club that conceded —
  // rather than the side that benefited, so the row never reads as "this ZAM player plays for ITT".
  const own = players.filter((p) => p.ownGoals > 0).map((p) => entry(p, p.ownGoals, 'ownGoal'));
  return [...scored.sort(byCountDesc), ...own.sort(byCountDesc)];
}



function penaltyEntries(players: MatchEventRow[]): MatchEventEntry[] {
  const saved = players.filter((p) => p.penSaved > 0).map((p) => entry(p, p.penSaved, 'penSaved'));
  const missed = players
    .filter((p) => p.penMissed > 0)
    .map((p) => entry(p, p.penMissed, 'penMissed'));
  return [...saved, ...missed];
}

const BUILDERS: Record<MatchEventKind, (players: MatchEventRow[]) => MatchEventEntry[]> = {
  goals: goalEntries,
  assists: (players) =>
    players
      .filter((p) => p.assists > 0)
      .map((p) => entry(p, p.assists, null))
      .sort(byCountDesc),
  // A second-yellow sending-off is stored as both counters, so the player honestly appears under
  // both headings — which is exactly how it happened.
  yellow: (players) => players.filter((p) => p.yellow > 0).map((p) => entry(p, p.yellow, null)),
  red: (players) => players.filter((p) => p.red > 0).map((p) => entry(p, p.red, null)),
  // Listed on ACTIONS, not on the award. Two reasons: the award is the same flat 2 for everyone
  // who cleared the bar, so it ranks nobody; and the section is a record of defensive work, so a
  // player with 9 tackles belongs in it even though 9 paid him nothing. That is what FPL lists.
  defcon: (players) =>
    players
      .filter((p) => p.defconActions > 0)
      .map((p) => entry(p, p.defconActions, null))
      .sort(byCountDesc),
  // The score that ranked the bonus above. Everyone who registered one, highest first — the point
  // of the section is seeing how close the players just outside the top three came.
  bps: (players) =>
    players
      .filter((p) => p.bps > 0)
      .map((p) => entry(p, p.bps, null))
      .sort(byCountDesc),
  penalties: penaltyEntries,
  // `saves` is optional on the row: the column is real but `GET /fixtures/:id/events` does not
  // serialize it yet, so every payload today yields an empty section, which is dropped. It lights
  // up on its own the day the API ships the field — no client change needed.
  saves: (players) =>
    players
      .filter((p) => (p.saves ?? 0) > 0)
      .map((p) => entry(p, p.saves ?? 0, null))
      .sort(byCountDesc),
  // 3 → 1, the order the bonus is awarded in.
  bonus: (players) =>
    players
      .filter((p) => p.bonus > 0)
      .map((p) => entry(p, p.bonus, null))
      .sort(byCountDesc),
};

/**
 * An own goal stays in its scorer's own column — the side that conceded — because that is who the
 * player plays for; the tag on the row is what says the goal counted for the other team.
 */
function splitBySide(entries: MatchEventEntry[], sides: MatchSides): Omit<MatchEventSection, 'kind'> {
  return {
    away: entries.filter((e) => e.player.club === sides.away),
    home: entries.filter((e) => e.player.club === sides.home),
    other: entries.filter((e) => e.player.club !== sides.away && e.player.club !== sides.home),
  };
}

export function buildMatchSections(
  players: MatchEventRow[],
  sides: MatchSides,
): MatchEventSection[] {
  return SECTION_ORDER.map((kind) => ({ kind, ...splitBySide(BUILDERS[kind](players), sides) })).filter(
    (section) => section.away.length + section.home.length + section.other.length > 0,
  );
}
