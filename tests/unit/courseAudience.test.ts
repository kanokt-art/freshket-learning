import { describe, it, expect } from 'vitest'
import { courseAudience, isInCourseTarget, resultsRoster } from '@/lib/courses/audience'

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


describe('isInCourseTarget: a new joiner gets the courses already aimed at them', () => {
  const newSale = { uid: 'new', role: 'sale', department: 'Sales Management', teamId: 't1' }

  it('matches a saved department without the person being on the roster yet', () => {
    // The bug: the roster is a snapshot, so someone who joined after the last
    // sync was in the target and still did not see the course.
    expect(isInCourseTarget({ assignedUserIds: ['old'], assignedDepartments: ['Sales Management'] }, newSale)).toBe(true)
  })

  it('matches a saved team', () => {
    expect(isInCourseTarget({ assignedTeamIds: ['t1'] }, newSale)).toBe(true)
  })

  it('matches by being named on the roster', () => {
    expect(isInCourseTarget({ assignedUserIds: ['new'] }, { uid: 'new', role: 'sale' })).toBe(true)
  })

  it('matches by role when the course names roles', () => {
    expect(isInCourseTarget({ targetRoles: ['sale'] }, { uid: 'x', role: 'sale' })).toBe(true)
  })

  it('does not match someone outside every part of the target', () => {
    expect(isInCourseTarget(
      { assignedUserIds: ['old'], assignedDepartments: ['Finance'], assignedTeamIds: ['t9'], targetRoles: ['manager'] },
      newSale,
    )).toBe(false)
  })

  it('does not match a course with no target at all', () => {
    expect(isInCourseTarget({}, newSale)).toBe(false)
    expect(isInCourseTarget({ assignedUserIds: [], assignedDepartments: [], assignedTeamIds: [], targetRoles: [] }, newSale)).toBe(false)
  })

  it('does not match a department by team id or the reverse', () => {
    expect(isInCourseTarget({ assignedDepartments: ['t1'] }, newSale)).toBe(false)
    expect(isInCourseTarget({ assignedTeamIds: ['Sales Management'] }, newSale)).toBe(false)
  })

  it('does not let a resigned person match on a condition, but keeps them if named', () => {
    const gone = { uid: 'gone', role: 'sale', department: 'Sales Management', employmentStatus: 'Resigned' }
    expect(isInCourseTarget({ assignedDepartments: ['Sales Management'] }, gone)).toBe(false)
    expect(isInCourseTarget({ assignedUserIds: ['gone'] }, gone)).toBe(true)
  })
})

describe('resultsRoster: who the results list, so finished work does not vanish', () => {
  const people = [
    { uid: 'a', role: 'sale', department: 'Sales Management' },
    { uid: 'b', role: 'sale', department: 'Other' },
    { uid: 'gone', role: 'sale', department: 'Sales Management', employmentStatus: 'Resigned' },
    { uid: 'off-roster', role: 'sale', department: 'Other' },
  ]
  const course = { assignedDepartments: ['Sales Management'] }
  const ids = (l: Array<{ uid: string }>) => l.map((u) => u.uid)

  it('is the audience when nobody has a record', () => {
    expect(ids(resultsRoster(course, people, [], 'c1'))).toEqual(['a'])
  })

  it('adds a resigned person who has a record for THIS course', () => {
    // A condition alone leaves them out; their completed work keeps them listed.
    expect(ids(resultsRoster(course, people, [{ userId: 'gone', courseId: 'c1' }], 'c1'))).toEqual(['a', 'gone'])
  })

  it('adds someone with a record who was never, or is no longer, on the roster', () => {
    expect(ids(resultsRoster(course, people, [{ userId: 'off-roster', courseId: 'c1' }], 'c1'))).toEqual(['a', 'off-roster'])
  })

  it('ignores records that belong to a different course', () => {
    expect(ids(resultsRoster(course, people, [{ userId: 'gone', courseId: 'other-course' }], 'c1'))).toEqual(['a'])
  })

  it('does not list a record for a person who no longer exists', () => {
    expect(ids(resultsRoster(course, people, [{ userId: 'deleted', courseId: 'c1' }], 'c1'))).toEqual(['a'])
  })

  it('lists nobody for a course with no target and no records', () => {
    expect(resultsRoster({}, people, [], 'c1')).toEqual([])
  })
});
