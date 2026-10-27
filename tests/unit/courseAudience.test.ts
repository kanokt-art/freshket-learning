import { describe, it, expect } from 'vitest'
import { courseAudience } from '@/lib/courses/audience'

const users = [
  { uid: 'a', role: 'sale' },
  { uid: 'b', role: 'sale' },
  { uid: 'c', role: 'manager' },
]
const ids = (list: Array<{ uid: string }>) => list.map((u) => u.uid)

describe('courseAudience', () => {
  it('is exactly the assigned people when any are assigned', () => {
    expect(ids(courseAudience({ assignedUserIds: ['b'], targetRoles: [] }, users))).toEqual(['b'])
  })

  it('ignores targetRoles once people are assigned', () => {
    expect(ids(courseAudience({ assignedUserIds: ['c'], targetRoles: ['sale'] }, users))).toEqual(['c'])
  })

  it('falls back to the target roles when nobody is assigned', () => {
    expect(ids(courseAudience({ assignedUserIds: [], targetRoles: ['sale'] }, users))).toEqual(['a', 'b'])
  })

  it('is NOBODY — not everyone — when there is neither', () => {
    // The bug: an empty targetRoles meant "all roles", so a course with a
    // narrow target showed the whole company as its learners.
    expect(courseAudience({ assignedUserIds: [], targetRoles: [] }, users)).toEqual([])
    expect(courseAudience({}, users)).toEqual([])
  })

  it('is nobody when the course has not loaded', () => {
    expect(courseAudience(null, users)).toEqual([])
    expect(courseAudience(undefined, users)).toEqual([])
  })

  it('skips assigned ids that no longer match a person', () => {
    expect(ids(courseAudience({ assignedUserIds: ['a', 'gone'] }, users))).toEqual(['a'])
  })
})
