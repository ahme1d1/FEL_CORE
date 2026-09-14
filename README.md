# FEL_CORE — `@fel/core`

Shared Fantasy EG code, so a rule has one definition across three clients: `FEL_API` (NestJS),
`FEL_WEBSITE` (Nuxt) and `FEL_APP` (Expo).

Today it ships one entry point.

| Entry point | Holds | Consumed by |
|---|---|---|
| `@fel/core/rules` | Squad validation: `validateSquad`, `isValidXI`, `countByPosition`, the rule constants and the engine's type vocabulary | `FEL_API` |

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
"@fel/core": "git+https://github.com/ahme1d1/FEL_CORE.git#v1.0.0"
```

Pin a tag, always. Use the explicit `git+https://` form rather than the `github:` shorthand — the
shorthand makes npm write a `git+ssh://` URL into `package-lock.json`, and CI has no ssh key.

`prepare` compiles the package on install, so consumers get JS + `.d.ts` and Metro never has to
transpile TypeScript out of `node_modules`.

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
