import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { refreshUserStats } from '@/lib/server/userStats'

// A super_admin clears one learner's history for one course so they can start it again: the training
// record, and the quiz attempts that belong to that course. Used when a finished course is locked against
// retaking (lib/courses/retake.ts) and an admin decides this learner should redo it. Their saved
// questionnaire result (MBTI profile) is left alone; the next submission replaces it.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const gate = await requireSuperAdmin(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const userId = body.userId
  const courseId = body.courseId
  if (typeof userId !== 'string' || !ID_RE.test(userId)) return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  if (typeof courseId !== 'string' || !ID_RE.test(courseId)) return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })

  try {
    const store = getStore()
    const attempts = await store.query('assessmentAttempts', {
      where: [{ field: 'uid', op: '==', value: userId }, { field: 'courseId', op: '==', value: courseId }],
    })
    await store.removeMany('assessmentAttempts', attempts.map((a) => String(a.id)))
    await store.remove('trainingRecords', `${userId}_${courseId}`)
    await refreshUserStats(store, userId)
    return NextResponse.json({ success: true, attemptsRemoved: attempts.length })
  } catch (e) {
    console.error('POST /api/training-records/reset', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
