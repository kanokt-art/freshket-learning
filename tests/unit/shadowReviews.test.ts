import { describe, it, expect } from 'vitest'
import {
  reviewId, recordIdOf, groupByRecord, primaryReview, averageRating, reviewerRoleLabel, type ReviewDoc,
} from '@/lib/shadow/reviews'

const rv = (over: Partial<ReviewDoc> = {}): ReviewDoc => ({
  id: 'v1__tl', recordId: 'v1', reviewerUid: 'tl', reviewerName: 'TL', reviewerRole: 'team_lead',
  rating: 4, comment: 'good', reviewedAt: new Date('2026-03-01T10:00:00Z'), ...over,
})

describe('reviewId', () => {
  it('is the visit and the reviewer, so two reviewers of one visit have two reviews', () => {
    expect(reviewId('v1', 'tl')).toBe('v1__tl')
    expect(reviewId('v1', 'tl')).not.toBe(reviewId('v1', 'mgr'))
  })

  it('is the same every time for the same pair, so a reviewer edits their own review', () => {
    expect(reviewId('v1', 'tl')).toBe(reviewId('v1', 'tl'))
  })

  it('does not collide across visits', () => {
    expect(reviewId('v1', 'tl')).not.toBe(reviewId('v2', 'tl'))
  })
})

describe('recordIdOf', () => {
  it('reads the visit from the review', () => {
    expect(recordIdOf({ id: 'v1__tl', recordId: 'v1' })).toBe('v1')
  })

  it('falls back to the id for a review kept under the old scheme, where id was the visit', () => {
    expect(recordIdOf({ id: 'v1' })).toBe('v1')
    expect(recordIdOf({ id: 'v1', recordId: '' })).toBe('v1')
  })
})

describe('groupByRecord', () => {
  it('collects the reviews of each visit, newest first', () => {
    const older = rv({ id: 'v1__tl', reviewedAt: new Date('2026-03-01T10:00:00Z') })
    const newer = rv({ id: 'v1__mgr', reviewerUid: 'mgr', reviewerRole: 'manager', reviewedAt: new Date('2026-03-02T10:00:00Z') })
    const other = rv({ id: 'v2__tl', recordId: 'v2' })
    const g = groupByRecord([older, newer, other])
    expect(g.get('v1')!.map((r) => r.reviewerUid)).toEqual(['mgr', 'tl'])
    expect(g.get('v2')).toHaveLength(1)
    expect(g.size).toBe(2)
  })

  it('groups an old-scheme review under its own id', () => {
    const g = groupByRecord([rv({ id: 'legacy', recordId: undefined })])
    expect(g.get('legacy')).toHaveLength(1)
  })

  it('copes with nothing', () => {
    expect(groupByRecord([]).size).toBe(0)
  })

  it('copes with a date that came back as text', () => {
    const a = rv({ id: 'a', reviewedAt: '2026-03-01T10:00:00Z' as unknown as Date })
    const b = rv({ id: 'b', reviewedAt: '2026-03-05T10:00:00Z' as unknown as Date })
    expect(groupByRecord([a, b]).get('v1')!.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('primaryReview', () => {
  const tl = rv({ reviewerUid: 'tl', reviewedAt: new Date('2026-03-01T00:00:00Z') })
  const mgr = rv({ id: 'v1__mgr', reviewerUid: 'mgr', reviewedAt: new Date('2026-03-02T00:00:00Z') })

  it('shows the viewer their own review when they gave one', () => {
    expect(primaryReview([mgr, tl], 'tl')).toBe(tl)
  })

  it('otherwise the latest', () => {
    expect(primaryReview([mgr, tl], 'someone-else')).toBe(mgr)
    expect(primaryReview([mgr, tl])).toBe(mgr)
  })

  it('is nothing when there are no reviews', () => {
    expect(primaryReview([], 'tl')).toBeUndefined()
    expect(primaryReview(undefined, 'tl')).toBeUndefined()
  })
})

describe('averageRating', () => {
  it('is the mean of the stars, to one decimal', () => {
    expect(averageRating([{ rating: 5 }, { rating: 4 }])).toBe(4.5)
    expect(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toBe(4.3)
  })

  it('is null with no reviews', () => {
    expect(averageRating([])).toBeNull()
  })

  it('ignores a review with no stars rather than counting it as zero', () => {
    expect(averageRating([{ rating: 4 }, { rating: 0 }])).toBe(4)
    expect(averageRating([{ rating: 0 }])).toBeNull()
  })
})

describe('reviewerRoleLabel', () => {
  it('names the reviewer’s role', () => {
    expect(reviewerRoleLabel('team_lead')).toBe('Team Lead')
    expect(reviewerRoleLabel('manager')).toBe('Manager')
  })

  it('is empty for no role or one it does not know', () => {
    expect(reviewerRoleLabel(undefined)).toBe('')
    expect(reviewerRoleLabel('sale')).toBe('')
  })
})
