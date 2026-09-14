/**
 * The jersey outline both shirt renderings share, on a 44×46 viewBox.
 *
 * Extracted from `Shirt.vue` when the weekly-prize badge needed the same silhouette: two hand-drawn
 * shirts would drift apart the first time either was tweaked, and a prize marker that does not look
 * like the kits on the pitch reads as a different object entirely.
 */
export const SHIRT_PATH =
  'M8 6 L16 3 Q22 5 28 3 L36 6 L44 14 L38 18 L36 16 L36 42 Q24 44 8 42 L8 16 L6 18 L0 14 Z';

/** The viewBox `SHIRT_PATH` is drawn against. */
export const SHIRT_VIEWBOX = '0 0 44 46';
