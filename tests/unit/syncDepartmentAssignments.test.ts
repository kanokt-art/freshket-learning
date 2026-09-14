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
