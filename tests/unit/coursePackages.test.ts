import { describe, it, expect } from 'vitest'
import { packageProgress, packageVisibleTo, moveCourse, addCourse, removeCourse, type PackageCourseStatus } from '@/lib/courses/packages'

const me = { uid: 'u1', role: 'sale', department: 'Sales', teamId: 't1' }

const courses = [
  { id: 'a', isPublished: true, assignedDepartments: ['Sales'] },
  { id: 'b', isPublished: true, assignedDepartments: ['Sales'] },
  { id: 'c', isPublished: true, assignedDepartments: ['Sales'] },
  { id: 'other', isPublished: true, assignedDepartments: ['People'] },
  { id: 'draft', isPublished: false, assignedDepartments: ['Sales'] },
]

const statuses = (m: Record<string, PackageCourseStatus>) => (id: string) => m[id] ?? 'not_started'

describe('packageProgress', () => {
  it('lists the courses in package order, leaving out a missing or unpublished one', () => {
    const p = packageProgress({ courseIds: ['c', 'gone', 'a', 'draft', 'b'] }, courses, statuses({}), me)
    expect(p.items.map((i) => i.course.id)).toEqual(['c', 'a', 'b'])
  })

  it('counts only the courses that are the learner\'s, and finds the next one to do', () => {
    const p = packageProgress({ courseIds: ['a', 'other', 'b', 'c'] }, courses, statuses({ a: 'completed' }), me)
    expect(p.items.find((i) => i.course.id === 'other')?.applicable).toBe(false)
    expect(p).toMatchObject({ total: 3, done: 1, pct: 33 })
    expect(p.next?.course.id).toBe('b')
  })

  it('locks later courses until the earlier ones are done, only when the package is sequential', () => {
    const seq = packageProgress({ courseIds: ['a', 'b', 'c'], sequential: true }, courses, statuses({ a: 'completed', b: 'in_progress' }), me)
    expect(seq.items.map((i) => i.locked)).toEqual([false, false, true])
    const open = packageProgress({ courseIds: ['a', 'b', 'c'] }, courses, statuses({}), me)
    expect(open.items.every((i) => !i.locked)).toBe(true)
  })

  it('does not hold the learner back for a course that is not theirs', () => {
    const p = packageProgress({ courseIds: ['other', 'a'], sequential: true }, courses, statuses({}), me)
    expect(p.items.map((i) => i.locked)).toEqual([false, false])
  })

  it('reports finished when every course of theirs is done', () => {
    const p = packageProgress({ courseIds: ['a', 'b'] }, courses, statuses({ a: 'completed', b: 'completed' }), me)
    expect(p).toMatchObject({ total: 2, done: 2, pct: 100, next: null })
  })
})

describe('packageVisibleTo', () => {
  it('shows a published package with at least one course for the learner', () => {
    expect(packageVisibleTo({ isPublished: true, courseIds: ['other', 'a'] }, courses, me)).toBe(true)
    expect(packageVisibleTo({ isPublished: true, courseIds: ['other'] }, courses, me)).toBe(false)
    expect(packageVisibleTo({ isPublished: true, courseIds: ['draft'] }, courses, me)).toBe(false)
  })

  it('hides a draft package', () => {
    expect(packageVisibleTo({ isPublished: false, courseIds: ['a'] }, courses, me)).toBe(false)
  })
})

describe('editing the order', () => {
  it('moves a course to a new place', () => {
    expect(moveCourse(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveCourse(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveCourse(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
    expect(moveCourse(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })

  it('adds a course once and removes one', () => {
    expect(addCourse(['a'], 'b')).toEqual(['a', 'b'])
    expect(addCourse(['a', 'b'], 'a')).toEqual(['a', 'b'])
    expect(removeCourse(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})

describe('packageProgress as an admin', () => {
  it('treats every course as applicable when asked', () => {
    const p = packageProgress({ courseIds: ['other', 'a'] }, courses, () => 'not_started', me, { allApplicable: true })
    expect(p.items.map((i) => i.applicable)).toEqual([true, true])
    expect(p.total).toBe(2)
  })
})
