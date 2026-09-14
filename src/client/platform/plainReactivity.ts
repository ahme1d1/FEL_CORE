import type { ReactivityAdapter } from './reactivity.js';

/**
 * A reactivity adapter with no dependency tracking.
 *
 * For consumers that read package state but render nothing — node scripts, tools, and the package's
 * own suite, which must pass with **no framework installed** because that is the extraction's whole
 * claim. `subscribe` is real (a listener set), so anything driven by explicit subscription works;
 * only the ambient collection a Vue `computed` relies on is absent, and nothing here has one.
 */
export const plainReactivity: ReactivityAdapter = {
  name: 'plain',
  cell<T>(initial: T) {
    let current = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => current,
      set: (next: T) => {
        if (Object.is(current, next)) return;
        current = next;
        for (const listener of [...listeners]) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  },
  derive<T>(compute: () => T) {
    const listeners = new Set<() => void>();
    return {
      get: compute,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  },
};
