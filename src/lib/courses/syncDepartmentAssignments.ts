// Additively syncs a course's assignedUserIds against its saved conditions —
// assignedDepartments (a whole department: every team + the unassigned
// bucket) and assignedTeamIds (specific teams within a department, checked
// individually) — see the Course type for the full rationale. Extracted so
// the matching logic is testable without the Admin SDK; the API route that
// calls this only does I/O (read courses + users, call this, write the diffs).

import { isCurrentOrIncoming } from '@/lib/users/active'

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

// Current employees AND new joiners due to start ('Pending'): a new hire is on the course
// roster before their first day. Resigned / No show are left out.
function isActive(u: UserForSync): boolean {
  return isCurrentOrIncoming(u)
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

/** A member who was just placed into a team. */
export interface TeamMove {
  uid: string
  /** The team they were moved INTO — the new value, not the one on file. */
  teamId: string
}

/**
 * Shape a batch of just-completed team moves for computeDepartmentAssignmentSync,
 * so a move can be reconciled against course conditions on its own instead of
 * re-reading every employee.
 *
 * Two details matter, and both are easy to get wrong:
 *  · `teamId` is the NEW team. The stored document still holds the old one at
 *    the moment this runs, so reading it from there would match the person
 *    against the team they just left — which is exactly the lookup this exists
 *    to replace.
 *  · `department` and `employmentStatus` come from the stored profile, because
 *    a move does not change them. A course tracking a whole department should
 *    still pick the person up, and a resigned employee must still be skipped.
 *
 * A move for a uid with no profile is kept (with no department) rather than
 * dropped: the team condition alone can still match it.
 */
export function usersForMoveSync(
  moves: TeamMove[],
  profiles: ReadonlyMap<string, { department?: string; employmentStatus?: string }>,
): UserForSync[] {
  return moves.map((m) => ({
    uid: m.uid,
    teamId: m.teamId,
    department: profiles.get(m.uid)?.department,
    employmentStatus: profiles.get(m.uid)?.employmentStatus,
  }))
}
