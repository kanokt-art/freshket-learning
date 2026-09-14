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
}

/** True for someone still employed — see the whitelist rationale above. */
export function isActiveEmployee(u: EmploymentFields): boolean {
  return !u.employmentStatus || u.employmentStatus === 'Active'
}

/** Keep only people still employed. */
export function onlyActiveEmployees<T extends EmploymentFields>(users: T[]): T[] {
  return users.filter(isActiveEmployee)
}
