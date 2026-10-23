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
import { findBy, patch } from '@/lib/data/collection'

const DEMO_MODE = getDemoMode()

// Best-effort: a failed stats write must never block the learner. The rebuild
// endpoint is the safety net that reconciles any miss.
export async function recomputeMyStats(uid: string | undefined): Promise<void> {
  if (DEMO_MODE || !uid) return
  try {
    const rows = await findBy<{ status?: unknown; score?: number }>('trainingRecords', 'userId', uid)
    const records = rows.map((r) => ({
      status: String(r.status ?? 'not_started'),
      score: r.score ?? null,
    }))
    const stats = computeUserStats(uid, records)
    await patch('userStats', uid, { ...stats, updatedAt: new Date() })
  } catch (e) {
    console.error('recomputeMyStats failed', e)
  }
}
