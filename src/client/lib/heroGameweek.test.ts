import { describe, expect, test } from 'vitest';
import { chooseHeroGameweek, heroPillFor } from './heroGameweek.js';

/**
 * The state that produced the bug, reported from production on 2026-08-26: GW1 settled, GW2 open
 * with its deadline later the same day. `GET /gameweeks/current` returned exactly this.
 */
const gw1SettledGw2Open = {
  currentGw: 2,
  displayGw: 1,
  displayPhase: 'finished',
  isLiveGameweek: true,
} as const;

describe('chooseHeroGameweek', () => {
  test('names the gameweek still open for editing once the watched one has finished', () => {
    const choice = chooseHeroGameweek(gw1SettledGw2Open);

    expect(choice.heroGw).toBe(2);
    expect(choice.heroPhase).toBe('open');
  });

  test('lists the upcoming fixtures rather than the finished ones', () => {
    expect(chooseHeroGameweek(gw1SettledGw2Open).fixturesGw).toBe(2);
  });

  test('demotes the finished gameweek to the result card instead of dropping its score', () => {
    expect(chooseHeroGameweek(gw1SettledGw2Open).showsResultCard).toBe(true);
  });

  test('leaves the hero on the watched gameweek while it is still locked', () => {
    const choice = chooseHeroGameweek({
      currentGw: 3,
      displayGw: 2,
      displayPhase: 'locked',
      isLiveGameweek: true,
    });

    expect(choice).toEqual({
      heroGw: 2,
      heroPhase: 'locked',
      fixturesGw: 2,
      showsResultCard: false,
    });
  });

  test('leaves the hero on the watched gameweek while its matches are being played', () => {
    const choice = chooseHeroGameweek({
      currentGw: 3,
      displayGw: 2,
      displayPhase: 'live',
      isLiveGameweek: true,
    });

    expect(choice.heroGw).toBe(2);
    expect(choice.heroPhase).toBe('live');
    // The fixtures being played are the ones worth showing, not next week's.
    expect(choice.fixturesGw).toBe(2);
    expect(choice.showsResultCard).toBe(false);
  });

  test('changes nothing before any deadline has passed, when both gameweeks are the same one', () => {
    const choice = chooseHeroGameweek({
      currentGw: 1,
      displayGw: 1,
      displayPhase: 'open',
      isLiveGameweek: false,
    });

    expect(choice).toEqual({
      heroGw: 1,
      heroPhase: 'open',
      fixturesGw: 1,
      showsResultCard: false,
    });
  });

  test('does not roll forward on a finished phase alone — the gameweeks must actually differ', () => {
    // `displayPhase` is derived from a deadline, so it can read `finished` while the store still
    // has one gameweek in both roles. Rolling forward there would point the hero at itself.
    const choice = chooseHeroGameweek({
      currentGw: 1,
      displayGw: 1,
      displayPhase: 'finished',
      isLiveGameweek: false,
    });

    expect(choice.showsResultCard).toBe(false);
    expect(choice.heroGw).toBe(1);
  });
});

describe('heroPillFor', () => {
  /**
   * The pill has four states and each one now owns a distinct colour, because colour is what a
   * manager reads first: amber «يغلق خلال» (a deadline you can still miss), cyan «جارية» (round
   * running, points moving), red «مباشر» (a match on right now), muted «انتهت» (final).
   *
   * `matchLive` is the new input and the whole point of the change. It used to be
   * `phase === 'live'`, which is three timestamp columns and a clock with no fixture involved,
   * so the red badge stayed lit for ~56h a gameweek — most of it with no football being played.
   */
  test('red is reserved for a match actually being played', () => {
    expect(heroPillFor('live', true)).toBe('live');
    expect(heroPillFor('locked', true)).toBe('live');
  });

  test('a gameweek under way with no match on right now reads «جارية», not live', () => {
    // The state that was lying: deadline passed, some matches played, none in progress.
    expect(heroPillFor('live', false)).toBe('underway');
  });

  test('locked before the first kickoff also reads «جارية»', () => {
    expect(heroPillFor('locked', false)).toBe('underway');
  });

  test('an open gameweek keeps the countdown label', () => {
    expect(heroPillFor('open', false)).toBe('open');
  });

  // Nothing can change again, so a finished gameweek never goes red.
  test('a finished gameweek is finished, even if a later match is somehow live', () => {
    expect(heroPillFor('finished', true)).toBe('finished');
    expect(heroPillFor('finished', false)).toBe('finished');
  });
});
