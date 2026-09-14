import { describe, expect, test } from 'vitest';

import type { Fixture } from '../data/fixtures.js';

import { matchWindowMs, fixtureState, hasScoreline } from './fixtureResult.js';

const fx = (over: Partial<Fixture> = {}): Fixture =>
  ({ home: 'WDY', away: 'ZED', koOffsetMin: 0, tv: '', venue: '', boost: false, ...over }) as Fixture;

describe('fixtureState', () => {
  test('is scheduled before kickoff', () => {
    expect(fixtureState(fx({ status: 'SCHEDULED' }))).toBe('scheduled');
  });

  test('is finished once the status and both scores are present', () => {
    expect(fixtureState(fx({ status: 'FINISHED', homeScore: 0, awayScore: 0 }))).toBe('finished');
  });

  test('is live for an in-progress match carrying a scoreline', () => {
    expect(fixtureState(fx({ status: 'LIVE', homeScore: 1, awayScore: 0 }))).toBe('live');
  });

  // An admin can flip a fixture to FINISHED without filling the boxes in — the
  // score inputs send `undefined` when left blank. Rendering "undefined - undefined"
  // is worse than falling back to the kickoff time.
  test('falls back to scheduled when marked finished with no scores', () => {
    expect(fixtureState(fx({ status: 'FINISHED' }))).toBe('scheduled');
  });

  test('falls back to scheduled when only one side has a score', () => {
    expect(fixtureState(fx({ status: 'FINISHED', homeScore: 2 }))).toBe('scheduled');
  });

  test('treats a postponed fixture as scheduled', () => {
    expect(fixtureState(fx({ status: 'POSTPONED' }))).toBe('scheduled');
  });

  test('treats a fixture with no status at all as scheduled', () => {
    expect(fixtureState(fx())).toBe('scheduled');
  });
});

describe('hasScoreline', () => {
  test('accepts a goalless draw rather than treating 0 as missing', () => {
    expect(hasScoreline(fx({ homeScore: 0, awayScore: 0 }))).toBe(true);
  });

  test('rejects an explicit null from the wire', () => {
    expect(hasScoreline(fx({ homeScore: null, awayScore: null }))).toBe(false);
  });
});

/**
 * The live branch used to require `status === 'LIVE'`, and nothing in FEL_API ever writes it —
 * an admin enters the result after the final whistle. So the branch was unreachable in
 * production and a match being played right now rendered as "scheduled" with a kickoff time,
 * on every fixture surface in the app. Liveness is derived from the clock instead.
 */
describe('fixtureState — the derived in-play window', () => {
  const KO = Date.parse('2026-08-27T14:00:00.000Z');
  const kicking = (over: Partial<Fixture> = {}) =>
    fx({ status: 'SCHEDULED', kickoffAt: new Date(KO).toISOString(), ...over });

  test('is scheduled a minute before kickoff', () => {
    expect(fixtureState(kicking(), KO - 60_000)).toBe('scheduled');
  });

  test('is live from kickoff until the window closes', () => {
    expect(fixtureState(kicking(), KO + 1)).toBe('live');
    expect(fixtureState(kicking(), KO + matchWindowMs() - 1)).toBe('live');
  });

  test('stops being live once the window closes, with no result entered', () => {
    expect(fixtureState(kicking(), KO + matchWindowMs())).toBe('scheduled');
  });

  // An entered result is the authoritative end signal and must beat the clock.
  test('is finished the moment a scoreline lands, even mid-window', () => {
    const done = kicking({ status: 'FINISHED', homeScore: 2, awayScore: 1 });
    expect(fixtureState(done, KO + 60_000)).toBe('finished');
  });

  test('honours an explicit LIVE status past the window', () => {
    expect(fixtureState(kicking({ status: 'LIVE' }), KO + matchWindowMs() + 60_000)).toBe('live');
  });

  // A postponed fixture keeps a kickoff time that will never happen.
  test('never goes live for a postponed fixture', () => {
    expect(fixtureState(kicking({ status: 'POSTPONED' }), KO + 60_000)).toBe('scheduled');
  });
});
