import type { Lang } from './fmt.js';
import { clubBy, clubShort } from '../api/referenceCache.js';

/**
 * A club's short name in the active language, from its wire id.
 *
 * The ids the API sends are the clubs' database keys — `PTJ`, `SMC`, `ZED` — abbreviations of the
 * clubs' *English* names, so in Arabic they read as nothing: «بتروجيت» is instant, `PTJ` is a
 * puzzle. The squad pitch printed them raw in the opponent pill; everything else looked the club up
 * first, each in its own hand-rolled copy of this function.
 *
 * Falls back to the id when the reference cache has not hydrated yet, or the club is genuinely
 * unknown — the same degradation the copies it replaces already had.
 *
 * Replaces four of them: `SquadListView.clubShortLabel`, `TransferSquadList.clubLabel` (those two
 * byte-identical), and `PlayerProfileContent.oppShort`.
 */
export function shortClubName(code: string, lang: Lang): string {
  const club = clubBy(code);
  return club ? clubShort(club, lang) : code;
}
