import { describe, it, expect } from 'vitest'
import { courseAudience } from '@/lib/courses/audience'

const users = [
  { uid: 'a', role: 'sale', department: 'Sales Management', teamId: 't1' },
  { uid: 'b', role: 'sale', department: 'Sales Management', teamId: 't2' },
  { uid: 'c', role: 'manager', department: 'People Experience' },
  { uid: 'd', role: 'sale', department: 'Sales Management', employmentStatus: 'Resigned' },
  { uid: 'e', role: 'sale', department: 'Other', teamId: 't1' },
]
const ids = (list: Array<{ uid: string }>) => list.map((u) => u.uid)

describe('courseAudience: the target entered when the course was made', () => {
  it('is the assigned people when only people are assigned', () => {
    expect(ids(courseAudience({ assignedUserIds: ['b'] }, users))).toEqual(['b'])
  })

  it('is the people in a saved department, even if the sync has not added them yet', () => {
    expect(ids(courseAudience({ assignedDepartments: ['Sales Management'] }, users))).toEqual(['a', 'b'])
  })

  it('is the people in a saved team, matched by team and not by department', () => {
    expect(ids(courseAudience({ assignedTeamIds: ['t1'] }, users))).toEqual(['a', 'e'])
  })

  it('is the union of people, departments and teams', () => {
    const got = courseAudience({ assignedUserIds: ['c'], assignedDepartments: ['Sales Management'], assignedTeamIds: ['t1'] }, users)
    expect(ids(got)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('does not pull in anyone outside the target', () => {
    const got = ids(courseAudience({ assignedDepartments: ['Sales Management'] }, users))
    expect(got).not.toContain('c')
    expect(got).not.toContain('e')
  })

  it('leaves out a resigned person who only matches a condition…', () => {
    expect(ids(courseAudience({ assignedDepartments: ['Sales Management'] }, users))).not.toContain('d')
  })

  it('…but keeps one who was explicitly assigned, so completed work is not erased', () => {
    expect(ids(courseAudience({ assignedUserIds: ['d'] }, users))).toEqual(['d'])
  })

  it('ignores assigned ids that no longer match a person', () => {
    expect(ids(courseAudience({ assignedUserIds: ['a', 'gone'] }, users))).toEqual(['a'])
  })
})

describe('courseAudience: no saved target', () => {
  it('falls back to target roles', () => {
    expect(ids(courseAudience({ targetRoles: ['manager'] }, users))).toEqual(['c'])
  })

  it('ignores target roles once there is a saved target', () => {
    expect(ids(courseAudience({ assignedUserIds: ['c'], targetRoles: ['sale'] }, users))).toEqual(['c'])
  })

  it('is NOBODY — not everyone — when there is nothing at all', () => {
    // The bug: an empty targetRoles meant "all roles", so a course with a
    // narrow target showed the whole company as its learners.
    expect(courseAudience({ assignedUserIds: [], assignedDepartments: [], assignedTeamIds: [], targetRoles: [] }, users)).toEqual([])
    expect(courseAudience({}, users)).toEqual([])
  })

  it('is nobody when the course has not loaded', () => {
    expect(courseAudience(null, users)).toEqual([])
    expect(courseAudience(undefined, users)).toEqual([])
  })
})
