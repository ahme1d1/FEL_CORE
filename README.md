# FEL_CORE — `@fel/core`

Shared Fantasy EG code, so a rule has one definition across three clients: `FEL_API` (NestJS),
`FEL_WEBSITE` (Nuxt) and `FEL_APP` (Expo).

Two entry points.

| Entry point | Holds | Consumed by | Format |
|---|---|---|---|
| `@fel/core/rules` | Squad validation: `validateSquad`, `isValidXI`, `countByPosition`, the rule constants and the engine's type vocabulary | `FEL_API` | CommonJS |
| `@fel/core/client` | The transport (`apiFetch` and its 401→refresh→retry), the seventeen service modules, the envelope adapters, the five error maps, the reference/rules/session caches, the fantasy vocabulary in `lib/`, and the reference data types | `FEL_WEBSITE` (and `FEL_APP`, when it is built) | **ESM** |

Deep subpaths are exported too — `@fel/core/client/api/session`, `@fel/core/client/lib/fmt`,
`@fel/core/client/data/chips`. Three modules under `/client` export a symbol named `hydrated`, so a
single flat barrel cannot hold everything; most consumers import the subpath.

### `/client` needs a host, and says so

The client half carries **no framework and no browser**. Three things are injected:

```ts
import { installReactivity, configureApiClient } from '@fel/core/client';

installReactivity(vueReactivity);     // or a React/useSyncExternalStore adapter, or `plainReactivity`
configureApiClient({
  apiBase, fetcher, storage, getLang, // `fetcher` must be ofetch-shaped — see below
  onExternalStorageChange,            // optional: web has tabs, a phone does not
});
```

`installReactivity` is separate from `configureApiClient` because it is needed at first **read**,
while everything else is needed at first **call**. Reading a value with no adapter installed
**throws**, rather than returning something that renders once and never updates.

`fetcher` must **reject** on a non-2xx with `status` and the parsed `data` — ofetch's contract.
`apiFetch`'s 401→refresh→retry reads exactly those two fields, so a bare `fetch()` (which resolves
on 4xx and carries neither) would turn every API error into a network failure and silently disable
the refresh flow.

### Why `/client` is ESM and `/rules` is CommonJS

`referenceCache` exports `let MARKET` / `let CLUBS` and reassigns them on hydration, relying on ES
live bindings. **Node's CJS→ESM interop copies named exports once, at evaluation** — so through a
CommonJS build a consumer holds `[]` for ever while the module's own reads see the data. Measured
twice, before and after the extraction. `FEL_WEBSITE` prerenders `pages/contact.vue`, which pulls
the whole services barrel through Nitro's Node loader, so this is the live production path and not a
hypothetical.

Dual CJS+ESM output was rejected: these modules hold **singleton state**, so two copies in one
process means a signed-in manager on one and a signed-out one on the other. Every `/client` consumer
resolves `import` anyway.

`dist/client/package.json` is a generated `{"type":"module"}` marker — Node picks a file's format
from the nearest `package.json`, so that one file scopes ESM to the client subtree and leaves
`dist/rules` CommonJS for `FEL_API`. It is written by `scripts/emit-esm-marker.mjs` on every build;
`tsc` cannot emit it, and without it Node throws *Cannot use import statement outside a module*
during the consumer's prerender.

Relative imports inside `src/client` carry explicit `.js` extensions. That is what lets plain `tsc`
emit ESM that Node can resolve, with no bundler in the path.

### `/client` does not name its own dictionary keys' text

The dictionaries live in `FEL_WEBSITE`, because 430 of their 1,170 keys are marketing copy a phone
never renders. So each module names the **keys** it emits as a literal union — mostly derived from
the table that produces them — and `CoreMessageKey` collects all nine sources. The consumer asserts
those are a subset of its own `Key`; `FEL_WEBSITE/app/types/core-i18n-contract.ts` is that
assertion, and it names the missing keys in the compile error.

## What is deliberately not here

Scoring, BPS, auto-subs, gameweek scoring, pricing, defensive contribution, clean sheets, armbands
and auto-pick stay in `FEL_API`. Those are server business and must not ship to a phone — the same
separation `GET /players/:id/breakdown` exists to preserve.

## Rule *values* are not this package's job

Every rule number here is also served at runtime by `GET /rules` (and carried free on
`GET /bootstrap`), and that is what clients read. So a consumer pinned to a stale version can be
wrong about a rule's **shape** — never about its numbers. That asymmetry is what makes pinning by
tag an acceptable trade for hand-copied logic.

## Install

```jsonc
// package.json
"@fel/core": "github:ahme1d1/FEL_CORE#v1.0.0"
```

**This is never published to npm.** There is no registry in the path: npm fetches it straight from
GitHub. `private: true` is set so `npm publish` refuses. Releasing a version is a git tag — see
[Changing a rule](#changing-a-rule).

**Pin a tag, always**, and never move or delete a tag that a consumer's lockfile references — that
lockfile records the commit the tag pointed at, and a `npm ci` that cannot find it fails the build.
Cut a new tag instead.

`prepare` compiles the package on install, so consumers get JS + `.d.ts` and Metro never has to
transpile TypeScript out of `node_modules`.

### ⚠️ `--ignore-scripts` suppresses the build

`prepare` is the only thing that compiles this package — `dist/` is gitignored, so a clone carries
none. `npm ci --ignore-scripts` therefore installs it **unbuilt**, and `npm rebuild` does not run
`prepare`. A consumer that needs `--ignore-scripts` for its own reasons must build it explicitly:

```dockerfile
RUN npm ci --ignore-scripts && npm --prefix node_modules/@fel/core run build
```

That works because the package ships its tsconfigs and `scripts/` in `files`, and because npm puts
the consumer's own `node_modules/.bin` on PATH for a `--prefix` run — so it compiles with the
consumer's `typescript`. Invoke the package's own `build` script rather than copying its `tsc` lines
into a Dockerfile, or the two will drift. `FEL_WEBSITE`'s Dockerfile does this and then asserts
`dist/client/index.js` and the ESM marker both exist.

### ⚠️ npm 11 warns that `prepare` is unapproved — today it still runs

`npm install` prints `allow-scripts   @fel/core@x.y.z (prepare: npm run build)`. As of npm **11.16**
that is a warning only: the script runs and `dist/` is produced. If a later npm makes the gate
enforcing, a plain `npm ci` will install this package **unbuilt** and every consumer import will fail
to resolve.

Not pre-approved on purpose. `npm approve-scripts @fel/core` writes
`"allowScripts": { "github:ahme1d1/FEL_CORE#<commit-sha>": true }` — keyed by the **commit**, so it
would have to be re-run on every tag bump, and a stale entry is silently useless. One command fixes
it on the day it matters; carrying the maintenance until then does not.

`FEL_WEBSITE`'s Dockerfile is already immune: it builds the package explicitly rather than relying
on `prepare`.

### ⚠️ Any build image needs `git`

npm **always clones** a git dependency. There is no codeload-tarball path — not with `prepare`, not
without it, not for a public repo. Measured twice in `node:24.18.0-alpine`, which ships no git: both
installs died on `enoent … git`. `FEL_API`'s Dockerfile adds `apk add --no-cache git` to its two
`npm ci` stages, and **any future Expo/EAS build will need the same**. An install also needs network
access to `github.com`, not just to the npm registry.

No credentials are needed, though, and that is the point of the repo being public. npm normalises the
dependency spec to the `github:` shorthand and writes a `git+ssh://…` URL into `package-lock.json`
even if you write `git+https://` — but for a public repo it falls back ssh → https on its own, so
`npm ci` works with no ssh key and no token. Verified in a keyless container.

## Changing the client half

Same release loop as a rule: edit, test, tag, bump consumers. The friction is deliberate for rules,
and it is the real cost here — a service or a lib function changes far more often than a rule does.
Develop against a local checkout (`npm i ../FEL_CORE`, which symlinks; keep `tsc -w` running, since
npm does **not** run `prepare` for a `file:` dependency) and pin the tag as the last commit.
`FEL_WEBSITE/tests/unit/core-pin.test.ts` fails if a `file:` spec is ever committed.

## Changing a rule

1. Edit here, update the tests, `npm test`.
2. Commit, tag (`vX.Y.Z`), push the tag.
3. Bump the dependency in each consumer and run its suite.

The friction is the point: rule changes are rare and deliberate, and the alternative — three
hand-maintained copies — is what this package was extracted to end.

## Layout notes

- **CommonJS only, on purpose.** `FEL_API` is CJS; Vite and Metro both consume CJS. An ESM build is
  additive whenever a consumer needs one, and would be a minor bump — not a breaking change.
- **`rules/package.json` is a stub, not a package.** `FEL_API`'s tsconfig resolves with node10,
  which ignores `exports` maps; that file is how `@fel/core/rules` gets types there.
- **`src/` ships in the tarball.** `FEL_WEBSITE`'s rule-parity guard reads the TypeScript source of
  `constants.ts` out of `node_modules` to check its published rule figures against what the API
  actually serves. Removing `src` from `files` breaks that guard.

## Provenance

Extracted from `FEL_API/src/common/rules-engine/` in step 27 of the app-readiness programme
(2026-09-14), unchanged except for two severances: the `@prisma/client` enum imports became local
string unions in `types.ts`, and the seven squad-shape constants that used to be re-exported from
`FEL_API/src/common/constants.ts` are defined here. `FEL_API` re-exports both back, so it keeps a
single import surface and a single definition.
