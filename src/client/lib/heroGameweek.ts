import type { GWPhase } from '../api/gameweekService.js';

/**
 * Which gameweek the Home hero is about, and which one the fixtures strip lists.
 *
 * The app tracks two gameweeks at once: the one being **watched** (`displayGW` — the most recent
 * whose deadline has passed) and the one open for **editing** (`currentGW` — the next whose
 * deadline has not). Every Home surface used to read `displayGW` unconditionally, so on the day
 * GW2's deadline fell the screen's headline was a bold «الجولة 1» under a «منتهية» pill, the
 * fixtures section listed ten finished GW1 matches, and nothing anywhere said GW2 closed in hours.
 *
 * FPL's own answer, and the one implemented here: once the watched gameweek is **finished** and a
 * later one is open, the hero's identity becomes the gameweek you can still act on, and the
 * finished result drops to a card beneath it. Adding a second line under the old headline was not
 * enough — it left two gameweek numbers on one card with the bold one being the finished one.
 *
 * Deliberately narrow, and that is the point of the tests beside this file: in every other state
 * the watched gameweek either **is** the edited one (nothing locked yet) or is still in play
 * (locked / live), and the hero must not move.
 *
 * Pure on purpose — the page reads these from a Pinia store, which is not mountable in this
 * repo's test setup, so the rule lives here where it can be pinned state by state.
 */
export interface HeroGameweekChoice {
  /** The gameweek the hero names, and whose deadline its countdown runs to. */
  heroGw: number;
  /** The phase body the hero renders. Forced to `open` when it has rolled forward. */
  heroPhase: GWPhase;
  /** The gameweek whose fixtures the Home strip lists. */
  fixturesGw: number;
  /**
   * True when the hero has rolled forward to the editing gameweek — the one state in which the
   * finished result is shown by `HomeGwResultStrip` instead, and the duplicate points tile in the
   * stats column is suppressed.
   */
  showsResultCard: boolean;
}

export function chooseHeroGameweek(input: {
  currentGw: number;
  displayGw: number;
  displayPhase: GWPhase;
  /** `displayGw !== currentGw`, already gated on the store having hydrated. */
  isLiveGameweek: boolean;
}): HeroGameweekChoice {
  const { currentGw, displayGw, displayPhase, isLiveGameweek } = input;
  const rolledForward = isLiveGameweek && displayPhase === 'finished';

  return {
    heroGw: rolledForward ? currentGw : displayGw,
    heroPhase: rolledForward ? 'open' : displayPhase,
    // Through the locked and live windows the strip stays on the watched gameweek, whose
    // fixtures are the ones actually being played; only once it is done does it show what is next.
    fixturesGw: rolledForward ? currentGw : displayGw,
    showsResultCard: rolledForward,
  };
}

/**
 * The status pill in the hero's top row: what the gameweek IS right now.
 *
 * `live` was the missing case. A gameweek in play fell through to the open-state branch and
 * announced «يغلق خلال» / "closes in" about a deadline that had already passed — visible on Home
 * for the whole of a live gameweek. The Live badge that would otherwise have covered it belonged
 * to the Live Ticker, which has since been deleted, so there was nothing left to say the gameweek
 * had started.
 *
 * `liveActive` is the page's own signal: the watched gameweek is live, or the dev live-mode
 * toggle is previewing the ticker through the locked pre-kickoff window. It promotes a locked
 * gameweek to live and nothing else — a finished one stays finished.
 */
export type HeroPill = 'finished' | 'live' | 'underway' | 'open';

/**
 * Which pill the hero shows, from real match state rather than the clock.
 *
 * `matchLive` replaced `liveActive` here. The old signal was `phase === 'live'`, and that phase
 * derives from three timestamp columns (`deadlineAt` → `firstKickoffAt` → `liveEndAt`) without
 * ever consulting a fixture — so it reported live for the entire span of a gameweek spread over
 * three match days. Observed on prod at 02:45Z with the next kickoff eleven hours away: a red,
 * pulsing «مباشر» in three places at once and not a ball being kicked anywhere.
 *
 * `underway` is the state that lie was covering: the round has started and points are still
 * moving, but nothing is on right now. It gets its own colour rather than borrowing red.
 */
export function heroPillFor(phase: GWPhase, matchLive: boolean): HeroPill {
  if (phase === 'finished') return 'finished';
  if (matchLive) return 'live';
  return phase === 'open' ? 'open' : 'underway';
}
