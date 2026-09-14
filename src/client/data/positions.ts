export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Position {
  code: PositionCode;
  ar: string;
  en: string;
  short: string;
  color: string;
}

export const POS: Record<PositionCode, Position> = {
  GK: { code: 'GK', ar: 'حارس', en: 'Goalkeeper', short: 'ح.م', color: '#F2C14E' },
  DEF: { code: 'DEF', ar: 'مدافع', en: 'Defender', short: 'م.د', color: '#4ABCD9' },
  MID: { code: 'MID', ar: 'وسط', en: 'Midfielder', short: 'و.س', color: '#B2E34A' },
  FWD: { code: 'FWD', ar: 'مهاجم', en: 'Forward', short: 'م.ه', color: '#E26A6A' },
};

/** Returns the locale-aware long name for a position. */
export function posName(code: PositionCode, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? POS[code].ar : POS[code].en;
}
