/**
 * Web port of FEL_APP `src/theme/tokens.ts` — TYPES ONLY. The color values
 * live in `app/assets/css/tokens.css` (`--th-*`/`--ac-*`, switched via
 * `data-theme`/`data-accent` on <html>), so the THEMES/ACCENTS hex records
 * are intentionally not ported.
 */

export type ThemeId = 'nile-night' | 'desert-day' | 'stadium-noir';
export type AccentId = 'pharaoh-gold' | 'crimson' | 'pitch-lime' | 'nile-cyan';
export type DialectId = 'msa';
export type PitchStyle = 'classic' | 'grid' | 'papyrus';
export type Density = 'comfortable' | 'regular' | 'dense';

export const THEME_IDS: readonly ThemeId[] = ['nile-night', 'desert-day', 'stadium-noir'];
export const ACCENT_IDS: readonly AccentId[] = ['pharaoh-gold', 'crimson', 'pitch-lime', 'nile-cyan'];
export const PITCH_STYLES: readonly PitchStyle[] = ['classic', 'grid', 'papyrus'];
export const DENSITIES: readonly Density[] = ['comfortable', 'regular', 'dense'];

export interface Tweaks {
  theme: ThemeId;
  accent: AccentId;
  dialect: DialectId;
  pitchStyle: PitchStyle;
  density: Density;
}

export const DEFAULT_TWEAKS: Tweaks = {
  theme: 'nile-night',
  accent: 'pharaoh-gold',
  dialect: 'msa',
  pitchStyle: 'classic',
  density: 'regular',
};
