import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import { isInCourseTarget } from '@/lib/courses/audience'
import type { UserProfile } from '@/types/user'

// A learner enrolls in a course an admin opened to everyone (`openEnrollment`). They join the course
// roster the same way an assigned learner does, so the course lists, the Team Lead's report and the
// Slack completion post all treat them as a learner of it. The browser cannot do this itself: the
// roster is a course field only a super_admin writes (policies.ts).

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response
  const uid = gate.uid

  const courseId = body.courseId
  if (typeof courseId !== 'string' || !ID_RE.test(courseId)) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  try {
    const store = getStore()
    const course = await store.get('courses', courseId)
    if (!course || course.isPublished !== true || course.openEnrollment !== true) {
      return NextResponse.json({ error: 'หลักสูตรนี้ไม่เปิดให้ลงทะเบียนเอง' }, { status: 403 })
    }
    const me = gate.person as unknown as UserProfile
    // Already one of its learners (assigned, or by department/team): nothing to add.
    if (!isInCourseTarget(course as never, { uid, role: me.role, department: me.department, teamId: me.teamId, employmentStatus: me.employmentStatus })) {
      await store.addCourseLearners(courseId, [uid])
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/courses/enroll', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
