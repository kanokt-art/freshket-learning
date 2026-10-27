// Who a course is for.
//
// One rule, used wherever a screen lists a course's learners: the people named in
// assignedUserIds if there are any; otherwise everyone holding one of the course's
// targetRoles. A course with neither is for NOBODY — an empty list, not "everyone".
//
// The course results tab used to read only targetRoles and treat an empty list as
// "all roles", so a course aimed at a handful of people showed all 1,642
// employees as learners (every one "not started") while the course card said 0.

export interface AudienceCourse {
  assignedUserIds?: string[]
  targetRoles?: readonly string[]
}

export interface AudienceUser {
  uid: string
  role: string
}

export function courseAudience<U extends AudienceUser>(course: AudienceCourse | null | undefined, users: readonly U[]): U[] {
  if (!course) return []
  const assigned = course.assignedUserIds ?? []
  if (assigned.length > 0) {
    const ids = new Set(assigned)
    return users.filter((u) => ids.has(u.uid))
  }
  const roles = course.targetRoles ?? []
  return roles.length > 0 ? users.filter((u) => roles.includes(u.role)) : []
}
