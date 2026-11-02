import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'

// The learner brings a course they took off their lists (dismiss) back to My Course. The browser
// cannot clear `dismissedAt` itself — it is a server-owned field (policies.ts).

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
    // Only an existing record: this never creates one.
    if (!(await store.get('trainingRecords', recordId))) {
      return NextResponse.json({ error: 'ไม่พบประวัติการเรียนของหลักสูตรนี้' }, { status: 404 })
    }
    await store.set('trainingRecords', recordId, { dismissedAt: null }, { merge: true })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/training-records/restore', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
