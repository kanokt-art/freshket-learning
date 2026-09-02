import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'
import { computeUserStats } from '@/types/stats'
import type { TrainingStatus } from '@/types/tracking'

// Manual super_admin override of one learner's training record — the roster
// equivalent of the CSV score import (api/csv/course-results), but for a
// single row edited inline instead of a whole file. Firestore rules only let
// a learner write their OWN record and never `score`/`passScore`/
// `attemptCount` at all (see firestore.rules, /trainingRecords) — an admin
// correcting someone else's status or score has no client-side path, so this
// goes through the Admin SDK like every other privileged write in this app.

const VALID_STATUSES: TrainingStatus[] = ['not_started', 'in_progress', 'completed', 'failed']
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }

  const gate = await requireSuperAdmin(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const userId = body.userId
  const courseId = body.courseId
  const courseTitle = typeof body.courseTitle === 'string' ? body.courseTitle : ''
  const status = body.status
  const score = body.score
  const preTestScore = body.preTestScore
  const postTestScore = body.postTestScore

  if (typeof userId !== 'string' || !ID_RE.test(userId)) return bad('Invalid userId')
  if (typeof courseId !== 'string' || !ID_RE.test(courseId)) return bad('Invalid courseId')
  if (status !== undefined && (typeof status !== 'string' || !VALID_STATUSES.includes(status as TrainingStatus))) {
    return bad('Invalid status')
  }
  for (const [name, val] of [['score', score], ['preTestScore', preTestScore], ['postTestScore', postTestScore]] as const) {
    if (val !== undefined && val !== null && (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 100)) {
      return bad(`Invalid ${name} — must be a number between 0 and 100`)
    }
  }

  try {
    const db = getAdminFirestore()
    const recRef = db.collection('trainingRecords').doc(`${userId}_${courseId}`)
    const recSnap = await recRef.get()
    const now = Timestamp.now()

    const payload: Record<string, unknown> = {
      userId,
      courseId,
      source: 'manual',
      updatedAt: now,
    }
    if (courseTitle) payload.courseTitle = courseTitle
    if (status !== undefined) payload.status = status
    // Explicit null clears a field (e.g. admin removes a mistaken score)
    // rather than leaving it unset — Firestore drops `undefined` keys from a
    // merge write, so `null` is the only way to actually blank one out.
    if (score !== undefined) payload.score = score
    if (preTestScore !== undefined) payload.preTestScore = preTestScore
    if (postTestScore !== undefined) payload.postTestScore = postTestScore
    if (status === 'completed' && !recSnap.data()?.completedAt) payload.completedAt = now
    if (!recSnap.exists || !recSnap.data()?.startedAt) payload.startedAt = now

    await recRef.set(payload, { merge: true })

    // Same rollup refresh the CSV import and assessment/submit routes do —
    // a manual override should show up on dashboards immediately, not just
    // in this one record.
    const recs = await db.collection('trainingRecords').where('userId', '==', userId).get()
    const records = recs.docs.map((d) => ({
      status: String(d.data().status ?? 'not_started'),
      score: (d.data().score as number | undefined) ?? null,
    }))
    await db.collection('userStats').doc(userId).set(
      { ...computeUserStats(userId, records), updatedAt: new Date() },
      { merge: true },
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/training-records/override', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
