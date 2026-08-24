import { describe, it, expect } from 'vitest'
import { computeUserStats, statsAvgScore } from '@/types/stats'

// computeUserStats is the single definition of every number on the leaderboard
// and the team dashboards — the client recompute after a learner finishes a
// course, the CSV-import backfill, and the admin rebuild endpoint all call it.
// A change here silently moves every reported figure, so it's pinned down.

describe('computeUserStats', () => {
  it('counts every record but only completed ones toward completion', () => {
    const s = computeUserStats('u1', [
      { status: 'completed', score: 80 },
      { status: 'in_progress' },
      { status: 'failed', score: 40 },
      { status: 'not_started' },
    ])
    expect(s).toEqual({ uid: 'u1', totalCount: 4, completedCount: 1, scoreSum: 80, scoredCount: 1 })
  })

  it('is empty-safe', () => {
    expect(computeUserStats('u1', [])).toEqual({
      uid: 'u1', totalCount: 0, completedCount: 0, scoreSum: 0, scoredCount: 0,
    })
  })

  it('excludes a failed record from the score even when it has one', () => {
    const s = computeUserStats('u1', [{ status: 'failed', score: 95 }])
    expect(s.scoreSum).toBe(0)
    expect(s.scoredCount).toBe(0)
  })

  it('treats a null/absent score on a completed record as unscored', () => {
    const s = computeUserStats('u1', [
      { status: 'completed' },
      { status: 'completed', score: null },
      { status: 'completed', score: 60 },
    ])
    expect(s.completedCount).toBe(3)
    expect(s.scoredCount).toBe(1)
    expect(s.scoreSum).toBe(60)
  })

  // Documents a real quirk rather than asserting it is desirable: the guard is
  // `score > 0`, so a legitimately-earned 0 is dropped from the average instead
  // of pulling it down. Flagged as BUG-13 in the test plan — when that is fixed
  // this test should flip to expecting scoredCount 1.
  it('KNOWN QUIRK: a genuine score of 0 is excluded from the average', () => {
    const s = computeUserStats('u1', [{ status: 'completed', score: 0 }])
    expect(s.completedCount).toBe(1)
    expect(s.scoredCount).toBe(0)
    expect(statsAvgScore(s)).toBe(0)
  })
})

describe('statsAvgScore', () => {
  it('averages scored completions', () => {
    expect(statsAvgScore({ scoreSum: 240, scoredCount: 3 })).toBe(80)
  })

  it('returns 0 rather than dividing by zero', () => {
    expect(statsAvgScore({ scoreSum: 0, scoredCount: 0 })).toBe(0)
  })
})
