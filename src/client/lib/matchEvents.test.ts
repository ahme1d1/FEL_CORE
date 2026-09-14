import { describe, expect, it } from 'vitest';
import { buildMatchSections } from './matchEvents.js';

const SIDES = { home: 'ITT', away: 'ZAM' };
import type { MatchEventRow } from '../api/fixturesService.js';

function player(name: string, stats: Partial<MatchEventRow> = {}): MatchEventRow {
  return {
    id: name.length,
    name,
    club: 'ZAM',
    pos: 'MID',
    minutes: 90,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    yellow: 0,
    red: 0,
    penSaved: 0,
    penMissed: 0,
    bonus: 0,
    defconPoints: 0,
    defconActions: 0,
    bps: 0,
    ...stats,
  };
}

describe('buildMatchSections', () => {
  it('drops sections with nothing in them rather than rendering them empty', () => {
    // The real GW1 ZAM–ITT: 0–0, so bonus is the only thing that happened.
    const sections = buildMatchSections([
      player('El Wench', { bonus: 2 }),
      player('Shehata', { bonus: 3 }),
    ], SIDES);

    expect(sections.map((s) => s.kind)).toEqual(['bonus']);
  });

  it('returns no sections at all when nobody did anything', () => {
    expect(buildMatchSections([], SIDES)).toEqual([]);
    expect(buildMatchSections([player('Anonymous')], SIDES)).toEqual([]);
  });

  it('orders sections goals, assists, yellow, red, penalties, bonus', () => {
    const sections = buildMatchSections(
      [
        player('a', { bonus: 1 }),
        player('b', { penMissed: 1 }),
        player('c', { yellow: 1 }),
        player('c2', { red: 1 }),
        player('d', { assists: 1 }),
        player('e', { goals: 1 }),
      ],
      SIDES,
    );

    expect(sections.map((s) => s.kind)).toEqual([
      'goals',
      'assists',
      'yellow',
      'red',
      'penalties',
      'bonus',
    ]);
  });

  it('puts an own goal in the conceding club column, tagged, not the side it counted for', () => {
    const sections = buildMatchSections(
      [player('Own goaler', { ownGoals: 1, club: 'ITT' }), player('Scorer', { goals: 1 })],
      SIDES,
    );

    const goals = sections.find((s) => s.kind === 'goals');
    // Column position is what says which team, so an own goal must not sit under the side that
    // benefited from it — the tag is what explains where the goal actually went.
    expect(goals?.away.map((e) => [e.player.name, e.tag])).toEqual([['Scorer', null]]);
    expect(goals?.home.map((e) => [e.player.name, e.tag])).toEqual([['Own goaler', 'ownGoal']]);
  });

  it('never files a player who belongs to neither side into one of the two columns', () => {
    // Reachable: the API also returns rows explicitly tagged with this fixture, and a player who
    // changed clubs after the match reads as a third club. Guessing a column would misattribute
    // a goal.
    const sections = buildMatchSections([player('Transferred', { goals: 1, club: 'AHL' })], SIDES);

    const goals = sections.find((s) => s.kind === 'goals');
    expect(goals?.away).toEqual([]);
    expect(goals?.home).toEqual([]);
    expect(goals?.other.map((e) => e.player.name)).toEqual(['Transferred']);
  });

  it('keeps own goals after real goals within the same column', () => {
    const sections = buildMatchSections(
      [player('Own goaler', { ownGoals: 1 }), player('Scorer', { goals: 1 })],
      SIDES,
    );

    expect(sections[0]?.away.map((e) => e.tag)).toEqual([null, 'ownGoal']);
  });

  it('sorts bonus 3 then 2 then 1', () => {
    const sections = buildMatchSections([
      player('one', { bonus: 1 }),
      player('three', { bonus: 3 }),
      player('two', { bonus: 2 }),
    ], SIDES);

    expect(sections[0]?.away.map((e) => e.player.name)).toEqual(['three', 'two', 'one']);
  });

  it('sorts goals and assists by count, most first', () => {
    const sections = buildMatchSections([
      player('single', { goals: 1, assists: 1 }),
      player('brace', { goals: 2, assists: 3 }),
    ], SIDES);

    expect(sections[0]?.away.map((e) => [e.player.name, e.count])).toEqual([
      ['brace', 2],
      ['single', 1],
    ]);
    expect(sections[1]?.away.map((e) => [e.player.name, e.count])).toEqual([
      ['brace', 3],
      ['single', 1],
    ]);
  });

  it('lists a second-yellow sending-off under both headings, which is how it happened', () => {
    const sections = buildMatchSections(
      [player('booked', { yellow: 1 }), player('sent off', { yellow: 1, red: 1 })],
      SIDES,
    );

    const yellow = sections.find((s) => s.kind === 'yellow');
    const red = sections.find((s) => s.kind === 'red');
    expect(yellow?.away.map((e) => e.player.name)).toEqual(['booked', 'sent off']);
    expect(red?.away.map((e) => e.player.name)).toEqual(['sent off']);
  });

  it('gives a booking no tag — the section heading is the card', () => {
    const sections = buildMatchSections([player('booked', { yellow: 1 })], SIDES);

    expect(sections[0]?.away.map((e) => e.tag)).toEqual([null]);
  });

  it('tags saved and missed penalties apart, saved first', () => {
    const sections = buildMatchSections([
      player('missed it', { penMissed: 1 }),
      player('keeper', { penSaved: 1, pos: 'GK' }),
    ], SIDES);

    expect(sections[0]?.away.map((e) => e.tag)).toEqual(['penSaved', 'penMissed']);
  });

  it('orders the three award sections as FPL does: bonus, then BPS, then defensive work', () => {
    const sections = buildMatchSections(
      [
        player('Sayed', { club: 'ZAM', goals: 1 }),
        player('Nashaat', { club: 'ZAM', defconActions: 11 }),
        player('Shehata', { club: 'ZAM', bonus: 3, bps: 40 }),
      ],
      SIDES,
    );

    // Reading down, each section explains the one above it: the points, the score that decided
    // them, and the defensive work feeding that score.
    expect(sections.map((s) => s.kind)).toEqual(['goals', 'bonus', 'bps', 'defcon']);
  });

  it('lists defensive contribution on actions, not on the flat award', () => {
    // The award is the same 2 for everyone who cleared the bar, so it ranks nobody. Sorting and
    // listing on actions is also why a player who fell short still appears — as FPL's panel does.
    const sections = buildMatchSections(
      [
        player('Marei', { defconActions: 9, defconPoints: 0 }),
        player('Khashab', { defconActions: 14, defconPoints: 2 }),
      ],
      SIDES,
    );

    const defcon = sections.find((s) => s.kind === 'defcon');
    expect(defcon?.away.map((e) => [e.player.name, e.count])).toEqual([
      ['Khashab', 14],
      ['Marei', 9],
    ]);
  });

  it('lists BPS highest first, so the near-misses are visible under the top three', () => {
    const sections = buildMatchSections(
      [player('Low', { bps: 18 }), player('High', { bps: 41 }), player('Mid', { bps: 33 })],
      SIDES,
    );

    const bps = sections.find((s) => s.kind === 'bps');
    expect(bps?.away.map((e) => e.count)).toEqual([41, 33, 18]);
  });

  it('drops both award sections when the fixture was never pulled from the provider', () => {
    // Every stats field reads 0 in that case, which must mean "no section", not "a section of
    // zeroes" — the fields are 0 rather than null precisely so nothing downstream has to branch.
    const sections = buildMatchSections([player('Okka', { goals: 1 })], SIDES);
    expect(sections.map((s) => s.kind)).toEqual(['goals']);
  });

  it('survives an API that does not send the two stats fields yet', () => {
    // The deploy order is web-first: this build ships before the API that adds `defconActions` and
    // `bps`, so for a while every payload arrives without them. `undefined > 0` is false, so both
    // sections drop out — the sheet is the one it was before, not a broken one.
    const legacy = { ...player('Shehata', { goals: 1 }) } as Partial<MatchEventRow>;
    delete legacy.defconActions;
    delete legacy.bps;

    const sections = buildMatchSections([legacy as MatchEventRow], SIDES);

    expect(sections.map((s) => s.kind)).toEqual(['goals']);
  });

  it('drops the Saves section until the API sends the field', () => {
    // `saves` is optional on the row on purpose: the column is real and `team-of-week` already
    // reads it, but `GET /fixtures/:id/events` does not serialize it — its own comment calls
    // saves a scoring counter rather than a match-report event. So every payload today lands
    // here without it, `(undefined ?? 0) > 0` is false, and the section drops out exactly the way
    // `defconActions`/`bps` did before their deploy. It lights up with no client change.
    const sections = buildMatchSections([player('Shehata', { goals: 1 })], SIDES);

    expect(sections.map((s) => s.kind)).toEqual(['goals']);
  });

  it('lists saves once the field arrives, above the award sections', () => {
    const keeper = { ...player('El Shenawy', {}), saves: 5 } as MatchEventRow;
    const scorer = { ...player('Afsha', { goals: 1, bonus: 3 }) } as MatchEventRow;

    const sections = buildMatchSections([keeper, scorer], SIDES);

    // A save happened on the pitch, so it sits with the pitch events — before bonus, which is an
    // award, and before the two sections that explain that award.
    expect(sections.map((s) => s.kind)).toEqual(['goals', 'saves', 'bonus']);
    // The helper's default club is ZAM, which `SIDES` makes the AWAY side.
    expect(sections.find((s) => s.kind === 'saves')!.away).toEqual([
      { player: keeper, count: 5, tag: null },
    ]);
  });

  it('does not mutate the rows it was given', () => {
    const rows = [player('b', { goals: 1 }), player('a', { goals: 2 })];
    const before = [...rows];

    buildMatchSections(rows, SIDES);

    expect(rows).toEqual(before);
  });
});
