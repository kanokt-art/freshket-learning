import { describe, it, expect } from 'vitest'
import {
  computeDepartmentAssignmentSync,
  usersForMoveSync,
} from '@/lib/courses/syncDepartmentAssignments'

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

// ── A member moved into a new team ──────────────────────────────────────────
// The scenario an admin cares about: a course is aimed at a team or department,
// and someone is dragged into it later. These run the move through the same
// two functions the save-assignments route uses, so the route's behaviour is
// pinned without needing the Admin SDK.
describe('moving a member into a team', () => {
  const profiles = new Map([
    ['u-new', { department: 'Portfolio Management', employmentStatus: 'Active' }],
    ['u-gone', { department: 'Portfolio Management', employmentStatus: 'Resigned' }],
  ])

  it('adds them to a course that tracks the team they moved into', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'mbti', assignedTeamIds: ['team-chain'], assignedUserIds: ['u1'] }],
      usersForMoveSync([{ uid: 'u-new', teamId: 'team-chain' }], profiles),
    )
    expect(results).toEqual([
      { courseId: 'mbti', newAssignedUserIds: ['u1', 'u-new'], addedUids: ['u-new'] },
    ])
  })

  it('matches on the NEW team, never the one they left', () => {
    // The stored profile still holds the old teamId when this runs. If the move
    // were matched against it, a course on the old team would re-add the person
    // and a course on the new team would miss them.
    const users = usersForMoveSync([{ uid: 'u-new', teamId: 'team-new' }], profiles)
    expect(users[0].teamId).toBe('team-new')

    const results = computeDepartmentAssignmentSync(
      [
        { id: 'old-course', assignedTeamIds: ['team-old'], assignedUserIds: [] },
        { id: 'new-course', assignedTeamIds: ['team-new'], assignedUserIds: [] },
      ],
      users,
    )
    expect(results.map((r) => r.courseId)).toEqual(['new-course'])
  })

  it('still picks them up through a whole-department course', () => {
    // A move does not change their department, so a course tracking the whole
    // department must keep covering them.
    const results = computeDepartmentAssignmentSync(
      [{ id: 'pm', assignedDepartments: ['Portfolio Management'], assignedUserIds: [] }],
      usersForMoveSync([{ uid: 'u-new', teamId: 'any-team' }], profiles),
    )
    expect(results[0].addedUids).toEqual(['u-new'])
  })

  it('does not enrol a resigned employee, whatever team they are dragged to', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'mbti', assignedTeamIds: ['team-chain'], assignedUserIds: [] }],
      usersForMoveSync([{ uid: 'u-gone', teamId: 'team-chain' }], profiles),
    )
    expect(results).toEqual([])
  })

  it('changes nothing for a course that does not track where they went', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'other', assignedTeamIds: ['team-elsewhere'], assignedUserIds: [] }],
      usersForMoveSync([{ uid: 'u-new', teamId: 'team-chain' }], new Map()),
    )
    expect(results).toEqual([])
  })

  it('does not touch a course that already has them', () => {
    const results = computeDepartmentAssignmentSync(
      [{ id: 'mbti', assignedTeamIds: ['team-chain'], assignedUserIds: ['u-new'] }],
      usersForMoveSync([{ uid: 'u-new', teamId: 'team-chain' }], profiles),
    )
    expect(results).toEqual([])
  })

  it('never removes them from the courses of the team they left', () => {
    // Additive by design: only the courses that CHANGED are returned, so the old
    // team's course is simply absent from the result and keeps its roster.
    const results = computeDepartmentAssignmentSync(
      [
        { id: 'old-course', assignedTeamIds: ['team-old'], assignedUserIds: ['u-new'] },
        { id: 'new-course', assignedTeamIds: ['team-new'], assignedUserIds: [] },
      ],
      usersForMoveSync([{ uid: 'u-new', teamId: 'team-new' }], profiles),
    )
    expect(results.map((r) => r.courseId)).toEqual(['new-course'])
  })

  it('handles several people moving at once, each into a different team', () => {
    const results = computeDepartmentAssignmentSync(
      [
        { id: 'a', assignedTeamIds: ['team-a'], assignedUserIds: [] },
        { id: 'b', assignedTeamIds: ['team-b'], assignedUserIds: [] },
      ],
      usersForMoveSync(
        [{ uid: 'u1', teamId: 'team-a' }, { uid: 'u2', teamId: 'team-b' }],
        new Map(),
      ),
    )
    expect(results).toEqual([
      { courseId: 'a', newAssignedUserIds: ['u1'], addedUids: ['u1'] },
      { courseId: 'b', newAssignedUserIds: ['u2'], addedUids: ['u2'] },
    ])
  })
})

describe('usersForMoveSync', () => {
  it('carries department and employment status from the stored profile', () => {
    const out = usersForMoveSync(
      [{ uid: 'u1', teamId: 't1' }],
      new Map([['u1', { department: 'People Experience', employmentStatus: 'Active' }]]),
    )
    expect(out).toEqual([
      { uid: 'u1', teamId: 't1', department: 'People Experience', employmentStatus: 'Active' },
    ])
  })

  it('keeps a move whose profile is missing, so the team condition can still match', () => {
    const out = usersForMoveSync([{ uid: 'ghost', teamId: 't1' }], new Map())
    expect(out).toEqual([
      { uid: 'ghost', teamId: 't1', department: undefined, employmentStatus: undefined },
    ])
  })

  it('returns nothing for no moves', () => {
    expect(usersForMoveSync([], new Map())).toEqual([])
  })
})
