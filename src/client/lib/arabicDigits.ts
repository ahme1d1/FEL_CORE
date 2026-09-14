/**
 * Pure Latin↔Arabic-Indic digit transforms on arbitrary strings.
 * Ported from ../FEL_LANDING/src/lib/arabic-num.ts (kept separate from the
 * number-formatting `fmt` layer and the FEL_APP `arabicNum` shim). Used by the
 * marketing CountUp + MockLive minute ticker to Arabize dynamic numbers only
 * when the active locale is `ar`.
 */
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export function toArabicDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

export function fromArabicDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Returns true if the string contains any Arabic-Indic digit. */
export function hasArabicDigits(input: string): boolean {
  return /[٠-٩]/.test(input);
}
