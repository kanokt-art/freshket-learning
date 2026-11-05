import { NextResponse } from 'next/server'

// "Allow a retake after failing" is a setting of the quiz itself (Assessment.allowRetakeOnFail) and it is ON
// unless an admin turned it off. When it is off, a learner who has already failed the quiz (or ran out of time
// on it) may not sit it again; a super_admin who wants someone to start over clears that learner's history
// (POST /api/training-records/reset). A pre-test and a post-test are separate tries of the same quiz, so each
// is judged on its own `step`.

export const RETAKE_ON_FAIL_REFUSAL = 'แบบทดสอบนี้ไม่เปิดให้ทำซ้ำเมื่อสอบไม่ผ่าน หากต้องการทำใหม่ ให้ติดต่อ Admin'

interface AttemptLike { passed?: unknown; step?: unknown; [k: string]: unknown }
interface ReadStore {
  query(path: string, q: { where: Array<{ field: string; op: '=='; value: unknown }> }): Promise<AttemptLike[]>
}

/** True when this learner is shut out of the quiz by a failed try, given the quiz's setting and their attempts. */
export function failedRetakeBlocked(
  allowRetakeOnFail: unknown,
  attempts: readonly AttemptLike[],
  step?: string,
): boolean {
  if (allowRetakeOnFail !== false) return false
  return attempts.some((a) => a.passed !== true && (a.step ?? undefined) === (step ?? undefined))
}

/** Whether this learner has failed this quiz before, with the quiz not allowing a retake. */
export async function retakeOnFailBlocked(
  store: ReadStore,
  uid: string,
  assessmentId: string,
  assessment: { allowRetakeOnFail?: unknown },
  step?: string,
): Promise<boolean> {
  if (assessment.allowRetakeOnFail !== false) return false
  const attempts = await store.query('assessmentAttempts', {
    where: [{ field: 'uid', op: '==', value: uid }, { field: 'assessmentId', op: '==', value: assessmentId }],
  })
  return failedRetakeBlocked(assessment.allowRetakeOnFail, attempts, step)
}

export function retakeOnFailRefusal(): NextResponse {
  return NextResponse.json({ error: RETAKE_ON_FAIL_REFUSAL, reason: 'retake_on_fail_off' }, { status: 403 })
}
