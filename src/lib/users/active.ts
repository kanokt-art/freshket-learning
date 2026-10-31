import { isExcludedPosition } from '@/lib/users/excludedPositions'

// Who still works here.
//
// `employmentStatus` comes from column 1 of the HR CSV. Observed values in the
// live data are 'Active', 'Resigned' and 'No show'; the field is typed as a
// free string because HR owns the vocabulary and has added values before.
//
// The rule is therefore a whitelist, not a blacklist: only the literal
// 'Active' counts, EXCEPT that a missing status counts as active too, because
// records that predate the HR sync have no status at all and those people are
// still employed. A blacklist would silently start including whatever new
// status HR invents next.

interface EmploymentFields {
  employmentStatus?: string
  /** Maids and masseuses are not part of the learning population: never counted as employed here. */
  position?: string
}

/** True for someone still employed — see the whitelist rationale above. */
export function isActiveEmployee(u: EmploymentFields): boolean {
  if (isExcludedPosition(u.position)) return false
  return !u.employmentStatus || u.employmentStatus === 'Active'
}

/**
 * Employed now, or hired and due to start: HR marks someone who has accepted but not yet
 * begun as 'Pending'. A course roster covers both — a department-targeted course must
 * reach a new joiner before day one (and the roster must show them), not only once the
 * HR sheet flips them to 'Active'. Everything else (Resigned, No show, anything unknown)
 * stays out, by the same whitelist rule as above.
 */
export function isCurrentOrIncoming(u: EmploymentFields): boolean {
  if (isExcludedPosition(u.position)) return false
  return isActiveEmployee(u) || u.employmentStatus === 'Pending'
}

/** Keep people employed now or due to start. */
export function onlyCurrentOrIncoming<T extends EmploymentFields>(users: T[]): T[] {
  return users.filter(isCurrentOrIncoming)
}

/** Keep only people still employed. */
export function onlyActiveEmployees<T extends EmploymentFields>(users: T[]): T[] {
  return users.filter(isActiveEmployee)
}
