/** Live DTO shape — one row of `GET /standings` (see `standingsService.ts`). */
export interface Standing {
  club: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}
