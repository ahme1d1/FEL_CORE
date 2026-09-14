/**
 * `@fel/core/rules` — the squad-validation half of the FEL rules engine.
 *
 * Exported in dependency order, mirroring the barrel this was extracted from. What is deliberately
 * NOT here: scoring, BPS, auto-subs, gameweek scoring, pricing, defensive contribution, clean
 * sheets, armbands and auto-pick. Those are server business and stay in `FEL_API` — the same
 * separation that `GET /players/:id/breakdown` exists to preserve.
 */
export * from './types';
export * from './constants';
export * from './formation';
export * from './squad';
