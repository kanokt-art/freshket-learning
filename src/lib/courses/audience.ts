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

import { isCurrentOrIncoming } from '@/lib/users/active'

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

// Who a course reaches: employed now, or hired and due to start ('Pending'). See isCurrentOrIncoming.
const isActive = isCurrentOrIncoming

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

/**
 * Is this ONE person in the course's target? The same rule as {@link courseAudience},
 * for the learner's own screens (which course shows up for me).
 *
 * It matches the saved department/team conditions directly rather than relying on
 * the roster snapshot. The snapshot only holds people who were there when the
 * course was published or when someone last pressed sync, so a new sale joining
 * afterwards was in the target and still did not get the course. Role targeting
 * still applies when the course names roles.
 */
export function isInCourseTarget(course: AudienceCourse, user: AudienceUser): boolean {
  if ((course.assignedUserIds ?? []).includes(user.uid)) return true
  if ((course.targetRoles ?? []).includes(user.role)) return true
  if (!isActive(user)) return false
  if (user.department && (course.assignedDepartments ?? []).includes(user.department)) return true
  if (user.teamId && (course.assignedTeamIds ?? []).includes(user.teamId)) return true
  return false
}

/**
 * The published courses worth a lead's, manager's or department head's attention: the ones aimed at
 * them or at someone they are responsible for. A course for other departments (a Sales course, to the
 * Head of People) is not theirs to follow, so it is left out of their "all courses" list.
 */
export function coursesForTeam<C extends AudienceCourse & { isPublished?: boolean }, U extends AudienceUser>(
  courses: readonly C[],
  me: U | null | undefined,
  members: readonly U[],
): C[] {
  if (!me) return []
  return courses.filter((c) => c.isPublished && (isInCourseTarget(c, me) || members.some((m) => isInCourseTarget(c, m))))
}

/**
 * Everyone the course's results should list: its audience, plus anyone who has a
 * training record for it. A person who finished the course and was later taken
 * off the roster, or resigned, still has that work on file; dropping them would
 * make completed training vanish from the report.
 *
 * Callers decide whether to show the resigned (see isActiveEmployee).
 */
export function resultsRoster<U extends AudienceUser>(
  course: AudienceCourse | null | undefined,
  users: readonly U[],
  records: ReadonlyArray<{ userId: string; courseId: string }>,
  courseId: string,
): U[] {
  const inAudience = new Set(courseAudience(course, users).map((u) => u.uid))
  const hasRecord = new Set(records.filter((r) => r.courseId === courseId).map((r) => r.userId))
  return users.filter((u) => inAudience.has(u.uid) || hasRecord.has(u.uid))
}
