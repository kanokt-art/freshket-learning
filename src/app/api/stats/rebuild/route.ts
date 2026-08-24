import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'
import { computeUserStats } from '@/types/stats'

// POST /api/stats/rebuild
// Recomputes every userStats/{uid} summary from the trainingRecords collection.
// This is the source-of-truth backfill: run it once to seed the summaries and
// again any time bulk data changed (CSV import, seed) or drift is suspected.
// The per-learner runtime path keeps individual summaries fresh on its own.
export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const db = getAdminFirestore()
    const snap = await db.collection('trainingRecords').get()

    // Group records by userId.
    const byUid = new Map<string, { status: string; score?: number | null }[]>()
    snap.forEach((doc) => {
      const d = doc.data()
      const uid = String(d.userId ?? '')
      if (!uid) return
      if (!byUid.has(uid)) byUid.set(uid, [])
      byUid.get(uid)!.push({ status: String(d.status ?? 'not_started'), score: (d.score as number | undefined) ?? null })
    })

    // Batch-write one summary per user (Firestore caps batches at 500 ops).
    const now = new Date()
    const entries = Array.from(byUid.entries())
    let written = 0
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch()
      for (const [uid, records] of entries.slice(i, i + 400)) {
        batch.set(db.collection('userStats').doc(uid), { ...computeUserStats(uid, records), updatedAt: now })
        written++
      }
      await batch.commit()
    }

    return NextResponse.json({ ok: true, users: written, records: snap.size })
  } catch (e) {
    console.error('POST /api/stats/rebuild', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
