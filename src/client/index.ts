/**
 * `@fel/core/client` — the transport and the vocabulary the website and the app share.
 *
 * Deep subpaths are exported too (`@fel/core/client/platform/config`, `.../lib/storage`, …) because
 * three of the modules that will land here export a symbol named `hydrated`; a single flat barrel
 * cannot hold them. Consumers import whichever is clearer.
 */
export * from './platform/reactivity.js';
export { plainReactivity } from './platform/plainReactivity.js';
export type { StorageAdapter } from './platform/storage.js';
export * from './platform/config.js';
