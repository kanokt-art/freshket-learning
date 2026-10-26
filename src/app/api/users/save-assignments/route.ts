import { NextRequest, NextResponse } from 'next/server'
import { getStore, type Store } from '@/lib/server/store'
import type { Doc } from '@/lib/server/docMap'
import { requireManager } from '@/lib/server/auth'
import { cleanVisibleTeamIds } from '@/lib/users/visibleTeams'
import {
  computeDepartmentAssignmentSync,
  usersForMoveSync,
  type TeamMove,
} from '@/lib/courses/syncDepartmentAssignments'

type Assignment = {
  uid: string
  teamId?: string | null
  visibleTeamIds?: string[] | null
  role?: string
}

const VALID_ROLES = ['sale', 'team_lead', 'manager', 'super_admin']
const WRITE_CONCURRENCY = 8

// POST /api/users/save-assignments
// Writes teamId / visibleTeamIds / role for csv- users on the server (the access rules in policies.ts do not apply)
// Body: { assignments: Assignment[] }
export async function POST(req: NextRequest) {
  try {
    // manager+, not super_admin only. Team assignment is a manager action in both
    // the UI (`canAccess(role, 'manager')` on /users) and the access rules
    // (managers may write /teams); this route was the odd one
    // out, so a manager dragging someone into a team got "server ปฏิเสธ" and the
    // move never persisted. Changing someone's ROLE stays super_admin-only below.
    const gate = await requireManager(req)
    if (!gate.ok) return gate.response

    const { assignments } = (await req.json()) as { assignments: Assignment[] }
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: 'No assignments provided' }, { status: 400 })
    }

    const store = getStore()
    const targets = assignments.filter(a => !!a.uid)

    // A write to a person that no longer exists (a stale id from client cache)
    // must not create an empty profile containing only the patched fields — that
    // produced 32 ghost docs (no uid/email/role) in production. Check existence
    // first and skip instead; each write below is an update, which refuses to
    // create one anyway.
    const existing = targets.length > 0 ? await store.getMany('users', targets.map(a => a.uid)) : []
    const existsSet = new Set(existing.map(d => d.id))

    const writes: Array<{ uid: string; update: Record<string, unknown> }> = []
    const skipped: string[] = []
    const roleChangesDenied: string[] = []
    const invalid: string[] = []
    // Members placed INTO a team by this request — only ones that are actually
    // written below. Clearing a team (null) is not a move into anything, and a
    // skipped or invalid row never changed, so neither belongs here.
    const moves: TeamMove[] = []
    let saved = 0

    for (const a of targets) {
      if (!existsSet.has(a.uid)) { skipped.push(a.uid); continue }
      const update: Record<string, unknown> = {}
      if ('teamId' in a) update.teamId = a.teamId ?? null
      if (a.visibleTeamIds !== undefined) {
        const cleaned = cleanVisibleTeamIds(a.visibleTeamIds)
        if (cleaned === undefined) { invalid.push(a.uid); continue }
        update.visibleTeamIds = cleaned
      }

      // Role changes stay super_admin-only. Without this the widened gate would
      // hand every manager a privilege-escalation primitive: this route writes
      // on the server, so it bypasses the access rule that stops a manager
      // from touching `role` — a manager could promote themselves to super_admin.
      if (a.role !== undefined && VALID_ROLES.includes(a.role)) {
        if (gate.isSuperAdmin) update.role = a.role
        else roleChangesDenied.push(a.uid)
      }

      if (Object.keys(update).length > 0) {
        writes.push({ uid: a.uid, update })
        saved++
        if (typeof update.teamId === 'string' && update.teamId) {
          moves.push({ uid: a.uid, teamId: update.teamId })
        }
      }
    }

    // A few at a time: one request each, but not thousands in flight at once.
    for (let i = 0; i < writes.length; i += WRITE_CONCURRENCY) {
      await Promise.all(writes.slice(i, i + WRITE_CONCURRENCY).map((w) => store.update('users', w.uid, w.update)))
    }

    // A course aimed at a department or team is a snapshot in assignedUserIds,
    // so someone moved into a tracked team stays invisible to that course until
    // something re-derives the snapshot. Do it here, in the same request, once
    // the move has committed — rather than leaving it to a CSV import or an
    // admin remembering the sync button.
    //
    // Scoped to the people who moved. The standalone sync route reads every
    // employee (~1,700 documents) per call; dragging twenty people around
    // would have read them all twenty times over.
    //
    // This is secondary to the move itself, which is already saved: a failure
    // here is reported in the response but must never turn it into an error,
    // or the UI would tell the admin the move failed when it did not.
    let courseSync: { coursesUpdated: number; totalAdded: number } | { failed: true } | undefined
    if (moves.length > 0) {
      try {
        courseSync = await syncCoursesForMoves(store, moves, existing)
      } catch (e) {
        console.error('course sync after team move failed', e)
        courseSync = { failed: true }
      }
    }

    return NextResponse.json({ saved, skipped, roleChangesDenied, invalid, courseSync })
  } catch (e) {
    console.error('POST /api/users/save-assignments', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Add each member who just moved to every course whose department or team
 * condition now covers them. Additive, like the standalone sync: it never
 * removes anyone, so leaving a team does not pull a person out of that team's
 * courses.
 */
async function syncCoursesForMoves(
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
