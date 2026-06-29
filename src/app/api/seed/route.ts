import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  MOCK_USERS,
  MOCK_COURSES,
  MOCK_ASSESSMENTS,
  MOCK_RESOURCES,
  MOCK_TRAINING_RECORDS,
} from '@/lib/utils/mockData'

const SEED_DOC_ID = '__seed_meta__'

export async function POST() {
  // Block in production unless explicitly allowed
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    return NextResponse.json({ error: 'Seed is disabled in production' }, { status: 403 })
  }

  try {
    const db = getAdminFirestore()
    const now = Timestamp.now()

    // Check if already seeded
    const meta = await db.collection('_meta').doc(SEED_DOC_ID).get()
    if (meta.exists) {
      return NextResponse.json(
        { message: 'Already seeded. Use DELETE to clear first.', seededAt: meta.data()?.seededAt },
        { status: 200 },
      )
    }

    let userCount = 0
    let courseCount = 0
    let assessmentCount = 0
    let resourceCount = 0
    let recordCount = 0

    // ── Users ──────────────────────────────────────────────
    const userBatch = db.batch()
    for (const u of MOCK_USERS) {
      userBatch.set(db.collection('users').doc(u.uid), {
        ...u,
        createdAt: now,
        updatedAt: now,
        _isMock: true,
      })
      userCount++
    }
    await userBatch.commit()

    // ── Courses ────────────────────────────────────────────
    const courseBatch = db.batch()
    for (const c of MOCK_COURSES) {
      courseBatch.set(db.collection('courses').doc(c.id), {
        ...c,
        createdAt: now,
        updatedAt: now,
        _isMock: true,
      })
      courseCount++
    }
    await courseBatch.commit()

    // ── Assessments ────────────────────────────────────────
    const assessBatch = db.batch()
    for (const a of MOCK_ASSESSMENTS) {
      assessBatch.set(db.collection('assessments').doc(a.id), {
        ...a,
        createdAt: now,
        updatedAt: now,
        _isMock: true,
      })
      assessmentCount++
    }
    await assessBatch.commit()

    // ── Resources ──────────────────────────────────────────
    const resBatch = db.batch()
    for (const r of MOCK_RESOURCES) {
      resBatch.set(db.collection('resources').doc(r.id), {
        ...r,
        createdAt: now,
        updatedAt: now,
        _isMock: true,
      })
      resourceCount++
    }
    await resBatch.commit()

    // ── Training Records ───────────────────────────────────
    const recBatch = db.batch()
    for (const rec of MOCK_TRAINING_RECORDS) {
      const docId = `${rec.userId}_${rec.courseId}`
      recBatch.set(db.collection('trainingRecords').doc(docId), {
        ...rec,
        id: docId,
        completedAt: rec.completedAt ? Timestamp.fromDate(rec.completedAt) : null,
        dueDate: rec.dueDate ? Timestamp.fromDate(rec.dueDate) : null,
        updatedAt: now,
        _isMock: true,
      })
      recordCount++
    }
    await recBatch.commit()

    // ── Seed meta ──────────────────────────────────────────
    await db.collection('_meta').doc(SEED_DOC_ID).set({
      seededAt: now,
      counts: { userCount, courseCount, assessmentCount, resourceCount, recordCount },
    })

    return NextResponse.json({
      success: true,
      seeded: { users: userCount, courses: courseCount, assessments: assessmentCount, resources: resourceCount, trainingRecords: recordCount },
    })
  } catch (e) {
    console.error('POST /api/seed', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    return NextResponse.json({ error: 'Seed clear is disabled in production' }, { status: 403 })
  }

  try {
    const db = getAdminFirestore()

    const deleteMockDocs = async (col: string): Promise<number> => {
      const snap = await db.collection(col).where('_isMock', '==', true).get()
      const batch = db.batch()
      snap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
      return snap.size
    }

    const [u, c, a, r, t] = await Promise.all([
      deleteMockDocs('users'),
      deleteMockDocs('courses'),
      deleteMockDocs('assessments'),
      deleteMockDocs('resources'),
      deleteMockDocs('trainingRecords'),
    ])

    await db.collection('_meta').doc(SEED_DOC_ID).delete()

    return NextResponse.json({ success: true, deleted: { users: u, courses: c, assessments: a, resources: r, trainingRecords: t } })
  } catch (e) {
    console.error('DELETE /api/seed', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const db = getAdminFirestore()
    const meta = await db.collection('_meta').doc(SEED_DOC_ID).get()
    if (!meta.exists) {
      return NextResponse.json({ seeded: false })
    }
    return NextResponse.json({ seeded: true, ...meta.data() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
