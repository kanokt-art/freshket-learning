// Per-user training aggregate — a tiny summary doc (one per user) that the
// dashboards read instead of scanning the entire trainingRecords collection.
// Kept minimal on purpose: names/photos are joined from the users collection.
export interface UserStats {
  uid: string
  totalCount: number      // # of training records (courses the user has a record for)
  completedCount: number  // # with status 'completed'
  scoreSum: number        // Σ score of completed records with score > 0  → leaderboard points
  scoredCount: number     // # of completed records with score > 0        → for averages
  updatedAt?: Date
}

// Pure aggregation over a user's own records. Used both by the client recompute
// (after a learner finishes a course) and by the admin rebuild endpoint, so the
// definition of the numbers lives in exactly one place.
export function computeUserStats(
  uid: string,
  records: { status: string; score?: number | null }[],
): Omit<UserStats, 'updatedAt'> {
  let totalCount = 0
  let completedCount = 0
  let scoreSum = 0
  let scoredCount = 0
  for (const r of records) {
    totalCount++
    if (r.status === 'completed') {
      completedCount++
      const s = r.score ?? 0
      if (s > 0) {
        scoreSum += s
        scoredCount++
      }
    }
  }
  return { uid, totalCount, completedCount, scoreSum, scoredCount }
}

// Average completed-course score (0 when the user has no scored completions).
export function statsAvgScore(s: Pick<UserStats, 'scoreSum' | 'scoredCount'>): number {
  return s.scoredCount > 0 ? s.scoreSum / s.scoredCount : 0
}
