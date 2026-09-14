import { rules } from '../api/rulesCache.js';

export type ChipKind = 'wc' | 'fh' | 'bb' | 'tc';

/** Display order of the chip cards. State comes from TransfersContext. */
export const CHIP_ORDER: ChipKind[] = ['bb', 'tc', 'wc', 'fh'];

/**
 * Chips that stay locked during the pre-season squad-building window (before the manager's first
 * GW deadline). Only WC/FH: transfers are already unlimited then, so playing them burns a chip for
 * nothing. BB/TC affect GW1 *scoring*, not transfers, and are legitimately playable in GW1.
 *
 * Served (`rules().preSeasonLockedChips`) rather than listed here. It used to be a local array
 * under a comment asking whoever changed `FEL_API`'s `chips.service.ts` to remember this file.
 *
 * The server also answers the whole question directly now — `chipsAvailable[].playable` with a
 * reason — and that is what gates activation. This survives for the one thing the list alone can
 * say: which chips a PRE-SEASON explainer should describe as locked, without a manager's state.
 */
export function isChipPreSeasonLocked(k: ChipKind): boolean {
  return (rules().preSeasonLockedChips as readonly string[]).includes(k);
}

/** One stroke mark per chip, on a 24×24 grid — see `CHIP_ICONS`. */
export interface ChipIcon {
  /** `<path d>` values, drawn with `stroke="currentColor"`, no fill. */
  readonly paths: readonly string[];
  /** Drawn centred inside the mark. Triple Captain's multiplier is the only one. */
  readonly numeral?: string;
}

/**
 * The mark for each chip. Lives here rather than in `ChipSymbol.vue` because three surfaces draw
 * it — the chip cards, `ChipPill` and the transfers header — and a second copy would drift.
 *
 * These were four Unicode characters until 2026-09-05 — `★` `⚡` `▲` `×3`, set in mono type. None
 * of them said what its chip did, and `★` was doing three jobs at once: Wildcard here, the Team of
 * the Week link, and the Dream team tile on the Home strip. Each mark now draws what the chip
 * actually does, so it reads without its name beside it.
 *
 * Smallest use is `ChipPill` at 15px; the bench legs on `bb` stop resolving below that, so don't
 * render these smaller without re-checking that mark.
 */
export const CHIP_ICONS: Record<ChipKind, ChipIcon> = {
  // A playing card with a spark in it: unlimited transfers, and they stay.
  wc: {
    paths: [
      'M7.2 3.4h9.6a2 2 0 0 1 2 2v13.2a2 2 0 0 1-2 2H7.2a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2z',
      'M12 8.4l1.5 2.1 2.1 1.5-2.1 1.5L12 15.6l-1.5-2.1L8.4 12l2.1-1.5z',
    ],
  },
  // A revert ring: one gameweek, then the squad goes back to what it was.
  fh: { paths: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.2V8.7h-4.5'] },
  // A bench, with something lifting off it.
  bb: {
    paths: ['M4 14.6h16', 'M6.5 14.6v4.2M17.5 14.6v4.2', 'M12 11.4V3.8', 'M8.9 6.9L12 3.8l3.1 3.1'],
  },
  // The armband carrying its multiplier — the mark the pitch already draws.
  tc: { paths: ['M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4z'], numeral: '3' },
};

export const CHIP_NAME_KEYS = {
  wc: 'chips.wc.name',
  fh: 'chips.fh.name',
  bb: 'chips.bb.name',
  tc: 'chips.tc.name',
} as const satisfies Record<ChipKind, string>;

export type ChipNameKey = (typeof CHIP_NAME_KEYS)[keyof typeof CHIP_NAME_KEYS];

export const CHIP_DESC_KEYS = {
  wc: 'chips.confirm.body.wc',
  fh: 'chips.confirm.body.fh',
  bb: 'chips.confirm.body.bb',
  tc: 'chips.confirm.body.tc',
} as const satisfies Record<ChipKind, string>;

export type ChipDescKey = (typeof CHIP_DESC_KEYS)[keyof typeof CHIP_DESC_KEYS];
