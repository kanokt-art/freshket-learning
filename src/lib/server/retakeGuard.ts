import { NextResponse } from 'next/server'
import { retakeBlocked, RETAKE_REFUSAL } from '@/lib/courses/retake'

// The one place the routes that take a quiz or questionnaire ask "may this learner sit it again?"
// (lib/courses/retake.ts). Returns the refusal response, or null when they may go ahead.

interface ReadStore { get(path: string, id: string): Promise<Record<string, unknown> | null> }

export async function retakeRefusal(store: ReadStore, uid: string, courseId: string): Promise<NextResponse | null> {
  const record = await store.get('trainingRecords', `${uid}_${courseId}`)
  if (!record) return null
  const course = await store.get('courses', courseId)
  return retakeBlocked(course, record)
    ? NextResponse.json({ error: RETAKE_REFUSAL, reason: 'retake_blocked' }, { status: 403 })
    : null
}
