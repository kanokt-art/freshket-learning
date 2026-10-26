// Keeping one person's training summary (userStats) in step with their records.
//
// Three server routes did this by hand after changing someone's records — the
// quiz submit, the manual override and the CSV import — each with its own copy
// of "read this person's records, fold them, write the summary". The numbers
// themselves are defined once, in computeUserStats; this is the read-and-write
// around it.

import { computeUserStats } from '@/types/stats'
import type { Store } from './store'

/** Recompute this person's summary from ALL of their records and store it. */
export async function refreshUserStats(store: Pick<Store, 'query' | 'set'>, uid: string): Promise<void> {
  const rows = await store.query('trainingRecords', { where: [{ field: 'userId', op: '==', value: uid }] })
  const records = rows.map((r) => ({
    status: String(r.status ?? 'not_started'),
    score: typeof r.score === 'number' ? r.score : null,
  }))
  await store.set('userStats', uid, { ...computeUserStats(uid, records), updatedAt: new Date() }, { merge: true })
}

const STATS_CHUNK = 200

/**
 * Recompute the summaries of many people at once, from one read per
 * {@link STATS_CHUNK} people rather than one per person. A CSV import touches
 * hundreds of them. Someone in `uids` with no records at all gets zeros, so an
 * old summary does not outlive the records it described.
 */
export async function refreshManyUserStats(
  store: Pick<Store, 'query' | 'setMany'>,
  uids: string[],
): Promise<void> {
  const unique = Array.from(new Set(uids))
  const now = new Date()
  for (let i = 0; i < unique.length; i += STATS_CHUNK) {
    const chunk = unique.slice(i, i + STATS_CHUNK)
    const rows = await store.query('trainingRecords', { where: [{ field: 'userId', op: 'in', value: chunk }] })

    const byUid = new Map<string, { status: string; score: number | null }[]>(chunk.map((u) => [u, []]))
    for (const r of rows) {
      byUid.get(String(r.userId))?.push({
        status: String(r.status ?? 'not_started'),
        score: typeof r.score === 'number' ? r.score : null,
      })
    }
    await store.setMany(
      'userStats',
      chunk.map((uid) => ({ id: uid, data: { ...computeUserStats(uid, byUid.get(uid) ?? []), updatedAt: now } })),
      { merge: true },
    )
  }
}
