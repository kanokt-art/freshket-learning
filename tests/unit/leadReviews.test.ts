import { describe, it, expect } from 'vitest'
import { latestBySlot, leadReviewId, newestReviewTime, slotOfReview } from '@/lib/feedback/leadReviews'

describe('a team lead\'s and a manager\'s feedback, kept apart', () => {
  it('each reviewer saves under their own id', () => {
    expect(leadReviewId('u1', 'c1', 'lead1')).toBe('u1_c1__lead1')
  })

  it('a manager (or above) goes in the manager box; a team lead, or an old record with no role, in the team lead box', () => {
    expect(slotOfReview({ leadRole: 'manager' })).toBe('manager')
    expect(slotOfReview({ leadRole: 'super_admin' })).toBe('manager')
    expect(slotOfReview({ leadRole: 'team_lead' })).toBe('team_lead')
    expect(slotOfReview({})).toBe('team_lead')
  })

  it('keeps the latest of each, and ignores an empty one', () => {
    const r = latestBySlot([
      { id: 'a', leadRole: 'team_lead', score: 3, updatedAt: '2026-11-01' },
      { id: 'b', leadRole: 'team_lead', comment: 'ดีขึ้นมาก', updatedAt: '2026-11-04' },
      { id: 'c', leadRole: 'manager', score: 5, updatedAt: '2026-11-02' },
      { id: 'd', leadRole: 'manager', score: null, comment: '  ', updatedAt: '2026-11-05' },
    ])
    expect(r.team_lead?.id).toBe('b')
    expect(r.manager?.id).toBe('c')
    expect(latestBySlot([])).toEqual({ team_lead: undefined, manager: undefined })
  })

  it('the newest moment drives the "new feedback" signal', () => {
    expect(newestReviewTime([])).toBe(0)
    expect(newestReviewTime([{ score: 4, updatedAt: '2026-11-04T00:00:00Z' }, { score: 2, updatedAt: '2026-11-01T00:00:00Z' }]))
      .toBe(new Date('2026-11-04T00:00:00Z').getTime())
  })
})
