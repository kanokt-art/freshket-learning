import type { Store } from '@/lib/server/store'
import type { Doc } from '@/lib/server/docMap'
import {
  computeDepartmentAssignmentSync,
  usersForMoveSync,
  type TeamMove,
} from '@/lib/courses/syncDepartmentAssignments'

/**
 * Add each member who just moved to every course whose department or team
 * condition now covers them. Additive, like the standalone sync: it never
 * removes anyone, so leaving a team does not pull a person out of that team's
 * courses.
 */
export async function syncCoursesForMoves(
  store: Store,
  moves: TeamMove[],
  profiles: Doc[],
): Promise<{ coursesUpdated: number; totalAdded: number }> {
  const profileByUid = new Map(
    profiles.map((d) => [d.id, d as { department?: string; employmentStatus?: string }] as const),
  )

  const courses = (await store.query('courses')).map((d) => ({
    id: d.id,
    assignedDepartments: d.assignedDepartments as string[] | undefined,
    assignedTeamIds: d.assignedTeamIds as string[] | undefined,
    assignedUserIds: d.assignedUserIds as string[] | undefined,
  }))

  const results = computeDepartmentAssignmentSync(courses, usersForMoveSync(moves, profileByUid))
  if (results.length === 0) return { coursesUpdated: 0, totalAdded: 0 }

  // The database adds only the people not already on the roster, in one step.
  // The roster was read a moment ago; if another request added someone in
  // between, writing newAssignedUserIds back whole would silently drop them.
  for (const r of results) await store.addCourseLearners(r.courseId, r.addedUids)

  return {
    coursesUpdated: results.length,
    totalAdded: results.reduce((sum, r) => sum + r.addedUids.length, 0),
  }
}
