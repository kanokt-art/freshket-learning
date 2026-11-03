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

import { newestEntries, recommendedEntries, yourCourseCount, type LibraryStat } from '@/lib/courses/library'
import { toggleSaved } from '@/lib/courses/savedCourses'

describe('library rows and counts', () => {
  const now = new Date('2026-11-03T00:00:00Z')
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000)
  const open = (id: string, createdAt: Date, over: Record<string, unknown> = {}) => course(id, { openEnrollment: true, createdAt, ...over })
  const entries = libraryEntries(
    [open('old', day(90)), open('new1', day(2)), open('new2', day(10)), open('mine', day(1), { assignedUserIds: ['u1'] })],
    [], me,
  )

  it('newest: recent and not already mine, newest first', () => {
    expect(newestEntries(entries, now).map((e) => e.course.id)).toEqual(['new1', 'new2'])
  })

  it('recommended: only what colleagues in my department took, most first', () => {
    const stats: Record<string, LibraryStat> = {
      old: { learners: 9, completed: 4, teamPeers: 0, deptPeers: 2 },
      new1: { learners: 3, completed: 1, teamPeers: 1, deptPeers: 5 },
      new2: { learners: 20, completed: 9, teamPeers: 0, deptPeers: 0 },
    }
    expect(recommendedEntries(entries, stats).map((e) => e.course.id)).toEqual(['new1', 'old'])
  })

  it('counts Your Course: aimed at me, published, not taken off', () => {
    const cs = [course('a', { assignedUserIds: ['u1'] }), course('b', { assignedUserIds: ['u1'] }), course('c'), course('d', { assignedUserIds: ['u1'], isPublished: false })]
    expect(yourCourseCount(cs, [{ courseId: 'b', status: 'completed', dismissedAt: 'x' }], me)).toBe(1)
  })

  it('save toggles', () => {
    expect(toggleSaved([], 'a')).toEqual(['a'])
    expect(toggleSaved(['a', 'b'], 'a')).toEqual(['b'])
  })
})
