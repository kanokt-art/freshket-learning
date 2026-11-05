import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import { canViewEmployeeReport } from '@/lib/users/managedMembers'
import type { Team, UserProfile } from '@/types/user'

// The quiz attempts one person made in one course: which try it was, the score, whether it passed, and how
// long it took. The attempts table is an audit trail the browser cannot read (policies.ts), so the people who
// look after the learner read it here — a super_admin, or the Team Lead / Manager / department head who may
// open that person's report. The answers themselves are not sent.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function GET(req: NextRequest) {
  const gate = await requireStaff(req)
  if (!gate.ok) return gate.response

  const uid = req.nextUrl.searchParams.get('uid') ?? ''
  const courseId = req.nextUrl.searchParams.get('courseId') ?? ''
  if (!ID_RE.test(uid) || !ID_RE.test(courseId)) {
    return NextResponse.json({ error: 'Invalid uid or courseId' }, { status: 400 })
  }

  try {
    const store = getStore()
    if (!gate.isSuperAdmin && gate.uid !== uid) {
      const [target, teams] = await Promise.all([store.get('users', uid), store.query('teams')])
      const allowed = !!target && canViewEmployeeReport(
        gate.person as unknown as UserProfile, target as unknown as UserProfile, [], teams as unknown as Team[],
      )
      if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = await store.query('assessmentAttempts', {
      where: [{ field: 'uid', op: '==', value: uid }, { field: 'courseId', op: '==', value: courseId }],
    })
    const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(v as string).getTime() || 0 : 0)
    const attempts = rows
      .map((a) => ({
        id: a.id,
        assessmentId: a.assessmentId,
        assessmentTitle: a.assessmentTitle ?? '',
        step: a.step,
        attemptNumber: a.attemptNumber,
        score: a.score,
        passingScore: a.passingScore,
        passed: a.passed === true,
        elapsedMs: a.elapsedMs,
        limitMs: a.limitMs,
        timedOut: a.timedOut === true,
        autoSubmitted: a.autoSubmitted === true,
        createdAt: a.createdAt,
      }))
      .sort((x, y) => time(x.createdAt) - time(y.createdAt))

    return NextResponse.json({ attempts })
  } catch (err) {
    console.error('assessment/attempts failed', err)
    return NextResponse.json({ error: 'โหลดประวัติการทำแบบทดสอบไม่สำเร็จ' }, { status: 500 })
  }
}
