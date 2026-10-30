import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A notification looks like it came from the system, so it must not be something any
// employee can write into anyone's feed with their own words. These pin who may create
// which kind, to whom, and that the wording is composed on the server.

type Doc = Record<string, unknown> & { id: string }
let docs: Record<string, Doc[]> = {}
const written: Array<{ path: string; id: string; data: Record<string, unknown> }> = []

const fakeStore = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  set: async (path: string, id: string, data: Record<string, unknown>) => { written.push({ path, id, data }) },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

let caller: { uid: string; role: string; isSuperAdmin: boolean; person: Record<string, unknown> }
vi.mock('@/lib/server/auth', () => ({ requireStaff: async () => ({ ok: true, ...caller }) }))

import { POST } from '@/app/api/notifications/push/route'

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/notifications/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

const asSale = () => { caller = { uid: 'sale1', role: 'sale', isSuperAdmin: false, person: { id: 'sale1', displayNameEN: 'Somchai Jaidee', nickname: 'Chai', managerId: 'boss1' } } }
const asAdmin = () => { caller = { uid: 'admin1', role: 'super_admin', isSuperAdmin: true, person: { id: 'admin1', displayNameEN: 'Admin One' } } }
const asLead = () => { caller = { uid: 'lead1', role: 'team_lead', isSuperAdmin: false, person: { id: 'lead1', displayNameEN: 'Malee Sriwong' } } }

const evil = { title: 'URGENT: your account is locked', body: 'Sign in at http://evil.example', refPath: '/profile' }

beforeEach(() => {
  written.length = 0
  docs = {
    shadowRecords: [
      { id: 'v1', observerUid: 'sale1', storeName: 'ร้านข้าวมันไก่', segment: 'Chain' },
      { id: 'v2', observerUid: 'someone-else', storeName: 'Other' },
    ],
    shadowAcknowledgments: [{ id: 'v2__lead1', recordId: 'v2', reviewerUid: 'lead1', rating: 4 }],
  }
})

describe('creating a notification', () => {
  it('refuses a learner writing a course notice into someone\'s feed with their own text', async () => {
    asSale()
    const res = await call({ targetUid: 'victim', type: 'new_course', refId: 'x', ...evil })
    expect(res.status).toBe(403)
    expect(written).toEqual([])
  })

  it('lets a super_admin publish a course or Mandatory notice, with their own text', async () => {
    asAdmin()
    const res = await call({ targetUid: 'u1', type: 'new_course', refId: 'c1', title: 'หลักสูตรใหม่: PVP', body: 'ดูรายละเอียด', refPath: '/courses/c1' })
    expect(res.status).toBe(200)
    expect(written).toHaveLength(1)
    expect(written[0].path).toBe('notifications/u1/items')
    expect(written[0].data.title).toBe('หลักสูตรใหม่: PVP')
  })

  it('still refuses a link that leaves the app, even from a super_admin', async () => {
    asAdmin()
    expect((await call({ targetUid: 'u1', type: 'new_course', refId: 'c1', title: 't', body: 'b', refPath: 'https://evil.example' })).status).toBe(400)
    expect((await call({ targetUid: 'u1', type: 'new_course', refId: 'c1', title: 't', body: 'b', refPath: '//evil.example' })).status).toBe(400)
  })

  it('refuses a type that is not one of the four, including the unused heart', async () => {
    asAdmin()
    expect((await call({ targetUid: 'u1', type: 'heart_received', refId: 'x', ...evil })).status).toBe(400)
    expect((await call({ targetUid: 'u1', type: 'assessment_completed', refId: 'x', ...evil })).status).toBe(400)
  })
})

describe('shadow_pending_ack: the visit\'s author telling their own manager', () => {
  it('composes the wording from the stored visit and ignores the request\'s text', async () => {
    asSale()
    const res = await call({ targetUid: 'boss1', type: 'shadow_pending_ack', refId: 'v1', ...evil })
    expect(res.status).toBe(200)
    expect(written[0].data.title).toContain('Somchai')
    expect(written[0].data.title).not.toContain('URGENT')
    expect(String(written[0].data.body)).toContain('ร้านข้าวมันไก่')
    expect(written[0].data.refPath).toBe('/shadow')
  })

  it('refuses sending it to anyone who is not their manager', async () => {
    asSale()
    expect((await call({ targetUid: 'victim', type: 'shadow_pending_ack', refId: 'v1', ...evil })).status).toBe(403)
    expect(written).toEqual([])
  })

  it('refuses for a visit that is not theirs', async () => {
    asSale()
    expect((await call({ targetUid: 'boss1', type: 'shadow_pending_ack', refId: 'v2', ...evil })).status).toBe(403)
  })
})

describe('shadow_ack_received: a reviewer telling the person whose visit it was', () => {
  it('composes the wording from the stored review, one notice per reviewer', async () => {
    asLead()
    const res = await call({ targetUid: 'someone-else', type: 'shadow_ack_received', refId: 'v2', ...evil })
    expect(res.status).toBe(200)
    expect(written[0].id).toBe('shadow_ack_received_v2_lead1')
    expect(written[0].data.title).toContain('Malee')
    expect(String(written[0].data.body)).toContain('4/5')
    expect(written[0].data.title).not.toContain('URGENT')
  })

  it('refuses when the caller gave no review of that visit', async () => {
    asSale()
    expect((await call({ targetUid: 'someone-else', type: 'shadow_ack_received', refId: 'v2', ...evil })).status).toBe(403)
    expect(written).toEqual([])
  })

  it('refuses sending it to someone other than the person whose visit it was', async () => {
    asLead()
    expect((await call({ targetUid: 'victim', type: 'shadow_ack_received', refId: 'v2', ...evil })).status).toBe(403)
  })
})
