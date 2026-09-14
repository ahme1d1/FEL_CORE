import { describe, expect, it, vi } from 'vitest';

import { plainReactivity } from './plainReactivity.js';
import {
  __recordCellReads,
  __resetReactivityForTests,
  cell,
  derive,
  installReactivity,
  type ReactivityAdapter,
} from './reactivity.js';

/** `test/setup.ts` installs `plainReactivity` before every test; these cases want the bare state. */
function withNoAdapter(): void {
  __resetReactivityForTests();
}

describe('creating a cell', () => {
  it('needs NO adapter — this is what lets a prerender evaluate the module graph', () => {
    withNoAdapter();
    expect(() => cell(false, 'x')).not.toThrow();
    expect(() => derive(() => 1, 'y')).not.toThrow();
  });

  it('binds lazily — an adapter installed AFTER creation still backs it', () => {
    withNoAdapter();
    const c = cell('late', 'x');
    installReactivity(plainReactivity);
    expect(c.value).toBe('late');
  });
});

describe('touching a cell with no adapter', () => {
  it('throws on read, naming what to install rather than returning a dead value', () => {
    withNoAdapter();
    const c = cell(false, 'referenceCache.hydrated');
    expect(() => c.value).toThrow(/no reactivity adapter installed/);
  });

  it('throws on write too', () => {
    withNoAdapter();
    const c = cell(0, 'x');
    expect(() => {
      c.value = 1;
    }).toThrow(/no reactivity adapter installed/);
  });
});

describe('a bound cell', () => {
  it('reads and writes through `.value`, the accessor 92 website call sites already use', () => {
    const c = cell<'ar' | 'en'>('ar', 'lang');
    expect(c.value).toBe('ar');
    c.value = 'en';
    expect(c.value).toBe('en');
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const c = cell(0, 'x');
    const seen = vi.fn();
    const off = c.subscribe(seen);
    c.value = 1;
    c.value = 2;
    off();
    c.value = 3;
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('does not notify when the value is unchanged', () => {
    const c = cell(1, 'x');
    const seen = vi.fn();
    c.subscribe(seen);
    c.value = 1;
    expect(seen).not.toHaveBeenCalled();
  });

  it('binds to the host ONCE, however many times it is touched', () => {
    let made = 0;
    const counting: ReactivityAdapter = {
      name: 'counting',
      cell: (initial) => {
        made += 1;
        return plainReactivity.cell(initial);
      },
      derive: plainReactivity.derive,
    };
    withNoAdapter();
    installReactivity(counting);
    const c = cell(0, 'x');
    c.value;
    c.value = 1;
    c.subscribe(() => {});
    expect(made).toBe(1);
  });
});

describe('derive', () => {
  it('tracks its source', () => {
    const managerId = cell<string | null>(null, 'session.managerId');
    const myMemberId = derive(() => managerId.value ?? '', 'leagues.myMemberId');
    expect(myMemberId.value).toBe('');
    managerId.value = 'm1';
    expect(myMemberId.value).toBe('m1');
  });
});

describe('installReactivity', () => {
  it('refuses a SECOND, different adapter — two adapters means two copies of the session', () => {
    withNoAdapter();
    installReactivity(plainReactivity);
    const other: ReactivityAdapter = { ...plainReactivity, name: 'vue' };
    expect(() => installReactivity(other)).toThrow(/already installed by "plain".*refusing "vue"/s);
  });

  it('is idempotent for the same adapter, so a double import is harmless', () => {
    withNoAdapter();
    installReactivity(plainReactivity);
    expect(() => installReactivity(plainReactivity)).not.toThrow();
  });
});

describe('__recordCellReads', () => {
  /**
   * The seam that makes `pByLive`'s `void hydrated.value` testable. That line registers a
   * dependency and discards the value, so it reads as dead code — and deleting it renders
   * «لاعب غير موجود» permanently on a deep-linked player. Nothing else can observe it.
   */
  it('records the debug name of every cell read, so an invisible dependency can be asserted', () => {
    const gate = cell(false, 'referenceCache.hydrated');
    const reads: string[] = [];
    __recordCellReads((n) => reads.push(n));
    void gate.value;
    __recordCellReads(null);
    void gate.value;
    expect(reads).toEqual(['referenceCache.hydrated']);
  });
});
