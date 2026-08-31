import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireStaff } from '@/lib/firebase/requireStaff'
import type { Assessment } from '@/types/assessment'
import type { Course } from '@/types/course'

// Opens a timed attempt session.
//
// The time limit has to be anchored on the server or it is decoration: a
// countdown that lives only in the browser is reset by a reload and edited in
// DevTools. So the clock starts HERE (server timestamp), the deadline is derived
// from it, and POST /api/assessment/submit refuses a submission that arrives
// after it. The browser countdown becomes a display of the server's deadline
// rather than the thing being enforced.
//
// `timeLimitMinutes` is a COURSE-level setting (Course.quizSettings), so a quiz
// opened outside a course has no limit — matching the existing data model.

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

  const assessmentId = body.assessmentId
  const courseId = body.courseId
  if (typeof assessmentId !== 'string' || !ID_RE.test(assessmentId)) {
    return NextResponse.json({ error: 'Invalid assessmentId' }, { status: 400 })
  }
  if (courseId !== undefined && (typeof courseId !== 'string' || !ID_RE.test(courseId))) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()

    const aSnap = await db.collection('assessments').doc(assessmentId).get()
    if (!aSnap.exists) return NextResponse.json({ error: 'ไม่พบแบบทดสอบนี้' }, { status: 404 })
    if ((aSnap.data() as Partial<Assessment>).isPublished !== true) {
      return NextResponse.json({ error: 'แบบทดสอบนี้ยังไม่เผยแพร่' }, { status: 403 })
    }

    let timeLimitMinutes = 0
    if (typeof courseId === 'string') {
      const cSnap = await db.collection('courses').doc(courseId).get()
      const qs = cSnap.exists ? (cSnap.data() as Partial<Course>).quizSettings : undefined
      const raw = Number(qs?.timeLimitMinutes ?? 0)
      // Guard against a nonsense stored value (negative, NaN, absurdly large).
      timeLimitMinutes = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 600) : 0
    }

    const startedAt = new Date()
    const ref = db.collection('assessmentSessions').doc()
    await ref.set({
      uid: gate.uid,
      assessmentId,
      ...(typeof courseId === 'string' ? { courseId } : {}),
      timeLimitMinutes,
      startedAt: FieldValue.serverTimestamp(),
      submittedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      sessionId: ref.id,
      timeLimitMinutes,
      // Absolute epoch ms so the client doesn't have to trust its own clock drift
      // for the starting point — it still counts down locally, but against this.
      deadlineAt: timeLimitMinutes > 0 ? startedAt.getTime() + timeLimitMinutes * 60_000 : null,
      serverNow: startedAt.getTime(),
    })
  } catch (err) {
    console.error('assessment/start failed', err)
    return NextResponse.json({ error: 'เริ่มทำแบบทดสอบไม่สำเร็จ' }, { status: 500 })
  }
}
