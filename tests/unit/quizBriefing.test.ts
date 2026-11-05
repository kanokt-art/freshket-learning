import { describe, it, expect } from 'vitest'
import { quizBriefing, formatMinutes, formatElapsed } from '@/lib/assessment/briefing'

const mc = (points = 1) => ({ type: 'multiple_choice' as const, points })

describe('quizBriefing', () => {
  it('says how many questions must be right to pass', () => {
    const b = quizBriefing(Array.from({ length: 10 }, () => mc()), 80, 20)
    expect(b).toMatchObject({ questionCount: 10, gradedCount: 10, timeLimitMinutes: 20, passingScore: 80, passItems: 8 })
  })

  it('rounds the way grading does (7 of 9 is 78%, 8 of 9 is 89%)', () => {
    expect(quizBriefing(Array.from({ length: 9 }, () => mc()), 80).passItems).toBe(8)
  })

  it('leaves written questions out of the count', () => {
    const qs = [...Array.from({ length: 4 }, () => mc()), { type: 'open_ended' as const, points: 5 }]
    const b = quizBriefing(qs, 75)
    expect(b.questionCount).toBe(5)
    expect(b.gradedCount).toBe(4)
    expect(b.passItems).toBe(3)
  })

  it('does not name a number when the questions are worth different points', () => {
    expect(quizBriefing([mc(1), mc(3)], 70).passItems).toBeNull()
  })

  it('is untimed without a limit, and has no pass count without graded questions', () => {
    expect(quizBriefing([mc()], 70).timeLimitMinutes).toBeNull()
    expect(quizBriefing([mc()], 70, 0).timeLimitMinutes).toBeNull()
    expect(quizBriefing([{ type: 'open_ended', points: 5 }], 70).passItems).toBeNull()
  })
})

describe('formatting', () => {
  it('writes minutes and elapsed time', () => {
    expect(formatMinutes(45)).toBe('45 นาที')
    expect(formatMinutes(90)).toBe('1 ชม. 30 นาที')
    expect(formatMinutes(120)).toBe('2 ชม.')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
  })
})
