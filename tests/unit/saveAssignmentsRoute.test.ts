import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/users/save-assignments, with the course sync that now rides along.
//
// WHY A ROUTE-LEVEL TEST. The matching logic is covered as pure functions in
// syncDepartmentAssignments.test.ts. What is NOT covered there, and is where a
// bug here would actually live, is the route's own decisions: which rows count
// as "moved into a team", what happens to the response when the sync fails, and
// what shape of write reaches the course document. None of those can be run
// against the real database without writing to production, so the Admin SDK is
// replaced with a small in-memory fake and the tests assert on the writes it
// receives.

// ── Fakes ───────────────────────────────────────────────────────────────────

interface FakeUser { exists: boolean; data?: Record<string, unknown> }
interface FakeCourse { id: string; data: Record<string, unknown> }
interface RecordedBatch { updates: { path: string; data: Record<string, unknown> }[]; committed: boolean }

let users: Record<string, FakeUser> = {}
let courses: FakeCourse[] = []
let batches: RecordedBatch[] = []
let courseReads = 0
let courseReadError: Error | null = null

const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}` }),
    select: () => ({
      get: async () => {
        courseReads++
        if (courseReadError) throw courseReadError
        return { docs: courses.map((c) => ({ id: c.id, data: () => c.data })) }
      },
    }),
  }),
  getAll: async (...refs: { path: string }[]) =>
    refs.map((r) => {
      const id = r.path.split('/')[1]
      const u = users[id]
      return { id, exists: !!u?.exists, data: () => u?.data }
    }),
  batch: () => {
    const b: RecordedBatch = { updates: [], committed: false }
    batches.push(b)
    return {
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        b.updates.push({ path: ref.path, data })
      },
      commit: async () => { b.committed = true },
    }
  },
}

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => fakeDb }))

// The route is gated by requireManager; the gate's own behaviour is not what is
// under test, so it is opened and the role is made switchable per test.
let gateIsSuperAdmin = false
vi.mock('@/lib/firebase/requireManager', () => ({
  requireManager: async () => ({
    ok: true, uid: 'manager-1', role: gateIsSuperAdmin ? 'super_admin' : 'manager', isSuperAdmin: gateIsSuperAdmin,
  }),
}))

// arrayUnion is replaced by a marker so the test can see that a union — not a
// whole array — was written.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayUnion: (...values: string[]) => ({ __arrayUnion: values }) },
}))

import { POST } from '@/app/api/users/save-assignments/route'

function call(assignments: unknown[]) {
  return POST(new NextRequest('http://localhost/api/users/save-assignments', {
    method: 'POST',
    body: JSON.stringify({ assignments }),
  }))
}

/** The batch holding user writes vs the one holding course writes. */
const userBatch = () => batches.find((b) => b.updates.some((u) => u.path.startsWith('users/')))
const courseBatch = () => batches.find((b) => b.updates.some((u) => u.path.startsWith('courses/')))

beforeEach(() => {
  users = {
    'u-new': { exists: true, data: { department: 'Portfolio Management', employmentStatus: 'Active' } },
    'u-gone': { exists: true, data: { department: 'Portfolio Management', employmentStatus: 'Resigned' } },
  }
  courses = [
    { id: 'mbti', data: { assignedTeamIds: ['team-chain'], assignedUserIds: ['u1'] } },
    { id: 'other', data: { assignedTeamIds: ['team-elsewhere'], assignedUserIds: [] } },
  ]
  batches = []
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

    expect(userBatch()?.updates).toEqual([{ path: 'users/u-new', data: { teamId: 'team-chain' } }])
    expect(courseBatch()?.updates.map((u) => u.path)).toEqual(['courses/mbti'])
  })

  it('writes a union, not the whole array back', async () => {
    // The roster was read a moment earlier. Writing it back whole would drop
    // anyone another request added in between; a union cannot.
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(courseBatch()?.updates[0].data).toEqual({
      assignedUserIds: { __arrayUnion: ['u-new'] },
    })
  })

  it('commits the move before it touches any course', async () => {
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(batches[0].committed).toBe(true)
    expect(batches[0].updates[0].path).toBe('users/u-new')
  })

  it('leaves courses aimed at other teams alone', async () => {
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    const touched = courseBatch()?.updates.map((u) => u.path) ?? []
    expect(touched).not.toContain('courses/other')
  })

  it('does not enrol a resigned employee', async () => {
    const res = await call([{ uid: 'u-gone', teamId: 'team-chain' }])
    const body = await res.json()
    expect(body.saved).toBe(1)                       // the move itself still happens
    expect(body.courseSync).toEqual({ coursesUpdated: 0, totalAdded: 0 })
    expect(courseBatch()).toBeUndefined()
  })

  it('handles a bulk move with one course read, not one per person', async () => {
    users['u2'] = { exists: true, data: { department: 'Portfolio Management' } }
    users['u3'] = { exists: true, data: { department: 'Portfolio Management' } }
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
    expect(courseBatch()?.updates[0].data).toEqual({
      assignedUserIds: { __arrayUnion: ['u-new', 'u2', 'u3'] },
    })
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
    // A stale uid (merged away by dedup) is skipped rather than written; it was
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
    users['u2'] = { exists: true, data: {} }
    const res = await call([
      { uid: 'u-new', teamId: 'team-chain' },
      { uid: 'u2', teamId: null },
    ])
    const body = await res.json()
    expect(body.saved).toBe(2)
    expect(body.courseSync).toEqual({ coursesUpdated: 1, totalAdded: 1 })
    expect(courseBatch()?.updates[0].data).toEqual({
      assignedUserIds: { __arrayUnion: ['u-new'] },
    })
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
    expect(userBatch()?.committed).toBe(true)
  })

  it('does not write anything to a course', async () => {
    courseReadError = new Error('quota exceeded')
    await call([{ uid: 'u-new', teamId: 'team-chain' }])
    expect(courseBatch()).toBeUndefined()
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
