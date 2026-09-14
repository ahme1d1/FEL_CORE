import { beforeEach } from 'vitest';

import { __resetApiClientConfigForTests } from '../src/client/platform/config.js';
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
 * `test/` sits outside `files`, so none of this ships.
 */
beforeEach(() => {
  __recordCellReads(null);
  __resetReactivityForTests();
  __resetApiClientConfigForTests();
  installReactivity(plainReactivity);
});
