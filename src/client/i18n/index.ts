/**
 * `@fel/core/client/i18n` — the app-zone dictionary, in both languages, plus the non-hook translate.
 *
 * A SEPARATE entry point from `@fel/core/client`, deliberately. That barrel is pulled whole by
 * `FEL_WEBSITE/pages/contact.vue`, which is prerendered through Nitro's Node loader; `CoreMessageKey`
 * costs nothing there because it is a type, and ~90 KB of strings would not. A consumer that wants
 * the copy asks for it.
 *
 * This subtree reaches only `lib/fmt.js` (a pure leaf with no imports of its own), so it carries
 * neither the reactive seam nor the transport with it.
 */
export { CORE_EN, type CoreKey } from './en.js';
export { CORE_AR } from './ar.js';
export { CORE_DICT, translate } from './translate.js';
export type { CoreMessageKey } from './keys.js';
