/**
 * The reactive seam — the one piece of framework the client half cannot do without.
 *
 * The extracted services hold exactly **five** pieces of reactive state that cross the module
 * boundary (`session.hydrated`, `session.managerId`, `referenceCache.hydrated`,
 * `referenceCache.hydrationError`, `rulesCache.hydrated`), two module-private ones
 * (`session`'s access and refresh tokens) and two derived values (`session.hasSession`,
 * `leaguesService.myMemberId`). Nine in total. Everything else in the package is a pure function or
 * a plain module `let`. So rather than depend on a framework, the package declares the smallest
 * interface those nine need and each host supplies it: Vue passes `shallowRef`/`computed`, React
 * will pass something `useSyncExternalStore` can drive. **The package keeps zero runtime
 * dependencies, and that is what makes it installable from git into Node, Vite and Metro alike.**
 *
 * `subscribe` is on the interface from day one even though Vue barely needs it. Vue collects
 * dependencies implicitly — `referenceCache.pByLive()` reads its hydration gate purely to register
 * one, throwing the value away — and React has no such mechanism. Designing the explicit seam after
 * the fact is how two adapters end up disagreeing.
 */

/** A value the package owns and the host framework tracks. */
export interface Cell<T> {
  value: T;
  /** For explicit-subscription hosts (React `useSyncExternalStore`). Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** A read-only value derived from cells. */
export interface Derived<T> {
  readonly value: T;
  subscribe(listener: () => void): () => void;
}

/**
 * The host's side of a cell.
 *
 * ⚠️ `get()` MUST perform the host's dependency-registering read (Vue: a bare `r.value`) with **no
 * memoisation**. It is called from inside the package — `pByLive()`'s `void hydrated.value` — so the
 * read has to land in whatever effect the host currently has active. A cache here would sever
 * exactly the dependency this seam exists to create.
 */
export interface HostCell<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

export interface HostDerived<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface ReactivityAdapter {
  /** Named so a double-install can say which host got there first. */
  readonly name: string;
  cell<T>(initial: T): HostCell<T>;
  derive<T>(compute: () => T): HostDerived<T>;
}

/**
 * The adapter slot lives on `globalThis`, not in module scope, because it is process-scoped HOST
 * configuration rather than per-module state.
 *
 * The case that forces it: three suites call `vi.resetModules()` and re-import `session`/`rulesCache`
 * to exercise their COLD paths. That hands them a fresh copy of this module too — and a
 * module-scoped slot would be empty, so every cell touch would throw even though the host is
 * perfectly well installed. The cells themselves are deliberately NOT global: a suite asking for a
 * cold module must get cold state, which is the whole point of resetting.
 *
 * The double-install guard therefore keys on the adapter's NAME rather than its identity — after a
 * module reset the same adapter is a different object, and refusing that would be refusing nothing
 * real. Two different hosts in one process is what it is there to catch.
 */
const SLOT = Symbol.for('@fel/core/client:reactivity');
type Slot = { [SLOT]?: ReactivityAdapter | null };

function slot(): Slot {
  return globalThis as unknown as Slot;
}

export function installReactivity(next: ReactivityAdapter): void {
  const current = slot()[SLOT];
  if (current && current.name !== next.name) {
    throw new Error(
      `@fel/core/client: reactivity already installed by "${current.name}"; refusing "${next.name}". ` +
        'Two adapters means two copies of the session, reference and rules state — a signed-in ' +
        'manager on one and a signed-out one on the other.',
    );
  }
  slot()[SLOT] = next;
}

/** Test seam. */
export function __resetReactivityForTests(): void {
  slot()[SLOT] = null;
}

function host(): ReactivityAdapter {
  const adapter = slot()[SLOT];
  if (!adapter) {
    throw new Error(
      '@fel/core/client: no reactivity adapter installed. Import the host adapter module before ' +
        'reading any package state (FEL_WEBSITE: `app/core/vue-reactivity.ts`, wired through the ' +
        'universal plugin `app/plugins/00.core-runtime.ts`). A consumer that renders nothing can ' +
        'install `plainReactivity`.',
    );
  }
  return adapter;
}

/**
 * Records the debug name of every cell READ.
 *
 * This exists to make one specific dependency testable: `pByLive()`/`clubByLive()` read the
 * hydration gate and discard the value, purely so a host's effect tracker registers the edge. That
 * read looks like dead code — `void hydrated.value` — and deleting it is a silent regression that
 * renders «لاعب غير موجود» for ever on a deep-linked player. Nothing else can observe it, so
 * without this seam the package cannot guard its own most fragile line.
 */
let readSink: ((name: string) => void) | null = null;
export function __recordCellReads(sink: ((name: string) => void) | null): void {
  readSink = sink;
}

/**
 * `cell()` and `derive()` are LAZY, and that is load-bearing rather than a micro-optimisation.
 *
 * Both are called at module-evaluation time (`export const hydrated = cell(false, …)`), which
 * happens on first import — before any host has had a chance to install an adapter. Binding at
 * creation would make every consumer's import order a correctness question. Binding at first
 * read/write means importing the package is always free, and only *using* it needs a host.
 *
 * A touch with no adapter **throws** rather than falling back to a plain non-reactive cell. A
 * fallback would render once with the pre-hydration value and never update — silent, and wrong
 * exactly when it matters. Same argument `rulesCache.rules()` already makes about rule values.
 */
class LazyCell<T> implements Cell<T> {
  private bound: HostCell<T> | null = null;

  constructor(
    private readonly seed: T,
    private readonly name: string,
  ) {}

  private bind(): HostCell<T> {
    if (!this.bound) this.bound = host().cell(this.seed);
    return this.bound;
  }

  get value(): T {
    readSink?.(this.name);
    return this.bind().get();
  }

  set value(next: T) {
    this.bind().set(next);
  }

  subscribe(listener: () => void): () => void {
    return this.bind().subscribe(listener);
  }
}

class LazyDerived<T> implements Derived<T> {
  private bound: HostDerived<T> | null = null;

  constructor(
    private readonly compute: () => T,
    private readonly name: string,
  ) {}

  private bind(): HostDerived<T> {
    if (!this.bound) this.bound = host().derive(this.compute);
    return this.bound;
  }

  get value(): T {
    readSink?.(this.name);
    return this.bind().get();
  }

  subscribe(listener: () => void): () => void {
    return this.bind().subscribe(listener);
  }
}

/** `ref()`'s replacement. Creating one costs nothing and needs no adapter. */
export function cell<T>(initial: T, debugName: string): Cell<T> {
  return new LazyCell(initial, debugName);
}

/** `computed()`'s replacement. `compute` must be pure — a React adapter may re-run it per read. */
export function derive<T>(compute: () => T, debugName: string): Derived<T> {
  return new LazyDerived(compute, debugName);
}
