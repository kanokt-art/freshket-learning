import { describe, it, expect } from 'vitest'
import { libraryEntries } from '@/lib/courses/library'

const me = { uid: 'u1', role: 'sale', department: 'Sales Management' }
const course = (id: string, over: Record<string, unknown> = {}) => ({ id, isPublished: true, targetRoles: [], ...over })

describe('libraryEntries', () => {
  it('lists a finished course, flagged when the learner took it off their lists', () => {
    const cs = [course('a', { assignedUserIds: ['u1'] }), course('b', { assignedUserIds: ['u1'] })]
    const recs = [{ courseId: 'a', status: 'completed' }, { courseId: 'b', status: 'completed', dismissedAt: '2026-11-02T00:00:00Z' }]
    const r = libraryEntries(cs, recs, me)
    expect(r.map((e) => [e.course.id, e.finished, e.dismissed, e.enrolled])).toEqual([['a', true, false, true], ['b', true, true, true]])
  })

  it('lists an open-enrollment course, enrolled or not; leaves out one that is neither finished nor open', () => {
    const cs = [course('open', { openEnrollment: true }), course('mine', { openEnrollment: true, assignedUserIds: ['u1'] }), course('other')]
    const r = libraryEntries(cs, [], me)
    expect(r.map((e) => [e.course.id, e.enrolled])).toEqual([['open', false], ['mine', true]])
  })

  it('never lists a draft, or a course that is open but unpublished', () => {
    const cs = [course('d', { isPublished: false, openEnrollment: true }), course('e', { isPublished: false })]
    expect(libraryEntries(cs, [{ courseId: 'e', status: 'completed' }], me)).toEqual([])
  })

  it('an unfinished record alone does not put a course in the library', () => {
    expect(libraryEntries([course('a', { assignedUserIds: ['u1'] })], [{ courseId: 'a', status: 'in_progress' }], me)).toEqual([])
  })
})
