import type { Player } from '../data/players.js';

/**
 * Whether a player can be counted on for the next round, and what is wrong with him.
 *
 * One classifier, because there used to be nine. Every consumer — the pitch chip, both squad
 * lists, both transfer panes, three sheets and the wizard picker — carried its own copy of
 * `news === 'إصابة'`, an exact compare against free text an admin types. Two failures fell out
 * of that, and both were reported together:
 *
 *  1. A ruled-out player was shown as «مشكوك», because the compare missed and the fallback was
 *     *doubtful*. The structured field never reached the client at all — `toClientPlayer` dropped
 *     it, even though `GET /players/injuries` *selects* on `newsStatus`.
 *  2. Worse, the visibility gate was `!!player.news`. Flag a player by status and leave the note
 *     blank — exactly what the admin news editor sends — and he showed no indicator anywhere: no
 *     dot on the pitch, none in transfers, no banner in any sheet.
 *
 * **`news` is never read here.** It is display copy an admin writes for managers, in whatever
 * words they like, and it decides nothing. Availability comes only from `newsStatus`, a fixed
 * four-state enum. Parsing prose was the original defect and it failed in both directions: it
 * missed a ruled-out player whose note was blank, and «مشكوك في جاهزيته» contains «جاهز», so a
 * naive fit-check cleared a player who had been explicitly flagged.
 */

/** How serious it is. Drives the **colour**. */
export type Availability = 'available' | 'doubtful' | 'out';

/** What is wrong. Drives the **label**. */
export type UnavailableReason = 'delisted' | 'injured' | 'suspended' | 'doubtful';

export function availabilityOf(p: Player): Availability {
  // Delisted: can't be bought, still sits on pitches. Never render him as fit.
  if (p.isActive === false) return 'out';
  switch (p.newsStatus) {
    case 'INJURED':
    case 'SUSPENDED':
      return 'out';
    case 'DOUBTFUL':
      return 'doubtful';
    default:
      return 'available';
  }
}

/**
 * Deliberately separate from severity. Reading the label off `availabilityOf` conflates the two
 * and mislabels people: a **suspended** player came out as «مصاب» — calling a suspension an
 * injury. Severity answers "how bad", reason answers "why", and they are not the same question.
 */
export function reasonOf(p: Player): UnavailableReason | null {
  if (p.isActive === false) return 'delisted';
  switch (p.newsStatus) {
    case 'INJURED':
      return 'injured';
    case 'SUSPENDED':
      return 'suspended';
    case 'DOUBTFUL':
      return 'doubtful';
    default:
      return null;
  }
}

/** Whether to surface an availability marker at all. Replaces the old `!!player.news` gate. */
export function isUnavailable(p: Player): boolean {
  return availabilityOf(p) !== 'available';
}

const REASON_KEY = {
  delisted: 'squad.news.delisted',
  injured: 'squad.news.injury',
  suspended: 'squad.news.suspended',
  doubtful: 'squad.news.doubt',
} as const;

/** i18n key naming what is wrong — never inferred from how serious it is. */
export function availabilityKey(p: Player): (typeof REASON_KEY)[UnavailableReason] {
  return REASON_KEY[reasonOf(p) ?? 'doubtful'];
}

/** Token for the dot/banner tint. Kept here so the nine consumers cannot drift apart again. */
export function availabilityColor(p: Player): string {
  return availabilityOf(p) === 'out' ? 'var(--neg-red)' : 'var(--warn-amber)';
}
