import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/users/save-assignments, with the course sync that now rides along.
//
// WHY A ROUTE-LEVEL TEST. The matching logic is covered as pure functions in
// syncDepartmentAssignments.test.ts. What is NOT covered there, and is where a
// bug here would actually live, is the route's own decisions: which rows count
// as "moved into a team", what happens to the response when the sync fails, and
// what reaches the course roster. None of those can be run against the real
// database without writing to production, so the store is replaced with a small
// in-memory fake and the tests assert on the calls it receives.

// ── Fakes ───────────────────────────────────────────────────────────────────

interface FakeCourse { id: string; data: Record<string, unknown> }

let users: Record<string, Record<string, unknown>> = {}
let courses: FakeCourse[] = []
/** Every write the route made, in order. */
let log: Array<{ kind: 'user' | 'roster'; id: string; data: unknown }> = []
let courseReads = 0
let courseReadError: Error | null = null

const fakeStore = {
  getMany: async (_path: string, ids: string[]) =>
    ids.filter((id) => users[id]).map((id) => ({ id, ...users[id] })),
  update: async (_path: string, id: string, data: Record<string, unknown>) => {
    log.push({ kind: 'user', id, data })
  },
  query: async (path: string) => {
    if (path !== 'courses') throw new Error('unexpected read of ' + path)
    courseReads++
    if (courseReadError) throw courseReadError
    return courses.map((c) => ({ id: c.id, ...c.data }))
  },
  addCourseLearners: async (courseId: string, uids: string[]) => {
    log.push({ kind: 'roster', id: courseId, data: uids })
    return uids.length
  },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

// The route is gated by requireManager; the gate's own behaviour is not what is
// under test, so it is opened and the role is made switchable per test.
let gateIsSuperAdmin = false
vi.mock('@/lib/server/auth', () => ({
  requireManager: async () => ({
    ok: true, uid: 'manager-1', role: gateIsSuperAdmin ? 'super_admin' : 'manager', isSuperAdmin: gateIsSuperAdmin,
  }),
}))

import { POST } from '@/app/api/users/save-assignments/route'

function call(assignments: unknown[]) {
  return POST(new NextRequest('http://localhost/api/users/save-assignments', {
    method: 'POST',
    body: JSON.stringify({ assignments }),
  }))
}

const userWrites = () => log.filter((l) => l.kind === 'user')
const rosterWrites = () => log.filter((l) => l.kind === 'roster')

beforeEach(() => {
  users = {
    'u-new': { department: 'Portfolio Management', employmentStatus: 'Active' },
    'u-gone': { department: 'Portfolio Management', employmentStatus: 'Resigned' },
  }
  courses = [
    { id: 'mbti', data: { assignedTeamIds: ['team-chain'], assignedUserIds: ['u1'] } },
    { id: 'other', data: { assignedTeamIds: ['team-elsewhere'], assignedUserIds: [] } },
  ]
  log = []
  courseReads = 0
  courseReadError = null
  gateIsSuperAdmin = false
})

describe('moving a member into a team', () => {
  it('saves the team and adds them to the courses aimed at it', async () => {
    const res = await call([{ uid: 'u-new', teamId: 'team-chain' }])
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.saved).toBe(1)
    expect(body.courseSync).toEqual({ coursesUpdated: 1, totalAdded: 1 })

    expect(userWrites()).toEqual([{ kind: 'user', id: 'u-new', data: { teamId: 'team-chain' } }])
    expect(rosterWrites().map((w) => w.id)).toEqual(['mbti'])
  })

  it('adds only the newcomer to the roster, never the whole list back', async () => {
    // The roster was read a moment earlier. Writing it back whole would drop
    // anyone another request added in between; adding just the new person cannot.
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(rosterWrites()).toEqual([{ kind: 'roster', id: 'mbti', data: ['u-new'] }])
  })

  it('saves the move before it touches any course', async () => {
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(log.map((l) => l.kind)).toEqual(['user', 'roster'])
  })

  it('leaves courses aimed at other teams alone', async () => {
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(rosterWrites().map((w) => w.id)).not.toContain('other')
  })

  it('does not enrol a resigned employee', async () => {
    const res = await call([{ uid: 'u-gone', teamId: 'team-chain' }])
    const body = await res.json()
    expect(body.saved).toBe(1)                       // the move itself still happens
    expect(body.courseSync).toEqual({ coursesUpdated: 0, totalAdded: 0 })
    expect(rosterWrites()).toEqual([])
  })

  it('handles a bulk move with one course read, not one per person', async () => {
    users['u2'] = { department: 'Portfolio Management' }
    users['u3'] = { department: 'Portfolio Management' }
    courses = [{ id: 'mbti', data: { assignedTeamIds: ['team-chain'], assignedUserIds: [] } }]

    const res = await call([
      { uid: 'u-new', teamId: 'team-chain' },
      { uid: 'u2', teamId: 'team-chain' },
      { uid: 'u3', teamId: 'team-chain' },
    ])
    const body = await res.json()

    // The reason this runs here and not by calling the standalone sync route
    // once per person: that route reads every employee each time.
    expect(courseReads).toBe(1)
    expect(body.courseSync).toEqual({ coursesUpdated: 1, totalAdded: 3 })
    expect(rosterWrites()).toEqual([{ kind: 'roster', id: 'mbti', data: ['u-new', 'u2', 'u3'] }])
  })
})

describe('changes that are not a move into a team', () => {
  it('does not sync when a team is cleared', async () => {
    // Removing someone from a team adds them to nothing.
    const res = await call([{ uid: 'u-new', teamId: null }])
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.courseSync).toBeUndefined()
    expect(courseReads).toBe(0)
  })

  it('does not sync for a visibility-only change', async () => {
    const res = await call([{ uid: 'u-new', visibleTeamIds: ['team-chain'] }])
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.courseSync).toBeUndefined()
    expect(courseReads).toBe(0)
  })

  it('does not sync for someone who no longer exists', async () => {
    // A stale uid (a person who no longer exists) is skipped rather than written; it was
    // never moved, so it must not be enrolled either.
    const res = await call([{ uid: 'stale', teamId: 'team-chain' }])
    const body = await res.json()
    expect(body.skipped).toEqual(['stale'])
    expect(body.courseSync).toBeUndefined()
    expect(courseReads).toBe(0)
  })

  it('does not sync a row rejected for an invalid visibleTeamIds', async () => {
    // The whole row is dropped, including its teamId, so nothing moved.
    const res = await call([{ uid: 'u-new', teamId: 'team-chain', visibleTeamIds: 'not-an-array' }])
    const body = await res.json()
    expect(body.invalid).toEqual(['u-new'])
    expect(body.saved).toBe(0)
    expect(body.courseSync).toBeUndefined()
    expect(courseReads).toBe(0)
  })

  it('syncs only the people who moved when the batch mixes kinds of change', async () => {
    // u2 must exist before the call, or it is skipped as stale and the case
    // would pass without ever exercising a team being cleared.
    users['u2'] = {}
    const res = await call([
      { uid: 'u-new', teamId: 'team-chain' },
      { uid: 'u2', teamId: null },
    ])
    const body = await res.json()
    expect(body.saved).toBe(2)
    expect(body.courseSync).toEqual({ coursesUpdated: 1, totalAdded: 1 })
    expect(rosterWrites()).toEqual([{ kind: 'roster', id: 'mbti', data: ['u-new'] }])
  })
})

describe('when the course sync fails', () => {
  it('still reports the move as saved', async () => {
    // The move is already committed by the time the sync runs. Turning a sync
    // failure into an error response would make the UI tell the admin the move
    // failed when it did not.
    courseReadError = new Error('quota exceeded')
    const res = await call([{ uid: 'u-new', teamId: 'team-chain' }])
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.saved).toBe(1)
    expect(body.courseSync).toEqual({ failed: true })
    expect(userWrites()).toHaveLength(1)
  })

  it('does not write anything to a course', async () => {
    courseReadError = new Error('quota exceeded')
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(rosterWrites()).toEqual([])
  })
})

describe('a manager (not super_admin) moving someone', () => {
  it('gets the course sync too', async () => {
    // The standalone sync route is super_admin-only, which is the reason this
    // runs inside save-assignments (manager+) rather than being called from the
    // browser: a manager's drag would otherwise save the move and silently skip
    // the courses.
    gateIsSuperAdmin = false
    const res = await call([{ uid: 'u-new', teamId: 'team-chain' }])
    const body = await res.json()
    expect(body.courseSync).toEqual({ coursesUpdated: 1, totalAdded: 1 })
  })
})
