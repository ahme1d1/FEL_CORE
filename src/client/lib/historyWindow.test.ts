import { describe, expect, test } from 'vitest';

import { historyGameweeks, historyRowsToShow } from './historyWindow.js';

describe('historyGameweeks', () => {
  test('includes the gameweek being played', () => {
    // Arrange — GW4 is live: past its deadline, before `liveEndAt`.
    const displayGW = 4;

    // Act
    const gws = historyGameweeks(displayGW, 'live');

    // Assert — this is the regression. It used to stop at 3, so the round in
    // flight was missing from the profile while it was the only one anyone was
    // looking at.
    expect(gws).toEqual([1, 2, 3, 4]);
  });

  test('includes a finished gameweek', () => {
    expect(historyGameweeks(4, 'finished')).toEqual([1, 2, 3, 4]);
  });

  test('stops one short while the next gameweek is only open', () => {
    // No deadline has passed, so GW4 has no results of any kind to show.
    expect(historyGameweeks(4, 'open')).toEqual([1, 2, 3]);
  });

  test('stops one short while locked, before the first kickoff', () => {
    // The deadline has passed but no ball has been kicked. Every figure would be
    // zero, and the profile renders a zero-minute row as «لم يشارك في الجولة».
    expect(historyGameweeks(4, 'locked')).toEqual([1, 2, 3]);
  });

  test('returns nothing before the first gameweek has been played', () => {
    // `displayGW - 1` is 0 here and would be -1 at worst; `new Array(-1)` throws
    // `RangeError` in a production build, so the floor is load-bearing.
    expect(historyGameweeks(1, 'open')).toEqual([]);
    expect(historyGameweeks(0, 'open')).toEqual([]);
  });

  test('a live first gameweek shows exactly itself', () => {
    expect(historyGameweeks(1, 'live')).toEqual([1]);
  });
});

describe('historyRowsToShow', () => {
  const rows = [1, 2, 3, 4].map((gw) => ({ events: { gw } }));

  test('keeps the live row once the player’s own match has finished', () => {
    // Arrange — GW4 is live and this player's fixture is over: أحمد متعب, 90', an assist.
    // Act
    const shown = historyRowsToShow(rows, 4, 'FINISHED');
    // Assert
    expect(shown.map((r) => r.events.gw)).toEqual([1, 2, 3, 4]);
  });

  test('keeps the live row while his match is still being played', () => {
    expect(historyRowsToShow(rows, 4, 'LIVE').map((r) => r.events.gw)).toEqual([1, 2, 3, 4]);
  });

  test('withholds it while his own match has not kicked off', () => {
    // The gameweek is live because SOMEONE kicked off, but this club plays in two days.
    // A zero row here renders as «لم يشارك في الجولة» — a claim about an unplayed match.
    expect(historyRowsToShow(rows, 4, 'SCHEDULED').map((r) => r.events.gw)).toEqual([1, 2, 3]);
  });

  test('withholds it when the fixture is unknown or the read was refused', () => {
    expect(historyRowsToShow(rows, 4, undefined).map((r) => r.events.gw)).toEqual([1, 2, 3]);
  });

  test('leaves a settled or unstarted gameweek list untouched', () => {
    expect(historyRowsToShow(rows, null, undefined).map((r) => r.events.gw)).toEqual([1, 2, 3, 4]);
  });
});
