// Who a course is for.
//
// The target is what was entered when the course was made: individual people
// (assignedUserIds — a resolved snapshot) plus the conditions it was built from
// (assignedDepartments, assignedTeamIds). The audience is the union of those:
//
//   · everyone named in assignedUserIds, resigned or not — they may have a
//     record, and dropping them would erase completed work from the report;
//   · every ACTIVE person matching a saved condition, even one the sync has not
//     added to the snapshot yet (a new joiner, an import since the last sync).
//
// Only a course with no target of that kind falls back to targetRoles, and a
// course with nothing at all is for NOBODY — an empty list, not "everyone".
//
// The course results tab used to read only targetRoles and treat an empty list
// as "all roles", so a course with a narrow target listed all 1,642 employees as
// learners (every one "not started") while the course card said 0.

export interface AudienceCourse {
  assignedUserIds?: string[]
  assignedDepartments?: string[]
  assignedTeamIds?: string[]
  targetRoles?: readonly string[]
}

export interface AudienceUser {
  uid: string
  role: string
  department?: string
  teamId?: string
  employmentStatus?: string
}

const isActive = (u: AudienceUser) => !u.employmentStatus || u.employmentStatus === 'Active'

export function courseAudience<U extends AudienceUser>(course: AudienceCourse | null | undefined, users: readonly U[]): U[] {
  if (!course) return []

  const assigned = new Set(course.assignedUserIds ?? [])
  const depts = new Set(course.assignedDepartments ?? [])
  const teams = new Set(course.assignedTeamIds ?? [])

  if (assigned.size > 0 || depts.size > 0 || teams.size > 0) {
    return users.filter((u) =>
      assigned.has(u.uid) ||
      (isActive(u) && ((!!u.department && depts.has(u.department)) || (!!u.teamId && teams.has(u.teamId)))),
    )
  }

  const roles = course.targetRoles ?? []
  return roles.length > 0 ? users.filter((u) => roles.includes(u.role)) : []
}
