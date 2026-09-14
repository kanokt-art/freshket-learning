// Additively syncs a course's assignedUserIds against its assignedDepartments
// condition — see the Course type for the full rationale. Extracted so the
// matching logic is testable without the Admin SDK; the API route that calls
// this only does I/O (read courses + users, call this, write the diffs).

export interface CourseForSync {
  id: string
  assignedDepartments?: string[]
  assignedUserIds?: string[]
}

export interface UserForSync {
  uid: string
  department?: string
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
 * For each course with assignedDepartments set, find active users whose
 * department matches and who aren't already in assignedUserIds, and union
 * them in.
 *
 * Additive only, mirroring computeAutoTeamMappings: never removes a uid.
 * A person who left their department (or resigned) simply stays in the
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
    if (!depts || depts.length === 0) continue
    const deptSet = new Set(depts)

    const current = course.assignedUserIds ?? []
    const currentSet = new Set(current)

    const toAdd = users
      .filter(u => isActive(u) && u.department && deptSet.has(u.department) && !currentSet.has(u.uid))
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
