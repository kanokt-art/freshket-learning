// Client-side upkeep of the per-user training summary (userStats/{uid}).
//
// After a learner's own progress is written to trainingRecords, we recompute
// THAT user's stats from THEIR OWN records only (a small, uid-scoped query) and
// write userStats/{uid}. Recomputing the whole (small) per-user set is correct
// by construction — no fragile increment/decrement deltas that could drift.
// Bulk changes (CSV import, seed) are backfilled server-side via
// /api/stats/rebuild instead.

import { computeUserStats } from '@/types/stats'
import { getDemoMode } from '@/lib/demo/demoMode'

const DEMO_MODE = getDemoMode()

// Best-effort: a failed stats write must never block the learner. The rebuild
// endpoint is the safety net that reconciles any miss.
export async function recomputeMyStats(uid: string | undefined): Promise<void> {
  if (DEMO_MODE || !uid) return
  try {
    const { getClientFirestore, collection, query, where, getDocs, doc, setDoc } = await import('@/lib/firebase/client')
    const db = getClientFirestore()
    const snap = await getDocs(query(collection(db, 'trainingRecords'), where('userId', '==', uid)))
    const records = snap.docs.map((d) => {
      const data = d.data()
      return { status: String(data.status ?? 'not_started'), score: (data.score as number | undefined) ?? null }
    })
    const stats = computeUserStats(uid, records)
    await setDoc(doc(db, 'userStats', uid), { ...stats, updatedAt: new Date() }, { merge: true })
  } catch (e) {
    console.error('recomputeMyStats failed', e)
  }
}
