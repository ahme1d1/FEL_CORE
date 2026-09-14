/**
 * Web port of FEL_APP `src/i18n/fmt.ts` — locale-aware formatters for
 * numbers, money, percent, and gameweek labels. `Lang` lives here on web
 * (the app defined it in `src/i18n/index.ts`).
 *
 * Digits and separators are always rendered Western (1-9, ",", ".", "%")
 * regardless of language — matches the football/finance convention used by
 * FilGoal, Kooora, FPL Arabic, beIN Sports AR, etc. Arabic mode only swaps
 * the unit words (e.g. "ج" for gameweek, " م" for million).
 *
 * Active language is read from a module-level ref updated by the locale
 * watcher in `app/app.vue` (the app's `LanguageProvider` equivalent).
 */

export type Lang = 'ar' | 'en';

let currentLang: Lang = 'ar';

export function setCurrentLang(lang: Lang): void {
  currentLang = lang;
}

export function getCurrentLang(): Lang {
  return currentLang;
}

/**
 * Spelled-out gameweek, matching how the AR/EN dictionaries write it in prose.
 *
 * There used to be a compact partner to this, `gw()`, rendering «ج14»/`GW14` for tight layouts —
 * and a comment right here conceding that «ج» is a mechanical mirror of English's `GW` which does
 * not read as Arabic on its own. The rule was written and then not applied: every caller was a
 * place that had room for the word, including the 16px stepper label. So the compact form is gone
 * and its callers take this one. The single caller that genuinely could not fit it — the season
 * chart's x-axis, up to 19 ticks wide — prints the bare number, which the axis already gives
 * meaning to.
 */
const GW_WORD: Record<Lang, string> = { ar: 'الجولة', en: 'Gameweek' };
// One Latin `m` in both locales (owner's call, 2026-08-28). It was ' م' in Arabic,
// which `--font-mono` cannot render — that stack (ui-monospace/SFMono/Menlo) carries no
// Arabic glyphs, so the suffix fell back to an arbitrary system face at an unpredictable
// advance: 12.03px against 18.06px for all three digits of "7.5".
const MONEY_SUFFIX: Record<Lang, string> = { ar: 'm', en: 'm' };

// Localized weekday/month words (manual, like `deadline` below — kept from
// the app, where Hermes' Intl had no bundled Arabic locale data; rendering
// the names ourselves also keeps web output byte-identical to the app).
const WEEKDAYS: Record<Lang, string[]> = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const MONTHS: Record<Lang, string[]> = {
  ar: ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Plain number: `14` → `"14"`. */
export function num(n: number | string): string {
  return String(n);
}

/** Integer with comma grouping: `428194` → `"428,194"`. */
export function int(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Money: `8.5` → `"8.5m"`, both locales. One decimal. */
export function money(n: number): string {
  return `${n.toFixed(1)}${MONEY_SUFFIX[currentLang]}`;
}

/** Percent: `12.4` → `"12.4%"`. One decimal. */
export function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Gameweek label in full: `14` → `"Gameweek 14"` (en) or `"الجولة 14"` (ar). */
export function gwLong(n: number): string {
  return `${GW_WORD[currentLang]} ${n}`;
}

/** Bench index badge: `1` → `"1"`. */
export function benchIdx(n: number): string {
  return String(n);
}

/** Deadline timestamp: ISO string → `"17/6 · 21:00"` (locale-neutral digits). */
export function deadline(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()}/${d.getMonth() + 1} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Kickoff timestamp: ISO string → `"Fri 17 Apr · 21:00"` (en) / `"الجمعة 17 إبريل · 21:00"` (ar). */
export function kickoff(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const wd = WEEKDAYS[currentLang][d.getDay()];
  const mon = MONTHS[currentLang][d.getMonth()];
  return `${wd} ${d.getDate()} ${mon} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Wall clock only: `"10:24"`. Western digits in both locales, like every other number here.
 *
 * For "last updated", where the date is almost always today and printing it would bury the one
 * part that answers the question — how long ago.
 */
export function clock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Day and month, no weekday and no clock: `"11 Sep"` (en) / `"11 سبتمبر"` (ar).
 *
 * For a column heading, where `kickoff()`'s weekday-and-time is four times too wide and the round's
 * date is the only thing that has to fit under its number.
 */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[currentLang][d.getMonth()]}`;
}

export const fmt = {
  num,
  int,
  money,
  pct,
  gwLong,
  benchIdx,
  clock,
  deadline,
  kickoff,
  dayMonth,
  setCurrentLang,
  getCurrentLang,
};
