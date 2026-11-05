import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Who may read a learner's quiz attempts (score, try number, time taken): an admin, the lead of their team,
// the learner themself — nobody else. The answers are never sent.

type Doc = Record<string, unknown> & { id: string }
let docs: Record<string, Doc[]> = {}
const fakeStore = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  query: async (path: string, q?: { where?: Array<{ field: string; value: unknown }> }) =>
    (docs[path] ?? []).filter((d) => (q?.where ?? []).every((w) => d[w.field] === w.value)),
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

let caller: { uid: string; role: string; isSuperAdmin: boolean; person: Record<string, unknown> }
vi.mock('@/lib/server/auth', () => ({ requireStaff: async () => ({ ok: true, ...caller }) }))

import { GET } from '@/app/api/assessment/attempts/route'

const call = (uid: string, courseId = 'c1') =>
  GET(new NextRequest(`http://localhost/api/assessment/attempts?uid=${uid}&courseId=${courseId}`))

const person = (id: string, role: string, extra: Record<string, unknown> = {}) => ({ id, uid: id, role, ...extra })
const as = (p: Record<string, unknown>) => { caller = { uid: String(p.id), role: String(p.role), isSuperAdmin: p.role === 'super_admin', person: p } }

beforeEach(() => {
  docs = {
    users: [person('learner', 'sale', { teamId: 't1', rank: 'JG5' }), person('lead', 'team_lead', { teamId: 't1', rank: 'JG7' })],
    teams: [{ id: 't1', name: 'Team 1', teamLeadIds: ['lead'] }],
    assessmentAttempts: [
      { id: 'a2', uid: 'learner', courseId: 'c1', assessmentTitle: 'Post', step: 'post', attemptNumber: 2, score: 90, passed: true, elapsedMs: 600000, limitMs: 1200000, createdAt: new Date('2026-11-02T10:00:00Z'), answers: [{ secret: 1 }] },
      { id: 'a1', uid: 'learner', courseId: 'c1', assessmentTitle: 'Post', step: 'post', attemptNumber: 1, score: 50, passed: false, elapsedMs: 300000, createdAt: new Date('2026-11-01T10:00:00Z'), answers: [] },
      { id: 'other', uid: 'learner', courseId: 'c2', score: 10, createdAt: new Date('2026-11-01T10:00:00Z') },
    ],
  }
})

describe('GET /api/assessment/attempts', () => {
  it('gives an admin the course\'s attempts oldest first, without the answers', async () => {
    as(person('admin', 'super_admin'))
    const res = await call('learner')
    expect(res.status).toBe(200)
    const { attempts } = await res.json()
    expect(attempts.map((a: { id: string }) => a.id)).toEqual(['a1', 'a2'])
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, score: 90, passed: true, elapsedMs: 600000, limitMs: 1200000 })
    expect(JSON.stringify(attempts)).not.toContain('secret')
  })

  it('lets the learner\'s own team lead read them', async () => {
    as(docs.users[1])
    expect((await call('learner')).status).toBe(200)
  })

  it('lets a learner read their own', async () => {
    as(docs.users[0])
    expect((await call('learner')).status).toBe(200)
  })

  it('turns away a colleague who is not responsible for them', async () => {
    as(person('peer', 'sale', { teamId: 't1', rank: 'JG5' }))
    expect((await call('learner')).status).toBe(403)
  })

  it('refuses malformed ids', async () => {
    as(person('admin', 'super_admin'))
    expect((await call('a/b')).status).toBe(400)
  })
})
