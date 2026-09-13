import { describe, it, expect } from 'vitest'
import { computeStreakDays } from '@/types/stats'

// The streak used to be `records.length * 2`, which ignored dates entirely.
// These pin the real behaviour down so it can't drift back.

const NOW = new Date(2026, 8, 13, 10, 0, 0) // 13 Sep 2026, 10:00 local
const daysAgo = (n: number, hour = 12) =>
  new Date(2026, 8, 13 - n, hour, 0, 0)

describe('computeStreakDays', () => {
  it('is 0 when there are no completions', () => {
    expect(computeStreakDays([], NOW)).toBe(0)
  })

  it('counts a single completion today as 1', () => {
    expect(computeStreakDays([daysAgo(0)], NOW)).toBe(1)
  })

  it('counts consecutive days back from today', () => {
    expect(computeStreakDays([daysAgo(0), daysAgo(1), daysAgo(2)], NOW)).toBe(3)
  })

  it('still counts when the most recent completion was yesterday', () => {
    // Grace for the part of today before the learner has finished anything.
    expect(computeStreakDays([daysAgo(1), daysAgo(2)], NOW)).toBe(2)
  })

  it('breaks on a missed day', () => {
    // Today and yesterday, then a gap at 2 days ago.
    expect(computeStreakDays([daysAgo(0), daysAgo(1), daysAgo(3), daysAgo(4)], NOW)).toBe(2)
  })

  it('is 0 when the last completion is older than yesterday', () => {
    expect(computeStreakDays([daysAgo(2), daysAgo(3)], NOW)).toBe(0)
  })

  it('counts several completions on one day as a single day', () => {
    // The old implementation returned 6 for this; the answer is 1.
    expect(computeStreakDays([daysAgo(0, 9), daysAgo(0, 13), daysAgo(0, 17)], NOW)).toBe(1)
  })

  it('ignores undefined and invalid dates', () => {
    expect(computeStreakDays([undefined, daysAgo(0), new Date('nope')], NOW)).toBe(1)
  })

  it('is unaffected by the order the completions arrive in', () => {
    expect(computeStreakDays([daysAgo(2), daysAgo(0), daysAgo(1)], NOW)).toBe(3)
  })

  it('does not let a late-evening and early-morning pair merge into one day', () => {
    // 23:30 yesterday and 00:30 today are an hour apart but are two days.
    expect(computeStreakDays([daysAgo(1, 23), daysAgo(0, 0)], NOW)).toBe(2)
  })
})
