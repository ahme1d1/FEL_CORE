import { beforeEach } from 'vitest';

import { __resetApiClientConfigForTests } from '../src/client/platform/config.js';
import { __resetRulesForTests, __setRulesForTests } from '../src/client/api/rulesCache.js';
import { __recordCellReads, __resetReactivityForTests, installReactivity } from '../src/client/platform/reactivity.js';
import { plainReactivity } from '../src/client/platform/plainReactivity.js';

/**
 * Every client test starts from the same boot state a host would establish, minus the host.
 *
 * `plainReactivity` rather than a Vue adapter is the point: if these suites needed Vue, the client
 * half would not actually be portable and the package would be lying about it. The one thing plain
 * reactivity cannot model — Vue's ambient dependency collection — is covered on the consumer side
 * by FEL_WEBSITE's contract suite, and inside the package by `__recordCellReads`.
 *
 * The game's rule constants are SERVED, not compiled in — `GET /bootstrap` carries them and the
 * app-zone gate awaits that request before any route renders — so in production every consumer runs
 * with them in hand, and `rules()` throws rather than substituting a default. Installing them here
 * makes the suite match that, instead of thirty files each remembering their own `beforeEach`.
 * The COLD path is still tested: a suite that wants it calls `__resetRulesForTests()` in its own
 * body, which runs after this hook. (`adapters.test.ts` does exactly that, for the bootstrap
 * chicken-and-egg — the response that delivers the rules has to be parseable without them.)
 *
 * `test/` sits outside `files`, so none of this ships.
 */
beforeEach(() => {
  __recordCellReads(null);
  __resetReactivityForTests();
  __resetApiClientConfigForTests();
  installReactivity(plainReactivity);
  __resetRulesForTests();
  __setRulesForTests();
});
