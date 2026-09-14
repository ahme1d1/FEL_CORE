import { describe, it, expect } from 'vitest';
import { availabilityKey, availabilityOf, isUnavailable, reasonOf } from './availability.js';
import type { Player } from '../data/players.js';

const P = (over: Partial<Player> = {}): Player => ({
  id: 1,
  name: 'إسلام عيسى',
  club: 'CRA',
  pos: 'MID',
  price: 9,
  form: 0,
  total: 0,
  sel: 1.5,
  isActive: true,
  ...over,
});

describe('availabilityOf', () => {
  it('maps each status to a severity', () => {
    expect(availabilityOf(P({ newsStatus: 'INJURED' }))).toBe('out');
    expect(availabilityOf(P({ newsStatus: 'SUSPENDED' }))).toBe('out');
    expect(availabilityOf(P({ newsStatus: 'DOUBTFUL' }))).toBe('doubtful');
    expect(availabilityOf(P({ newsStatus: 'AVAILABLE' }))).toBe('available');
  });

  // `news` is display copy for managers, in whatever words an admin likes. Parsing it was the
  // original defect and it failed both ways: it missed a ruled-out player whose note was blank,
  // and «مشكوك في جاهزيته» contains «جاهز», so a fit-check cleared an explicitly flagged player.
  it('ignores the news text entirely, however alarming it reads', () => {
    expect(availabilityOf(P({ news: 'إصابة في الركبة' }))).toBe('available');
    expect(availabilityOf(P({ news: 'مشكوك في جاهزيته' }))).toBe('available');
  });

  it('reads the status even when the news says the opposite', () => {
    expect(availabilityOf(P({ news: 'جاهز تماماً', newsStatus: 'INJURED' }))).toBe('out');
    expect(availabilityOf(P({ news: 'إصابة خطيرة', newsStatus: 'AVAILABLE' }))).toBe('available');
  });

  it('is available when nothing at all is recorded', () => {
    expect(availabilityOf(P())).toBe('available');
    expect(availabilityOf(P({ news: null, newsStatus: null }))).toBe('available');
  });

  // A delisted player can't be picked and shouldn't read as fit.
  it('marks a delisted player out', () => {
    expect(availabilityOf(P({ isActive: false }))).toBe('out');
  });
});

describe('isUnavailable', () => {
  // The old visibility gate was `!!player.news`, which is why a player flagged purely by status
  // or percentage showed no dot on the pitch, no dot in transfers and no banner in any sheet.
  it('flags a player whose news is blank but whose status says otherwise', () => {
    expect(isUnavailable(P({ news: null, newsStatus: 'INJURED' }))).toBe(true);
    expect(isUnavailable(P({ news: null, newsStatus: 'SUSPENDED' }))).toBe(true);
  });

  it('does not flag a fit player just because someone wrote a note about him', () => {
    expect(isUnavailable(P({ news: 'شارك في التدريب الجماعي' }))).toBe(false);
  });

  it('does not flag a fit player', () => {
    expect(isUnavailable(P())).toBe(false);
  });
});

describe('reasonOf / availabilityKey', () => {
  // Reading the label off severity called a suspension an injury: SUSPENDED is 'out', and 'out'
  // was hardcoded to the injury string. Reason and severity are separate questions.
  it('labels a suspended player suspended, not injured', () => {
    expect(reasonOf(P({ newsStatus: 'SUSPENDED' }))).toBe('suspended');
    expect(availabilityKey(P({ newsStatus: 'SUSPENDED' }))).toBe('squad.news.suspended');
  });

  it('labels an injured player injured', () => {
    expect(availabilityKey(P({ newsStatus: 'INJURED' }))).toBe('squad.news.injury');
  });

  it('labels a delisted player delisted, ahead of any status', () => {
    expect(availabilityKey(P({ isActive: false, newsStatus: 'INJURED' }))).toBe(
      'squad.news.delisted'
    );
  });

  it('has no reason for a fit player', () => {
    expect(reasonOf(P())).toBeNull();
  });
});
