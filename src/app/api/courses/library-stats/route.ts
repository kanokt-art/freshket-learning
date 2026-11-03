import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import type { LibraryStat } from '@/lib/courses/library'
import type { UserProfile } from '@/types/user'

// The numbers on a Library card: how many people took the course, how many finished it, and how many
// of them are in the viewer's team and department. COUNTS ONLY — the learner never gets who, so this
// does not widen what a learner can read about colleagues (policies.ts COLLEAGUE_PROFILE_FIELDS).
// Covers the courses a Library lists: published and open to anyone, plus the ones the viewer finished.

export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.response
  const uid = gate.uid
  const me = gate.person as unknown as UserProfile

  try {
    const store = getStore()
    const [courses, mine] = await Promise.all([
      store.query('courses', { where: [{ field: 'isPublished', op: '==', value: true }] }),
      store.query('trainingRecords', { where: [{ field: 'userId', op: '==', value: uid }] }),
    ])
    const finished = new Set(mine.filter((r) => r.status === 'completed').map((r) => String(r.courseId)))
    const listed = courses.filter((c) => c.openEnrollment === true || finished.has(String(c.id))).map((c) => String(c.id))
    if (listed.length === 0) return NextResponse.json({ stats: {} })

    const idsOf = async (field: 'teamId' | 'department', value: unknown) =>
      typeof value === 'string' && value
        ? new Set((await store.query('users', { where: [{ field, op: '==', value }] })).map((u) => String(u.id ?? u.uid)))
        : new Set<string>()
    const [team, dept] = await Promise.all([idsOf('teamId', me.teamId), idsOf('department', me.department)])

    const stats: Record<string, LibraryStat> = {}
    for (const courseId of listed) {
      const records = await store.query('trainingRecords', { where: [{ field: 'courseId', op: '==', value: courseId }] })
      const others = records.filter((r) => r.userId !== uid)
      stats[courseId] = {
        learners: records.length,
        completed: records.filter((r) => r.status === 'completed').length,
        teamPeers: others.filter((r) => team.has(String(r.userId))).length,
        deptPeers: others.filter((r) => dept.has(String(r.userId))).length,
      }
    }
    return NextResponse.json({ stats })
  } catch (e) {
    console.error('GET /api/courses/library-stats', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
