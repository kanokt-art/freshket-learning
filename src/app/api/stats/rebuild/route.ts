import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
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

    const store = getStore()
    const records = await store.query('trainingRecords')

    // Group records by userId.
    const byUid = new Map<string, { status: string; score?: number | null }[]>()
    for (const d of records) {
      const uid = String(d.userId ?? '')
      if (!uid) continue
      if (!byUid.has(uid)) byUid.set(uid, [])
      byUid.get(uid)!.push({ status: String(d.status ?? 'not_started'), score: (d.score as number | undefined) ?? null })
    }

    // One summary per user; the store chunks the write itself.
    const now = new Date()
    const docs = Array.from(byUid.entries()).map(([uid, rows]) => ({
      id: uid,
      data: { ...computeUserStats(uid, rows), updatedAt: now } as Record<string, unknown>,
    }))
    await store.setMany('userStats', docs)

    return NextResponse.json({ ok: true, users: docs.length, records: records.length })
  } catch (e) {
    console.error('POST /api/stats/rebuild', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
