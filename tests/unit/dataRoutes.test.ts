import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// The routes are thin on purpose — the decisions live in dataApi.ts and
// auth.ts, both tested on their own. What these tests pin is the WIRING, which
// is where a mistake would be silent: that the caller handed to the rules is the
// person the verified token resolved to (not whoever the request body claims to
// be), that an unauthenticated request never reaches the store, and that a
// failure to reach the database is reported as one.

let gate: unknown
vi.mock('@/lib/server/auth', () => ({ authenticate: async () => gate }))

const calls: Array<{ method: string; args: unknown[] }> = []
let storeUnavailable = false
vi.mock('@/lib/server/store', async (original) => {
  const real = await original<typeof import('@/lib/server/store')>()
  const record = (method: string, result: unknown) => async (...args: unknown[]) => { calls.push({ method, args }); return result }
  return {
    ...real,
    getStore: () => {
      if (storeUnavailable) throw new real.StoreError('unavailable', 'no database configured')
      return {
        query: record('query', []),
        get: record('get', null),
        getMany: record('getMany', []),
        set: record('set', undefined),
        update: record('update', undefined),
        remove: record('remove', undefined),
        setMany: record('setMany', undefined),
        removeMany: record('removeMany', undefined),
      }
    },
  }
})

import { POST as query } from '@/app/api/data/query/route'
import { POST as get } from '@/app/api/data/get/route'
import { POST as write } from '@/app/api/data/write/route'
import { POST as session } from '@/app/api/auth/session/route'

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/x', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const signedIn = (role: string, uid = 'csv-E1') => ({
  ok: true, uid, email: 'a@freshket.co', role, isSuperAdmin: role === 'super_admin',
  person: { id: uid, uid, role, email: 'a@freshket.co', displayName: 'A', authUid: 'fb-secret-login' },
})
const denied = { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

beforeEach(() => {
  calls.length = 0
  storeUnavailable = false
  gate = signedIn('sale')
})

describe.each([
  ['query', query, { path: 'courses' }],
  ['get', get, { path: 'courses', id: 'c1' }],
  ['write', write, { ops: [{ op: 'delete', path: 'courses', id: 'c1' }] }],
] as const)('/api/data/%s', (_name, handler, body) => {
  it('turns away an unauthenticated request without touching the store', async () => {
    gate = denied
    const res = await handler(post(body))
    expect(res.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('answers 400 to a body that is not JSON, without touching the store', async () => {
    const res = await handler(post('{not json'))
    expect(res.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('reports an unreachable database as 503', async () => {
    storeUnavailable = true
    gate = signedIn('super_admin')
    const res = await handler(post(body))
    expect(res.status).toBe(503)
  })
})

describe('the caller is whoever the verified token resolved to', () => {
  const ownProgress = (userId: string) => ({
    ops: [{ op: 'set', path: 'trainingRecords', id: `${userId}_c1`, data: { userId, courseId: 'c1', status: 'in_progress' } }],
  })

  it('uses the PERSON id: a learner may write their own record under it', async () => {
    gate = signedIn('sale', 'csv-E1')
    expect((await write(post(ownProgress('csv-E1')))).status).toBe(200)
  })

  it('and not the Firebase uid they sign in with', async () => {
    // If the wiring passed the login id instead of the person id, this would be
    // allowed and every learner's progress would be filed under a person who
    // does not exist.
    gate = signedIn('sale', 'csv-E1')
    expect((await write(post(ownProgress('fb-secret-login')))).status).toBe(403)
  })

  it('ignores a role the request body claims', async () => {
    gate = signedIn('sale')
    const res = await write(post({
      role: 'super_admin', actor: { uid: 'csv-E1', role: 'super_admin' },
      ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'T' } }],
    }))
    expect(res.status).toBe(403)
    expect(calls.filter((c) => c.method === 'set')).toEqual([])
  })

  it('ignores a uid the request body claims', async () => {
    gate = signedIn('sale', 'csv-E1')
    const res = await write(post({ uid: 'someone-else', ...ownProgress('someone-else') }))
    expect(res.status).toBe(403)
  })

  it('reads with the verified role: a learner cannot read the answer key, an admin can', async () => {
    gate = signedIn('sale')
    expect((await query(post({ path: 'assessments' }))).status).toBe(403)
    gate = signedIn('super_admin')
    expect((await query(post({ path: 'assessments' }))).status).toBe(200)
  })
})

describe('/api/auth/session', () => {
  it('turns away an unauthenticated request', async () => {
    gate = denied
    expect((await session(post({}))).status).toBe(401)
  })

  it('returns the person\'s profile', async () => {
    const res = await session(post({}))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ user: { uid: 'csv-E1', role: 'sale', email: 'a@freshket.co' } })
  })

  it('does not hand back the Firebase uid they sign in with', async () => {
    const res = await session(post({}))
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain('fb-secret-login')
    expect(text).not.toContain('authUid')
  })
})
