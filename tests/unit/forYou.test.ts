import { describe, it, expect } from 'vitest'
import { buildForYou } from '@/lib/courses/forYou'

const d = (s: string) => new Date(`${s}T10:00:00Z`)
const course = (id: string, day: string) => ({ id, updatedAt: d(day) })

describe('buildForYou', () => {
  it('shows a Course Design as one card and not the courses inside it', () => {
    const items = buildForYou(
      [course('a', '2026-11-01'), course('b', '2026-11-02'), course('c', '2026-11-03')],
      [{ id: 'p', courseIds: ['a', 'b'], updatedAt: d('2026-11-05') }],
    )
    expect(items.map((i) => (i.kind === 'design' ? 'design:p' : `course:${i.course.id}`))).toEqual(['design:p', 'course:c'])
  })

  it('orders by when each was launched, newest first', () => {
    const items = buildForYou([course('old', '2026-10-01'), course('new', '2026-11-04')], [{ courseIds: ['x'], updatedAt: d('2026-11-02') }])
    expect(items.map((i) => i.at)).toEqual([d('2026-11-04').getTime(), d('2026-11-02').getTime(), d('2026-10-01').getTime()])
  })

  it('keeps only the five newest, dropping the oldest', () => {
    const many = Array.from({ length: 8 }, (_, i) => course(`c${i}`, `2026-11-0${i + 1}`))
    const items = buildForYou(many, [])
    expect(items).toHaveLength(5)
    expect(items.map((i) => (i.kind === 'course' ? i.course.id : ''))).toEqual(['c7', 'c6', 'c5', 'c4', 'c3'])
  })
})
