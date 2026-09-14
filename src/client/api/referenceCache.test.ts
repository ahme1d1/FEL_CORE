import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Club } from '../data/clubs.js';
import type { Player } from '../data/players.js';

const listPlayersMock = vi.fn();
const getClubsMock = vi.fn();

vi.mock('./playersService.js', () => ({
  listPlayers: (...args: unknown[]) => listPlayersMock(...args),
}));
vi.mock('./clubsService.js', () => ({
  getClubs: (...args: unknown[]) => getClubsMock(...args),
}));

import { __recordCellReads } from '../platform/reactivity.js';

import {
  MARKET,
  __resetReferenceCacheForTests,
  __setReferenceDataForTests,
  clubByLive,
  hydrateReferenceCache,
  pBy,
  pByLive,
  playerRanking,
} from './referenceCache.js';

function mkPlayer(id: number, over: Partial<Player> = {}): Player {
  return {
    id,
    name: `P${id}`,
    club: 'AHL',
    pos: 'MID',
    price: 5,
    form: 1,
    total: 10,
    sel: 1,
    news: null,
    isActive: true,
    ...over,
  };
}

const CLUB = {
  id: 'AHL',
  name: 'a',
  short: 'a',
  nameEn: 'a',
  shortEn: 'a',
  color: '#000',
  ink: '#fff',
  kit: { pattern: 'plain', body: '#000', secondary: '#fff', sleeves: '#000', trim: '#fff' },
  emblem: 'eagle',
  city: 'c',
  cityEn: 'c',
  venue: 'v',
  venueEn: 'v',
} as unknown as Club;

describe('referenceCache — the market is not the reference set', () => {
  beforeEach(() => {
    listPlayersMock.mockReset();
    getClubsMock.mockReset();
  });

  /**
   * The 2026/27 roster rebuild delisted 170 players. Squads still holding one rendered SHORT —
   * `pBy()` missed, and every pitch component drops a tile whose player will not resolve. This
   * is the regression that must never come back: resolve everything, offer only the market.
   */
  it('resolves a delisted player by id but keeps them out of MARKET', async () => {
    listPlayersMock.mockResolvedValue({
      success: true,
      data: [mkPlayer(1), mkPlayer(2, { isActive: false }), mkPlayer(3)],
      error: null,
    });
    getClubsMock.mockResolvedValue({ success: true, data: [CLUB], error: null });

    await hydrateReferenceCache();

    expect(pBy(2)).toBeDefined();
    expect(pBy(2)?.isActive).toBe(false);
    expect(MARKET.map((p) => p.id)).toEqual([1, 3]);
  });

  it('hydrates with scope=all — the market read would leave owned ids unresolvable', async () => {
    listPlayersMock.mockResolvedValue({ success: true, data: [mkPlayer(1)], error: null });
    getClubsMock.mockResolvedValue({ success: true, data: [CLUB], error: null });

    await hydrateReferenceCache();

    expect(listPlayersMock).toHaveBeenCalledWith({ scope: 'all' });
  });

  it('ranks within the market, so delisted players do not pad the denominator', () => {
    __setReferenceDataForTests(
      [
        mkPlayer(1, { total: 30 }),
        mkPlayer(2, { total: 20 }),
        mkPlayer(3, { total: 25, isActive: false }),
      ],
      [CLUB],
    );

    // Market MIDs are ids 1 and 2 only; the delisted id 3 would otherwise sit between them.
    expect(playerRanking(1, 'total')).toEqual({ rank: 1, total: 2 });
    expect(playerRanking(2, 'total')).toEqual({ rank: 2, total: 2 });
  });

  // "0 / 124" on a delisted player's sheet reads as dead last, not as not-applicable.
  it('gives a delisted player no rank at all rather than a rank of zero', () => {
    __setReferenceDataForTests(
      [mkPlayer(1, { total: 30 }), mkPlayer(2, { total: 20 }), mkPlayer(3, { total: 25, isActive: false })],
      [CLUB],
    );

    expect(playerRanking(3, 'total')).toEqual({ rank: 0, total: 0 });
  });

  // The test seam has to behave like production, or suites pass against a cache shape that
  // cannot occur — which is how the market/reference conflation stayed invisible.
  it('the test seam derives MARKET the same way hydration does', () => {
    __setReferenceDataForTests([mkPlayer(1), mkPlayer(2, { isActive: false })], [CLUB]);

    expect(pBy(2)).toBeDefined();
    expect(MARKET.map((p) => p.id)).toEqual([1]);
  });
});

/**
 * The reference cache holds its data in plain module-scoped Maps, which no framework can track.
 * Only the `hydrated` gate is a tracked cell. A memoising computed that calls `pBy()` therefore has
 * NO dependency on hydration: on a cold load it evaluates to `undefined`, caches, and is never
 * invalidated when the data lands.
 *
 * That is not theoretical. `/app/...?overlay=playerProfile&playerId=N` opened cold rendered «لاعب
 * غير موجود» permanently, because `AppOverlayHost` mounts the profile at boot while hydration is
 * still in flight. The module doc used to claim no consumer's computed could run before hydration
 * opened — true for pages, which gate on a `ready` flag, and false for every always-mounted
 * overlay.
 *
 * ## What is asserted where
 *
 * The FIX is `void hydrated.value` inside `pByLive`/`clubByLive`: a read whose value is discarded,
 * whose only job is to register a dependency with whatever effect the host has active. It reads as
 * dead code, and deleting it is silent.
 *
 * These suites run on `plainReactivity`, which has no ambient effect to register with — so they can
 * prove the read HAPPENS (`__recordCellReads`) but not that a Vue `computed` re-runs because of it.
 * The other half is asserted where a framework actually exists: `FEL_WEBSITE`'s
 * `tests/unit/core-contract.test.ts` drives real `computed`s through the INSTALLED package, which
 * is also the only place that can catch the adapter being wired up wrong.
 */
describe('reactive reference lookups', () => {
  beforeEach(() => {
    __resetReferenceCacheForTests();
  });

  it('pByLive touches the hydration gate — the dependency the whole fix consists of', () => {
    const reads: string[] = [];
    __recordCellReads((name) => reads.push(name));
    pByLive(7);
    __recordCellReads(null);

    expect(reads).toContain('referenceCache.hydrated');
  });

  it('clubByLive touches it too', () => {
    const reads: string[] = [];
    __recordCellReads((name) => reads.push(name));
    clubByLive('AHL');
    __recordCellReads(null);

    expect(reads).toContain('referenceCache.hydrated');
  });

  it('pBy does NOT touch it — the asymmetry is the point, and why both exist', () => {
    const reads: string[] = [];
    __recordCellReads((name) => reads.push(name));
    pBy(7);
    __recordCellReads(null);

    expect(reads).not.toContain('referenceCache.hydrated');
  });

  it('resolves through the live lookups once the cache hydrates', () => {
    expect(pByLive(7)).toBeUndefined();
    expect(clubByLive('AHL')).toBeUndefined();

    __setReferenceDataForTests([mkPlayer(7)], [CLUB]);

    expect(pByLive(7)?.id).toBe(7);
    expect(clubByLive('AHL')?.id).toBe('AHL');
  });

  // The overlay passes `props.playerId`, which is undefined until the route query is read.
  it('treats a null or undefined id as "no player" without throwing', () => {
    __setReferenceDataForTests([mkPlayer(7)], [CLUB]);

    expect(pByLive(null)).toBeUndefined();
    expect(pByLive(undefined)).toBeUndefined();
    expect(clubByLive(null)).toBeUndefined();
  });

  // A player who genuinely is not in the cache must still resolve to "not found" AFTER hydration,
  // or the profile would sit on a skeleton forever instead of saying so.
  it('still reports an unknown player as missing once hydrated', () => {
    __setReferenceDataForTests([mkPlayer(7)], [CLUB]);

    expect(pByLive(999)).toBeUndefined();
  });
});
