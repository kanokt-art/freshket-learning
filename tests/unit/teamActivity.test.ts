import { describe, it, expect } from 'vitest'
import { buildTeamActivity } from '@/lib/team/teamActivity'

const day = (n: number) => new Date(Date.UTC(2026, 10, n))

const base = {
  memberUids: ['a', 'b'],
  records: [],
  takeaways: [],
  shadows: [],
  reviews: [],
  viewerUid: 'lead',
}

describe('buildTeamActivity', () => {
  it('lists only the members, newest first', () => {
    const items = buildTeamActivity({
      ...base,
      records: [
        { userId: 'a', courseId: 'c1', courseTitle: 'Product', status: 'completed', score: 90, completedAt: day(1) },
        { userId: 'x', courseId: 'c1', courseTitle: 'Product', status: 'completed', score: 80, completedAt: day(5) },
      ],
      takeaways: [{ uid: 'b', courseId: 'c1', text: 'learned a lot', updatedAt: day(3) }],
      shadows: [{ id: 's1', observerUid: 'a', storeName: 'Pastel', createdAt: day(2) }],
    })
    expect(items.map((i) => i.kind)).toEqual(['takeaway', 'shadow', 'score'])
    expect(items.every((i) => i.uid !== 'x')).toBe(true)
  })

  it('keeps finished courses with a score, and marks a failed one', () => {
    const items = buildTeamActivity({
      ...base,
      records: [
        { userId: 'a', courseId: 'c1', status: 'in_progress', score: 50, updatedAt: day(1) },
        { userId: 'a', courseId: 'c2', status: 'completed', completedAt: day(1) },
        { userId: 'a', courseId: 'c3', status: 'failed', score: 45, updatedAt: day(2) },
      ],
      courseTitles: new Map([['c3', 'Closing']]),
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'score', title: 'Closing', score: 45, failed: true, href: '/manager?user=a&tab=history' })
  })

  it('skips an empty take away', () => {
    const items = buildTeamActivity({ ...base, takeaways: [{ uid: 'a', courseId: 'c1', text: '  ', updatedAt: day(1) }] })
    expect(items).toEqual([])
  })

  it('knows which visits the viewer has reviewed, by recordId or by review id', () => {
    const items = buildTeamActivity({
      ...base,
      shadows: [
        { id: 's1', observerUid: 'a', createdAt: day(1) },
        { id: 's2', observerUid: 'a', createdAt: day(2) },
        { id: 's3', observerUid: 'b', createdAt: day(3) },
      ],
      reviews: [
        { id: 's1__lead', reviewerUid: 'lead' },
        { id: 'zzz', recordId: 's2', reviewerUid: 'lead' },
        { id: 's3__other', reviewerUid: 'other' },
      ],
    })
    const reviewed = Object.fromEntries(items.map((i) => [i.id, i.reviewed]))
    expect(reviewed).toEqual({ 'shadow:s1': true, 'shadow:s2': true, 'shadow:s3': false })
    expect(items.find((i) => i.id === 'shadow:s1')?.href).toBe('/shadow?visit=s1')
  })
})
