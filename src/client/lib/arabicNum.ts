/**
 * @deprecated — use the locale-aware formatters from `@/i18n/fmt` instead.
 * This file is a back-compat shim so existing call sites keep working while
 * we migrate file-by-file. It delegates every call to `fmt.*`, which reads
 * the currently-active language (set by `LanguageProvider`).
 */
import { fmt } from './fmt.js';

export function arabicNum(n: number | string): string {
  return fmt.num(n);
}

export function money(n: number): string {
  return fmt.money(n);
}

export function arabicPct(n: number): string {
  return fmt.pct(n);
}

export function arabicInt(n: number): string {
  return fmt.int(n);
}
