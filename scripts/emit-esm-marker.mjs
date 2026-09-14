import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Mark `dist/client/**` as ESM.
 *
 * The package root has no `"type"` field, so Node treats every `.js` under it as CommonJS — correct
 * for `dist/rules/**`, which FEL_API resolves as CJS, and fatal for `dist/client/**`, which tsc
 * emits with `import`/`export` syntax. Node decides a file's format from the NEAREST `package.json`,
 * so this one marker scopes ESM to the client subtree and leaves the rules half alone.
 *
 * Without it the failure is `Cannot use import statement outside a module`, raised during Nitro's
 * prerender — i.e. inside the Docker build, which is the most expensive place to find out.
 *
 * `tsc` cannot emit this, and `dist/` is gitignored, so it is written here on every build. `files`
 * packs `dist/`, so it reaches consumers.
 */
const dir = fileURLToPath(new URL('../dist/client/', import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}package.json`, `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
