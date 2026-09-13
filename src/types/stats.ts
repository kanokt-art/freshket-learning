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

/**
 * Consecutive-day learning streak, counted back from today over the days the
 * learner finished a course.
 *
 * This used to be `myRecords.length * 2` — a number that had nothing to do with
 * dates at all, so finishing seven courses in one sitting showed a "14-day
 * streak" while someone who studied daily for a month showed two. It is now
 * derived from `completedAt`.
 *
 * Caveat worth knowing: completions are the only per-day signal the system
 * stores (there is no activity log), so a day spent working through a long
 * course without finishing it does not count. Yesterday is allowed as the most
 * recent day so the streak doesn't read 0 all morning before that day's first
 * completion.
 */
export function computeStreakDays(completedAt: (Date | undefined)[], now: Date = new Date()): number {
  const MS_PER_DAY = 86_400_000
  const dayIndex = (d: Date) => Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY,
  )

  const days = new Set<number>()
  for (const d of completedAt) {
    if (!d) continue
    const date = d instanceof Date ? d : new Date(d)
    if (isNaN(date.getTime())) continue
    days.add(dayIndex(date))
  }
  if (days.size === 0) return 0

  const today = dayIndex(now)
  // Start at today when there's a completion today, else at yesterday — any
  // older gap means the streak has already been broken.
  let cursor = days.has(today) ? today : today - 1
  if (!days.has(cursor)) return 0

  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor--
  }
  return streak
}
