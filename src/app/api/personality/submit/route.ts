import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireStaff } from '@/lib/firebase/requireStaff'
import { getBucketAssessment, MBTI_DEFINITION } from '@/lib/bucketAssessments'
import { scoreBuckets, minAnswersFor, type BucketAnswers } from '@/lib/bucketAssessments/scoreBuckets'

// Scoring for bucket assessments (MBTI, selling style, and any future one).
//
// Scored server-side for the same reason the graded quizzes are (see
// api/assessment/submit): the client should not be the thing that decides what
// lands in the database. There is no answer key to protect here — the value is
// that userBucketResults is written by one place, with the answers validated
// against the real definition first.
//
// Writes ONLY to userBucketResults/{uid}_{definitionId}. It deliberately does
// not touch trainingRecords.score / passScore / userStats: a bucket result is
// not a grade, and the roster columns and manager notifications that read those
// fields would misreport it as one.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** Accept only { questionId: optionId } string pairs of a plausible size. */
function parseAnswers(raw: unknown, maxEntries: number): BucketAnswers | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > maxEntries) return null

  const out: BucketAnswers = {}
  for (const [qid, value] of entries) {
    if (!ID_RE.test(qid)) return null
    if (typeof value !== 'string' || !ID_RE.test(value)) return null
    out[qid] = value
  }
  return out
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response
  const uid = gate.uid

  // Defaults to MBTI so links created before other questionnaires existed keep
  // resolving to the same assessment they always did.
  const definitionId = body.definitionId
  if (definitionId !== undefined && (typeof definitionId !== 'string' || !ID_RE.test(definitionId))) {
    return bad('Invalid definitionId')
  }
  const def = getBucketAssessment(definitionId as string | undefined) ?? MBTI_DEFINITION

  const courseId = body.courseId
  if (courseId !== undefined && (typeof courseId !== 'string' || !ID_RE.test(courseId))) {
    return bad('Invalid courseId')
  }

  const answers = parseAnswers(body.answers, def.questions.length)
  if (!answers) return bad('Invalid answers payload')

  // scoreBuckets ignores anything that isn't a real option of its own question,
  // so this counts what will actually be scored rather than what was sent.
  const result = scoreBuckets(def, answers)
  const minAnswers = minAnswersFor(def)
  if (result.answered < minAnswers) {
    return bad(`ตอบคำถามอย่างน้อย ${minAnswers} ข้อก่อนส่งผล`)
  }

  try {
    const db = getAdminFirestore()
    // One result per user per questionnaire: retaking replaces the previous
    // result rather than appending, so the profile shows the current answer.
    await db.collection('userBucketResults').doc(`${uid}_${def.id}`).set({
      uid,
      definitionId: def.id,
      code: result.code,
      dimensions: result.dimensions,
      answered: result.answered,
      total: result.total,
      ...(typeof courseId === 'string' ? { courseId } : {}),
      takenAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('bucket assessment submit failed', err)
    return NextResponse.json({ error: 'บันทึกผลไม่สำเร็จ' }, { status: 500 })
  }
}
