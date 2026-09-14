import { fmt } from './fmt.js';
import { toRankMovement, type RankMovement } from './leagueMovement.js';
import type { GeneralLeagues } from '../api/leaguesService.js';

/**
 * One row of the leagues hub's "General Leagues" section, ready for `LeagueListRow`.
 *
 * `lastRank` and `movement` are OPTIONAL here, and their absence is the point — see `fromGeneral`.
 */
export interface GeneralLeagueRow {
  key: string;
  name: string;
  to: string;
  rank: number | null;
  lastRank?: number | null;
  movement?: RankMovement;
}

/**
 * The two General rows, in order: Overall, then the latest started gameweek.
 *
 * A pure function rather than a computed in the page, so the one rule that is easy to break by
 * accident can be asserted without a browser: **the Gameweek row carries no `lastRank` and no
 * `movement` at all.** Its rank is a position WITHIN that gameweek, while movement everywhere else
 * is an overall-rank delta — an arrow beside it would describe a different ranking from the number
 * it sits next to, and nothing records what a gameweek rank was a gameweek earlier. The server
 * already refuses to serve either (`ClientGeneralLeagues.gameweek` has no field for them); this
 * keeps the client from inventing them on the way to the screen.
 *
 * `overallLabel` is passed in because the label is translated and this stays free of vue-i18n.
 * The gameweek's own label is `fmt.gwLong`, which reads the module-level language ref.
 */
export function fromGeneral(
  general: GeneralLeagues | null,
  overallLabel: string
): GeneralLeagueRow[] {
  const overall: GeneralLeagueRow = {
    key: 'overall',
    name: overallLabel,
    to: '/app/leagues/overall',
    rank: general?.overall.rank ?? null,
    lastRank: general?.overall.lastRank ?? null,
    movement: toRankMovement(general?.overall.movement),
  };

  const gw = general?.gameweek ?? null;
  // Before the season's first deadline there is no gameweek to name, so the row is absent rather
  // than present-and-empty.
  if (gw === null) return [overall];

  return [
    overall,
    {
      key: `gw-${gw.gw}`,
      name: fmt.gwLong(gw.gw),
      to: `/app/leagues/gameweek/${gw.gw}`,
      rank: gw.rank,
    },
  ];
}
