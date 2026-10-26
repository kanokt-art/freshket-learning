import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The gates every data-touching route starts with. What matters most is that the
// `uid` they hand back is the PERSON id (csv-{employeeId}), not the Firebase uid:
// a route that writes "on the caller's behalf" under gate.uid is writing under
// the key every record points at. Get that wrong and a signed-in employee's
// progress, notifications and reflections are filed under a person who does not
// exist.

// ── Stand-ins for Firebase Admin and the store ──────────────────────────────

let decodedToken: Record<string, unknown> | Error = {}
vi.mock('@/lib/firebase/admin', () => ({
  getAdminAuth: () => ({
    verifyIdToken: async () => {
      if (decodedToken instanceof Error) throw decodedToken
      return decodedToken
    },
  }),
}))

interface Row { id: string; uid: string; email: string; role: string; authUid?: string; [k: string]: unknown }
let rows: Row[] = []
let storeError: Error | null = null

vi.mock('@/lib/server/store', async (original) => {
  const real = await original<typeof import('@/lib/server/store')>()
  return {
    ...real,
    getStore: () => ({
      async findUsers(by: { authUid: string } | { email: string }) {
        if (storeError) throw storeError
        return rows.filter((r) =>
          'authUid' in by ? r.authUid === by.authUid : r.email.toLowerCase() === by.email.toLowerCase(),
        ).map((r) => ({ ...r }))
      },
      async linkAuthUid(uid: string, authUid: string) {
        const row = rows.find((r) => r.uid === uid)
        if (!row || row.authUid) return false
        row.authUid = authUid
        return true
      },
      async createUser(doc: Record<string, unknown> & { uid: string }, authUid: string) {
        if (!rows.some((r) => r.uid === doc.uid)) rows.push({ ...(doc as Row), id: doc.uid, authUid })
      },
    }),
  }
})

import { authenticate, requireStaff, requireManager, requireSuperAdmin } from '@/lib/server/auth'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/x', { method: 'POST', headers })
const bearer = { authorization: 'Bearer good-token' }

const verified = (over: Record<string, unknown> = {}) => ({
  uid: 'fb-sam', email: 'sam@freshket.co', email_verified: true, name: 'Sam', ...over,
})

beforeEach(() => {
  decodedToken = verified()
  storeError = null
  rows = [{ id: 'csv-E1', uid: 'csv-E1', email: 'Sam@freshket.co', role: 'sale', employeeId: 'E1' }]
})

describe('the token', () => {
  it('is required', async () => {
    const g = await authenticate(req())
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(401)
  })

  it('may arrive in the header', async () => {
    expect((await authenticate(req(bearer))).ok).toBe(true)
  })

  it('may arrive in the body, for the routes that already did that', async () => {
    expect((await authenticate(req(), 'good-token')).ok).toBe(true)
  })

  it('a bad or expired one is a 401, not a 500', async () => {
    // It used to share a catch with everything else, so a stale token was
    // reported as a server fault and sent people looking in the wrong place.
    decodedToken = new Error('auth/id-token-expired')
    const g = await authenticate(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) {
      expect(g.response.status).toBe(401)
      expect(await g.response.json()).toEqual({ error: 'Invalid token' })
    }
  })
})

describe('who is let in', () => {
  it.each([
    ['an unverified email', { email_verified: false }],
    ['another domain', { email: 'sam@gmail.com' }],
    ['a look-alike domain', { email: 'sam@freshket.co.evil.com' }],
    ['no email', { email: undefined }],
  ])('refuses %s with a 403', async (_name, over) => {
    // A valid token for this project can be had for ANY Google account; the hint
    // on the sign-in popup is not enforced by Google.
    decodedToken = verified(over)
    const g = await authenticate(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(403)
  })
})

describe('the identity it hands back', () => {
  it('is the PERSON id, not the Firebase uid', async () => {
    const g = await authenticate(req(bearer))
    expect(g.ok).toBe(true)
    if (g.ok) {
      expect(g.uid).toBe('csv-E1')
      expect(g.uid).not.toBe('fb-sam')
      expect(g.person.uid).toBe('csv-E1')
    }
  })

  it('is the same person on every later sign-in', async () => {
    const a = await authenticate(req(bearer))
    const b = await authenticate(req(bearer))
    expect(a.ok && b.ok && a.uid === b.uid).toBe(true)
    expect(rows).toHaveLength(1)
  })

  it('carries the role and whether they are a super_admin', async () => {
    rows[0].role = 'super_admin'
    const g = await authenticate(req(bearer))
    expect(g.ok && g.role).toBe('super_admin')
    expect(g.ok && g.isSuperAdmin).toBe(true)
  })

  it('gives a brand-new colleague a plain sale row and lets them in as staff', async () => {
    rows = []
    decodedToken = verified({ uid: 'fb-new', email: 'new@freshket.co', name: 'New' })
    const g = await requireStaff(req(bearer))
    expect(g.ok && g.uid).toBe('fb-new')
    expect(g.ok && g.role).toBe('sale')
    expect(rows).toHaveLength(1)
  })
})

describe('requireManager', () => {
  it.each(['sale', 'team_lead'])('refuses a %s', async (role) => {
    rows[0].role = role
    const g = await requireManager(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(403)
  })

  it.each(['manager', 'super_admin'])('lets in a %s', async (role) => {
    rows[0].role = role
    expect((await requireManager(req(bearer))).ok).toBe(true)
  })

  it('refuses a brand-new colleague, who starts as a sale', async () => {
    rows = []
    decodedToken = verified({ uid: 'fb-new', email: 'new@freshket.co' })
    expect((await requireManager(req(bearer))).ok).toBe(false)
  })
})

describe('requireSuperAdmin', () => {
  it.each(['sale', 'team_lead', 'manager'])('refuses a %s', async (role) => {
    rows[0].role = role
    const g = await requireSuperAdmin(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(403)
  })

  it('lets in a super_admin, as the person id', async () => {
    rows[0].role = 'super_admin'
    const g = await requireSuperAdmin(req(bearer))
    expect(g.ok && g.uid).toBe('csv-E1')
  })
})

describe('when the database is the problem', () => {
  it('answers 503 for an outage — the caller did nothing wrong', async () => {
    const { StoreError } = await import('@/lib/server/store')
    storeError = new StoreError('unavailable', 'database unreachable')
    const g = await authenticate(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(503)
  })

  it('answers 500 for anything else unexpected', async () => {
    storeError = new Error('something odd')
    const g = await authenticate(req(bearer))
    expect(g.ok).toBe(false)
    if (!g.ok) expect(g.response.status).toBe(500)
  })

  it('does not leak the underlying message', async () => {
    storeError = new Error('connection string postgres://user:secret@host')
    const g = await authenticate(req(bearer))
    if (!g.ok) expect(JSON.stringify(await g.response.json())).not.toContain('secret')
  })
})
