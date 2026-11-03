import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// POST /api/users/auto-map-teams: the HR import's Line Manager column puts people without a team into
// that manager's team. The matching itself is covered in autoMapTeam.test.ts; this checks what the
// route does with it: who is written, who is left alone, and what is reported back.

let users: Record<string, Record<string, unknown>> = {}
let teams: Record<string, Record<string, unknown>> = {}
let writes: Array<{ id: string; data: Record<string, unknown> }> = []
let roster: Array<{ courseId: string; uids: string[] }> = []

const fakeStore = {
  query: async (path: string) => {
    if (path === 'users') return Object.entries(users).map(([id, d]) => ({ id, ...d }))
    if (path === 'teams') return Object.entries(teams).map(([id, d]) => ({ id, ...d }))
    if (path === 'courses') return []
    throw new Error('unexpected read of ' + path)
  },
  update: async (_p: string, id: string, data: Record<string, unknown>) => { writes.push({ id, data }) },
  addCourseLearners: async (courseId: string, uids: string[]) => { roster.push({ courseId, uids }); return uids.length },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))
vi.mock('@/lib/server/auth', () => ({ requireManager: async () => ({ ok: true, uid: 'm1', role: 'manager', isSuperAdmin: false }) }))

import { POST } from '@/app/api/users/auto-map-teams/route'

const call = () => POST(new NextRequest('http://localhost/api/users/auto-map-teams', { method: 'POST' }))

beforeEach(() => {
  writes = []; roster = []
  users = {
    lead: { displayNameEN: 'Pataranuch Suyavech', nickname: 'Tao', employmentStatus: 'Active', teamId: 't1' },
    newbie: { displayNameEN: 'Somchai J', nickname: 'Chai', lineManager: 'Pataranuch (Tao)', employmentStatus: 'Active' },
    placed: { displayNameEN: 'Already P', nickname: 'P', lineManager: 'Pataranuch (Tao)', employmentStatus: 'Active', teamId: 'other' },
    gone: { displayNameEN: 'Gone G', nickname: 'G', lineManager: 'Pataranuch (Tao)', employmentStatus: 'Resigned' },
    orphan: { displayNameEN: 'Orphan O', nickname: 'O', lineManager: 'Nobody (Nick)', employmentStatus: 'Active' },
  }
  teams = { t1: { name: 'Team Tao', teamLeadIds: ['lead'] } }
})

describe('POST /api/users/auto-map-teams', () => {
  it('puts a person with no team into their line manager\'s team, and no one else', async () => {
    const res = await call()
    const json = await res.json()
    expect(json.mapped).toBe(1)
    expect(writes).toEqual([{ id: 'newbie', data: { teamId: 't1' } }])
  })

  it('never moves someone who already has a team, nor someone who has left', async () => {
    await call()
    expect(writes.map((w) => w.id)).not.toContain('placed')
    expect(writes.map((w) => w.id)).not.toContain('gone')
  })

  it('reports the line managers that are not a team lead anywhere, with how many people wait on each', async () => {
    const json = await (await call()).json()
    expect(json.unmatchedManagers).toEqual([{ name: 'Nobody (Nick)', people: 1 }])
  })

  it('does nothing when everyone is placed', async () => {
    users = { lead: users.lead, placed: users.placed }
    const json = await (await call()).json()
    expect(json.mapped).toBe(0)
    expect(writes).toEqual([])
  })
})
