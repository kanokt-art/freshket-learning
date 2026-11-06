import { describe, it, expect } from 'vitest'
import { projectCourse, sameProjection, DRAFT_PROJECTION } from '@/lib/courses/designProjection'

const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe('projectCourse', () => {
  it('is null (a draft) when no live Course Design holds the course', () => {
    expect(projectCourse('a', [])).toBeNull()
    expect(projectCourse('a', [{ isPublished: false, courseIds: ['a'] }])).toBeNull()
    expect(projectCourse('a', [{ isPublished: true, courseIds: ['b'] }])).toBeNull()
  })

  it('takes the audience and dates of the one live design that holds it', () => {
    const p = projectCourse('a', [{
      isPublished: true, courseIds: ['a', 'b'],
      assignedUserIds: ['u1', 'u2'], assignedDepartments: ['Sales'], assignedTeamIds: ['t1'],
      startDate: day('2026-11-10'), endDate: day('2026-12-31'),
    }])
    expect(p).toMatchObject({
      isPublished: true, assignedUserIds: ['u1', 'u2'], assignedDepartments: ['Sales'], assignedTeamIds: ['t1'], targetRoles: [],
    })
    expect(p?.startDate?.toISOString()).toBe('2026-11-10T00:00:00.000Z')
    expect(p?.endDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })

  it('unions the audiences when two live designs hold it, opening on the earlier start and closing on the later end', () => {
    const p = projectCourse('a', [
      { isPublished: true, courseIds: ['a'], assignedUserIds: ['u1'], assignedDepartments: ['Sales'], startDate: day('2026-11-10'), endDate: day('2026-12-01') },
      { isPublished: true, courseIds: ['a'], assignedUserIds: ['u1', 'u2'], assignedDepartments: ['People'], startDate: day('2026-11-01'), endDate: day('2026-12-31') },
      { isPublished: false, courseIds: ['a'], assignedUserIds: ['ghost'] },
    ])
    expect(p?.assignedUserIds).toEqual(['u1', 'u2'])
    expect(p?.assignedDepartments).toEqual(['Sales', 'People'])
    expect(p?.startDate?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(p?.endDate?.toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })

  it('has no start date or deadline as soon as any live design has none', () => {
    const p = projectCourse('a', [
      { isPublished: true, courseIds: ['a'], startDate: day('2026-11-10'), endDate: day('2026-12-31') },
      { isPublished: true, courseIds: ['a'] },
    ])
    expect(p?.startDate).toBeNull()
    expect(p?.endDate).toBeNull()
  })
})

describe('sameProjection', () => {
  const live = projectCourse('a', [{ isPublished: true, courseIds: ['a'], assignedUserIds: ['u1', 'u2'], startDate: day('2026-11-10') }])!

  it('is true for the same audience in another order and dates as strings', () => {
    expect(sameProjection(live, {
      isPublished: true, assignedUserIds: ['u2', 'u1'], assignedDepartments: [], assignedTeamIds: [], targetRoles: [],
      startDate: '2026-11-10T00:00:00.000Z', endDate: null,
    })).toBe(true)
  })

  it('notices a change of audience, date or published state', () => {
    const base = { isPublished: true, assignedUserIds: ['u1', 'u2'], assignedDepartments: [], assignedTeamIds: [], targetRoles: [], startDate: day('2026-11-10'), endDate: null }
    expect(sameProjection(live, { ...base, assignedUserIds: ['u1'] })).toBe(false)
    expect(sameProjection(live, { ...base, startDate: day('2026-11-11') })).toBe(false)
    expect(sameProjection(live, { ...base, isPublished: false })).toBe(false)
  })

  it('reads a draft course as the draft projection', () => {
    expect(sameProjection(DRAFT_PROJECTION, { isPublished: false, assignedUserIds: [], targetRoles: [] })).toBe(true)
    expect(sameProjection(DRAFT_PROJECTION, { isPublished: true, assignedUserIds: [] })).toBe(false)
  })
})
