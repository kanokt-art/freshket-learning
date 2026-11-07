import { describe, it, expect } from 'vitest'
import { journeyStates } from '@/lib/feedback/leadReviews'
import { unseenFeedbackCourses, unseenFeedbackCounts } from '@/lib/feedback/unseen'

describe('journeyStates', () => {
  it('lets a manager give feedback before the team lead, and the other simply waits', () => {
    expect(journeyStates({ takeaway: true, teamLead: false, manager: true })).toEqual(['done', 'next', 'done'])
  })
  it('does not lock the manager behind the team lead or the learner', () => {
    expect(journeyStates({ takeaway: false, teamLead: false, manager: false })).toEqual(['next', 'next', 'next'])
  })
})

describe('unseenFeedbackCourses', () => {
  const at = (s: string) => new Date(`${s}T10:00:00Z`)
  const reviews = [
    { courseId: 'a', comment: 'ดีมาก', updatedAt: at('2026-11-05') },
    { courseId: 'b', score: 4, updatedAt: at('2026-11-01') },
    { courseId: 'c', comment: '', score: 0, updatedAt: at('2026-11-06') }, // says nothing: no dot
  ]
  it('flags a course whose feedback is newer than what was read', () => {
    const seen: Record<string, number> = { a: 0, b: at('2026-11-02').getTime() }
    expect(unseenFeedbackCourses(reviews, (id) => seen[id] ?? 0).sort()).toEqual(['a'])
  })
  it('clears once the newest feedback has been read', () => {
    expect(unseenFeedbackCourses(reviews, () => at('2026-11-30').getTime())).toEqual([])
  })
})

describe('unseenFeedbackCounts', () => {
  const at = (s: string) => new Date(`${s}T10:00:00Z`)
  it('counts each unread comment per course, a team lead and a manager separately', () => {
    const reviews = [
      { courseId: 'a', leadRole: 'team_lead', comment: 'ดี', updatedAt: at('2026-11-05') },
      { courseId: 'a', leadRole: 'manager', score: 4, updatedAt: at('2026-11-06') },
      { courseId: 'b', comment: 'เก่า', updatedAt: at('2026-11-01') },
      { courseId: 'c', comment: '', score: 0, updatedAt: at('2026-11-06') },
    ]
    const seen: Record<string, number> = { b: at('2026-11-02').getTime() }
    const out = unseenFeedbackCounts(reviews, (id) => seen[id] ?? 0)
    expect(out.get('a')).toBe(2)
    expect(out.has('b')).toBe(false)
    expect(out.has('c')).toBe(false)
  })
})
