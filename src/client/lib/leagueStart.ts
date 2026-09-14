/**
 * The gameweek a league's Total column counts from, or `null` when it needs no qualification.
 *
 * FPL scopes a classic league by the LEAGUE's start gameweek, not by each manager's join gameweek:
 * a league created in gameweek 5 counts nobody's gameweeks 1-4, and a manager joining in gameweek 9
 * arrives carrying their points from gameweek 5 — not zero, and not their whole season.
 *
 * Three inputs collapse to `null`, and they are genuinely the same answer. `undefined` is an API
 * that has not shipped the field; `null` is a league created before the rule existed; `1` is a
 * league that has run since the season opened. All three mean "this is a season total", which is
 * what the column has always been read as — so none of them earns a label, and a league that starts
 * at gameweek 1 renders exactly as it always did.
 */
export function countsFromGameweek(start: number | null | undefined): number | null {
  return start != null && start > 1 ? start : null;
}
