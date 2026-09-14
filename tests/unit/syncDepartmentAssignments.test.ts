import { describe, it, expect } from 'vitest'
import { computeDepartmentAssignmentSync } from '@/lib/courses/syncDepartmentAssignments'

describe('computeDepartmentAssignmentSync', () => {
  it('adds a new active employee in a tracked department', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: ['u1'] }],
      [
        { uid: 'u1', department: 'Sales Management' },
        { uid: 'u2', department: 'Sales Management' }, // new hire, not yet assigned
      ],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1', 'u2'], addedUids: ['u2'] },
    ])
  })

  it('produces nothing for a course with no assignedDepartments', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedUserIds: ['u1'] }],
      [{ uid: 'u2', department: 'Sales Management' }],
    )
    expect(results).toEqual([])
  })

  it('produces nothing when nobody new matches (already fully synced)', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: ['u1'] }],
      [{ uid: 'u1', department: 'Sales Management' }],
    )
    expect(results).toEqual([])
  })

  it('is additive: never removes a uid already in assignedUserIds', () => {
    // u1 was manually added but is NOT in the tracked department -- must survive.
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: ['u1'] }],
      [
        { uid: 'u1', department: 'Marketing' },
        { uid: 'u2', department: 'Sales Management' },
      ],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1', 'u2'], addedUids: ['u2'] },
    ])
  })

  it('excludes a resigned employee even if their department matches', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: [] }],
      [{ uid: 'u1', department: 'Sales Management', employmentStatus: 'Resigned' }],
    )
    expect(results).toEqual([])
  })

  it('treats a missing employmentStatus as active', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: [] }],
      [{ uid: 'u1', department: 'Sales Management' }],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1'], addedUids: ['u1'] },
    ])
  })

  it('matches any of multiple tracked departments', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management', 'Key Account Management'], assignedUserIds: [] }],
      [
        { uid: 'u1', department: 'Sales Management' },
        { uid: 'u2', department: 'Key Account Management' },
        { uid: 'u3', department: 'Marketing' },
      ],
    )
    expect(results[0].addedUids.sort()).toEqual(['u1', 'u2'])
  })

  it('handles multiple courses independently', () => {
    const results = computeDepartmentAssignmentSync(
      [
        { id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: [] },
        { id: 'c2', assignedDepartments: ['Marketing'], assignedUserIds: [] },
      ],
      [
        { uid: 'u1', department: 'Sales Management' },
        { uid: 'u2', department: 'Marketing' },
      ],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1'], addedUids: ['u1'] },
      { courseId: 'c2', newAssignedUserIds: ['u2'], addedUids: ['u2'] },
    ])
  })

  it('skips a user with no department', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Sales Management'], assignedUserIds: [] }],
      [{ uid: 'u1' }],
    )
    expect(results).toEqual([])
  })
})

describe('computeDepartmentAssignmentSync — assignedTeamIds (partial team-level selection)', () => {
  it('adds a new active employee whose teamId matches a tracked team', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedTeamIds: ['team-samc'], assignedUserIds: ['u1'] }],
      [
        { uid: 'u1', teamId: 'team-samc' },
        { uid: 'u2', teamId: 'team-samc' }, // new joiner to the tracked team
        { uid: 'u3', teamId: 'team-other' }, // different team, must not match
      ],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1', 'u2'], addedUids: ['u2'] },
    ])
  })

  it('matches on EITHER assignedDepartments OR assignedTeamIds', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Portfolio Management'], assignedTeamIds: ['team-samc'], assignedUserIds: [] }],
      [
        { uid: 'u1', department: 'Portfolio Management' }, // matches by department
        { uid: 'u2', teamId: 'team-samc' },                // matches by team, different department
        { uid: 'u3', department: 'Marketing', teamId: 'team-other' }, // matches neither
      ],
    )
    expect(results[0].addedUids.sort()).toEqual(['u1', 'u2'])
  })

  it('does not double-add someone who matches both conditions', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedDepartments: ['Key Account Management'], assignedTeamIds: ['team-samc'], assignedUserIds: [] }],
      [{ uid: 'u1', department: 'Key Account Management', teamId: 'team-samc' }],
    )
    expect(results).toEqual([
      { courseId: 'c1', newAssignedUserIds: ['u1'], addedUids: ['u1'] },
    ])
  })

  it('produces nothing for a course with neither condition set', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedUserIds: ['u1'] }],
      [{ uid: 'u2', teamId: 'team-samc' }],
    )
    expect(results).toEqual([])
  })

  it('excludes a resigned employee even if their teamId matches', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'c1', assignedTeamIds: ['team-samc'], assignedUserIds: [] }],
      [{ uid: 'u1', teamId: 'team-samc', employmentStatus: 'Resigned' }],
    )
    expect(results).toEqual([])
  })
})
