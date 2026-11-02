import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import { canDismissCourse, DISMISS_REFUSALS } from '@/lib/courses/dismiss'

// A learner takes a finished course off their own lists. The browser cannot write `dismissedAt`
// itself (policies.ts): the rule — passed, and not failed on the first attempt — needs the quiz
// attempts, which only the server can read.

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
    const recordId = `${uid}_${courseId}`
    const record = await store.get('trainingRecords', recordId)
    const attempts = record
      ? await store.query('assessmentAttempts', {
          where: [{ field: 'uid', op: '==', value: uid }, { field: 'courseId', op: '==', value: courseId }],
        })
      : []
    const verdict = canDismissCourse(record, attempts)
    if (!verdict.ok) {
      return NextResponse.json({ error: DISMISS_REFUSALS[verdict.reason], reason: verdict.reason }, { status: 403 })
    }
    await store.set('trainingRecords', recordId, { dismissedAt: new Date() }, { merge: true })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/training-records/dismiss', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
