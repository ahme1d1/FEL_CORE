/**
 * `@fel/core/client` — the transport and the vocabulary the website and the app share.
 *
 * Mirrors the shape `app/services/api/index.ts` had in `FEL_WEBSITE`: the envelope, the transport,
 * the session and the platform seams flat; every service under its own namespace. Consumers that
 * want a single module import the deep subpath instead (`@fel/core/client/lib/fmt`,
 * `@fel/core/client/api/referenceCache`), which is what most of the website's 486 imports became.
 *
 * `lib/**` and `data/**` are deliberately NOT re-exported flat here. Three of the modules that live
 * under this entry point export a symbol named `hydrated`, and several lib modules share names with
 * `@fel/core/rules` — a flat barrel over all of it would either collide or silently shadow.
 */

// The envelope and the seams.
export * from './api/types.js';
export * from './platform/config.js';
export * from './platform/reactivity.js';
export { plainReactivity } from './platform/plainReactivity.js';
export type { StorageAdapter } from './platform/storage.js';
export type { CoreMessageKey } from './i18n/keys.js';

// Transport, mapping and the session.
export * from './api/adapters.js';
export * from './api/client.js';
export * from './api/session.js';

// Services, each under its own namespace.
export * as squadService from './api/squadService.js';
export * as transfersService from './api/transfersService.js';
export * as chipsService from './api/chipsService.js';
export * as gameweekService from './api/gameweekService.js';
export * as snapshotsService from './api/snapshotsService.js';
export * as scoringService from './api/scoringService.js';
export * as playersService from './api/playersService.js';
export * as fixturesService from './api/fixturesService.js';
export * as clubsService from './api/clubsService.js';
export * as standingsService from './api/standingsService.js';
export * as leaguesService from './api/leaguesService.js';
export * as managerService from './api/managerService.js';
export * as notificationsService from './api/notificationsService.js';
export * as authService from './api/authService.js';
export * as contactService from './api/contactService.js';
export * as teamOfWeekService from './api/teamOfWeekService.js';
