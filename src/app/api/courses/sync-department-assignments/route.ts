import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'
import { computeDepartmentAssignmentSync } from '@/lib/courses/syncDepartmentAssignments'

// POST /api/courses/sync-department-assignments
//
// A course's assignedUserIds is a resolved SNAPSHOT taken when a super_admin
// picks "แผนก" in the learner-assignment picker — it never updated itself, so
// a newly-hired (or newly-imported) employee in a tracked department never
// showed up in that course's roster, never got the new-course notification,
// and never even saw the course on /courses (visibility there checks
// assignedUserIds directly).
//
// This route re-derives, for every course that recorded a condition —
// assignedDepartments (a whole department: every team + the unassigned
// bucket checked) and/or assignedTeamIds (individual teams checked within a
// department that isn't wholly selected, matched by teamId instead of the
// department string) — who should now be in assignedUserIds, and additively
// writes the difference. Called after CSV import completes; also exposed as
// a manual "ซิงก์ผู้เรียนอัตโนมัติ" button on /courses for admins who add
// someone outside of a bulk import.
export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const db = getAdminFirestore()
    const [coursesSnap, usersSnap] = await Promise.all([
      db.collection('courses').get(),
      db.collection('users').get(),
    ])

    const courses = coursesSnap.docs.map(d => ({
      id: d.id,
      assignedDepartments: d.data().assignedDepartments as string[] | undefined,
      assignedTeamIds: d.data().assignedTeamIds as string[] | undefined,
      assignedUserIds: d.data().assignedUserIds as string[] | undefined,
    }))
    const users = usersSnap.docs.map(d => ({
      uid: d.id,
      department: d.data().department as string | undefined,
      teamId: d.data().teamId as string | undefined,
      employmentStatus: d.data().employmentStatus as string | undefined,
    }))

    const results = computeDepartmentAssignmentSync(courses, users)
    if (results.length === 0) {
      return NextResponse.json({ coursesUpdated: 0, totalAdded: 0, results: [] })
    }

    const batch = db.batch()
    for (const r of results) {
      batch.update(db.collection('courses').doc(r.courseId), { assignedUserIds: r.newAssignedUserIds })
    }
    await batch.commit()

    const totalAdded = results.reduce((sum, r) => sum + r.addedUids.length, 0)
    return NextResponse.json({
      coursesUpdated: results.length,
      totalAdded,
      results: results.map(r => ({ courseId: r.courseId, added: r.addedUids.length })),
    })
  } catch (e) {
    console.error('POST /api/courses/sync-department-assignments', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
