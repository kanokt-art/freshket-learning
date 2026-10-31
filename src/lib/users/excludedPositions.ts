// Positions that are not part of the learning population: building services staff (maid,
// masseuse) are left out of team rosters, reports and the org board.

const EXCLUDED = /\b(maid|masseu(?:se|r))\b/i

export function isExcludedPosition(position?: string | null): boolean {
  return !!position && EXCLUDED.test(position)
}
