/**
 * Short display name for pitch cards / tight tiles.
 *
 * Egyptian rosters are dominated by shared first names (محمد/أحمد/عمر…), so the
 * short form is the LAST name token — 'محمد الشناوي' → 'الشناوي' — keeping
 * two-token compounds intact: 'محمد عبد المنعم' → 'عبد المنعم',
 * 'وسام أبو علي' → 'أبو علي', 'إبراهيم نور الدين' → 'نور الدين'.
 */

const COMPOUND_PREFIXES = new Set(['عبد', 'أبو', 'ابو']);
const COMPOUND_SUFFIXES = new Set(['الدين']);

export function playerShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] ?? fullName;

  const last = parts[parts.length - 1]!;
  const prev = parts[parts.length - 2]!;

  if (COMPOUND_SUFFIXES.has(last) || COMPOUND_PREFIXES.has(prev)) {
    return `${prev} ${last}`;
  }
  return last;
}
