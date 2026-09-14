// Additively syncs a course's assignedUserIds against its saved conditions —
// assignedDepartments (a whole department: every team + the unassigned
// bucket) and assignedTeamIds (specific teams within a department, checked
// individually) — see the Course type for the full rationale. Extracted so
// the matching logic is testable without the Admin SDK; the API route that
// calls this only does I/O (read courses + users, call this, write the diffs).

export interface CourseForSync {
  id: string
  assignedDepartments?: string[]
  assignedTeamIds?: string[]
  assignedUserIds?: string[]
}

export interface UserForSync {
  uid: string
  department?: string
  teamId?: string
  employmentStatus?: string
}

export interface CourseSyncResult {
  courseId: string
  /** Full new assignedUserIds array to write. */
  newAssignedUserIds: string[]
  /** uids that were added by this sync, for reporting/notifications. */
  addedUids: string[]
}

function isActive(u: UserForSync): boolean {
  return !u.employmentStatus || u.employmentStatus === 'Active'
}

/**
 * For each course with assignedDepartments and/or assignedTeamIds set, find
 * active users who match (by department string, or by teamId) and aren't
 * already in assignedUserIds, and union them in.
 *
 * A user matches if EITHER condition hits them — a course tracking both "all
 * of Portfolio Management" and "just the Chain team in Key Account
 * Management" should pick up new joiners from both. teamId is the more
 * precise signal deliberately: department is a free-text HR field that can
 * drift from the org's real team structure (a person's department string
 * and the team they actually report into aren't always the same thing —
 * see computeAutoTeamMappings' docs for the exact case that showed this),
 * so a team-level condition matches on the team relationship itself.
 *
 * Additive only, mirroring computeAutoTeamMappings: never removes a uid.
 * A person who left their department/team (or resigned) simply stays in the
 * course's history rather than being pruned by this route — the same
 * reasoning that keeps a resigned learner in the course summary tab.
 *
 * Returns only the courses that actually changed, so the caller can skip a
 * write for everything that's already in sync.
 */
export function computeDepartmentAssignmentSync(
  courses: CourseForSync[],
  users: UserForSync[],
): CourseSyncResult[] {
  const results: CourseSyncResult[] = []

  for (const course of courses) {
    const depts = course.assignedDepartments
    const teamIds = course.assignedTeamIds
    const hasDeptCondition = !!depts && depts.length > 0
    const hasTeamCondition = !!teamIds && teamIds.length > 0
    if (!hasDeptCondition && !hasTeamCondition) continue

    const deptSet = new Set(depts ?? [])
    const teamIdSet = new Set(teamIds ?? [])

    const current = course.assignedUserIds ?? []
    const currentSet = new Set(current)

    const toAdd = users
      .filter(u => {
        if (!isActive(u) || currentSet.has(u.uid)) return false
        const deptMatch = hasDeptCondition && !!u.department && deptSet.has(u.department)
        const teamMatch = hasTeamCondition && !!u.teamId && teamIdSet.has(u.teamId)
        return deptMatch || teamMatch
      })
      .map(u => u.uid)

    if (toAdd.length === 0) continue

    results.push({
      courseId: course.id,
      newAssignedUserIds: [...current, ...toAdd],
      addedUids: toAdd,
    })
  }

  return results
}
