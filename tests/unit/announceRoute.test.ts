import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Who may announce what, and that the words come from the database, not from the caller.
// The caller is a signed-in employee; the point is that a learner cannot put their own text
// (or @channel) into a Slack channel, or announce somebody else's visit or review.

type Doc = Record<string, unknown> & { id: string }
let docs: Record<string, Doc[]> = {}
const claimed = new Set<string>()

const fakeStore = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  getMany: async (path: string, ids: string[]) => (docs[path] ?? []).filter((d) => ids.includes(d.id)),
  claim: async (path: string, id: string) => {
    const k = `${path}/${id}`
    if (claimed.has(k)) return false
    claimed.add(k)
    return true
  },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

let caller: { uid: string; role: string; isSuperAdmin: boolean; person: Record<string, unknown> }
vi.mock('@/lib/server/auth', () => ({
  requireStaff: async () => ({ ok: true, ...caller }),
}))

const posts = {
  course: vi.fn(async (_e: unknown) => true),
  mandatory: vi.fn(async (_e: unknown) => true),
  submitted: vi.fn(async (_e: unknown) => true),
  acked: vi.fn(async (_e: unknown) => true),
}
vi.mock('@/lib/notifications/slack', async (orig) => ({
  ...(await orig<typeof import('@/lib/notifications/slack')>()),
  postCoursePublishedToSlack: (e: unknown) => posts.course(e),
  postMandatoryPublishedToSlack: (e: unknown) => posts.mandatory(e),
  postShadowSubmittedToSlack: (e: unknown) => posts.submitted(e),
  postShadowAckedToSlack: (e: unknown) => posts.acked(e),
}))
const dm = vi.fn(async (..._a: unknown[]) => 1)
vi.mock('@/lib/notifications/slackDm', () => ({
  dmPeople: (...a: unknown[]) => dm(...a),
  dmPeopleIds: async () => [],
}))

import { POST } from '@/app/api/notifications/announce/route'

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/notifications/announce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

const asSale = () => { caller = { uid: 'sale1', role: 'sale', isSuperAdmin: false, person: { id: 'sale1', displayNameEN: 'Somchai Jaidee', nickname: 'Chai', department: 'Sales Management' } } }
const asAdmin = () => { caller = { uid: 'admin1', role: 'super_admin', isSuperAdmin: true, person: { id: 'admin1', displayNameEN: 'Admin One' } } }
const asLead = () => { caller = { uid: 'lead1', role: 'team_lead', isSuperAdmin: false, person: { id: 'lead1', displayNameEN: 'Malee Sriwong' } } }

beforeEach(() => {
  claimed.clear()
  Object.values(posts).forEach((f) => f.mockClear())
  dm.mockClear()
  docs = {
    courses: [{ id: 'c1', title: 'PVP (Private Price Process)', description: 'ขั้นตอนตั้งราคาพิเศษ', isPublished: true }, { id: 'draft', title: 'Draft', isPublished: false }],
    mandatoryItems: [{ id: 'm1', title: 'ราคาผัก', isPublished: true, weekLabel: 'Week 44', departmentAccess: [{ department: 'Sales Management' }] }],
    shadowRecords: [{ id: 'v1', observerUid: 'sale1', storeName: 'ร้านข้าวมันไก่', segment: 'Chain' }, { id: 'v2', observerUid: 'someone-else', storeName: 'Other' }],
    shadowAcknowledgments: [{ id: 'v2__lead1', recordId: 'v2', reviewerUid: 'lead1', rating: 4, comment: 'good' }],
    users: [{ id: 'someone-else', displayNameEN: 'Real Observer', nickname: 'Rob' }],
  }
})

describe('publishing announcements are for a super_admin', () => {
  it('refuses a learner who tries to announce a course with their own title', async () => {
    asSale()
    const res = await call({ kind: 'course_published', courseId: 'c1', courseTitle: '<!channel> click https://evil.example', recipientCount: 5 })
    expect(res.status).toBe(403)
    expect(posts.course).not.toHaveBeenCalled()
  })

  it('refuses a team lead too', async () => {
    asLead()
    expect((await call({ kind: 'course_published', courseId: 'c1', recipientCount: 1 })).status).toBe(403)
    expect((await call({ kind: 'mandatory_published', itemId: 'm1', recipientCount: 1 })).status).toBe(403)
    expect(posts.course).not.toHaveBeenCalled()
    expect(posts.mandatory).not.toHaveBeenCalled()
  })

  it('announces a course using the title in the database, not the one in the request', async () => {
    asAdmin()
    const res = await call({ kind: 'course_published', courseId: 'c1', courseTitle: '<!channel> attacker text', recipientCount: 5 })
    expect(res.status).toBe(200)
    expect(posts.course).toHaveBeenCalledTimes(1)
    const sent = posts.course.mock.calls[0][0] as { courseTitle: string; courseUrl?: string }
    expect(sent.courseTitle).toBe('PVP (Private Price Process)')
  })

  it('uses the course\'s own description when the admin changed nothing', async () => {
    asAdmin()
    await call({ kind: 'course_published', courseId: 'c1', recipientCount: 5 })
    const sent = posts.course.mock.calls[0][0] as { courseTitle: string; description?: string }
    expect(sent.courseTitle).toBe('PVP (Private Price Process)')
    expect(sent.description).toBe('ขั้นตอนตั้งราคาพิเศษ')
  })

  it('uses the title and description the admin reworded, trimmed and cut to length', async () => {
    asAdmin()
    await call({ kind: 'course_published', courseId: 'c1', recipientCount: 5, customTitle: '  PVP รอบใหม่  ', customDescription: 'x'.repeat(500) })
    const sent = posts.course.mock.calls[0][0] as { courseTitle: string; description?: string }
    expect(sent.courseTitle).toBe('PVP รอบใหม่')
    expect(sent.description).toHaveLength(300)
  })

  it('posts no description when the admin cleared it', async () => {
    asAdmin()
    await call({ kind: 'course_published', courseId: 'c1', recipientCount: 5, customDescription: '' })
    expect((posts.course.mock.calls[0][0] as { description?: string }).description).toBeUndefined()
  })

  it('a learner cannot send custom text either', async () => {
    asSale()
    const res = await call({ kind: 'course_published', courseId: 'c1', recipientCount: 5, customTitle: '<!channel> hi', customDescription: 'x' })
    expect(res.status).toBe(403)
    expect(posts.course).not.toHaveBeenCalled()
  })

  it('refuses a course that does not exist or is not published', async () => {
    asAdmin()
    expect((await call({ kind: 'course_published', courseId: 'nope', recipientCount: 1 })).status).toBe(400)
    expect((await call({ kind: 'course_published', courseId: 'draft', recipientCount: 1 })).status).toBe(400)
    expect((await call({ kind: 'course_published', recipientCount: 1 })).status).toBe(400)
    expect(posts.course).not.toHaveBeenCalled()
  })

  it('announces a Mandatory Reading from the stored item (title and departments), ignoring the request', async () => {
    asAdmin()
    await call({ kind: 'mandatory_published', itemId: 'm1', title: '<!here> fake', departments: ['Everyone'], recipientCount: 3 })
    const sent = posts.mandatory.mock.calls[0][0] as { title: string; departments: string[] }
    expect(sent.title).toBe('ราคาผัก')
    expect(sent.departments).toEqual(['Sales Management'])
  })
})

describe('a Shadow Visit announcement is about the caller\'s own visit, once', () => {
  it('announces the caller\'s visit with a summary written from the stored visit', async () => {
    asSale()
    await call({ kind: 'shadow_submitted', recordId: 'v1', visitSummary: '<!channel> ignore me' })
    expect(posts.submitted).toHaveBeenCalledTimes(1)
    const sent = posts.submitted.mock.calls[0][0] as { visitSummary: string; observerName: string }
    expect(sent.visitSummary).toContain('ร้านข้าวมันไก่')
    expect(sent.visitSummary).not.toContain('channel')
    expect(sent.observerName).toContain('Somchai')
  })

  it('does not announce somebody else\'s visit', async () => {
    asSale()
    await call({ kind: 'shadow_submitted', recordId: 'v2' })
    expect(posts.submitted).not.toHaveBeenCalled()
  })

  it('does not announce the same visit twice', async () => {
    asSale()
    await call({ kind: 'shadow_submitted', recordId: 'v1' })
    await call({ kind: 'shadow_submitted', recordId: 'v1' })
    expect(posts.submitted).toHaveBeenCalledTimes(1)
  })
})

describe('a review announcement is about a review the caller gave, once', () => {
  it('uses the names and stars from the database, never from the request', async () => {
    asLead()
    await call({ kind: 'shadow_acked', recordId: 'v2', reviewerName: '<!channel> Boss', observerName: 'Fake Person', rating: 1 })
    expect(posts.acked).toHaveBeenCalledTimes(1)
    const sent = posts.acked.mock.calls[0][0] as { reviewerName: string; observerName: string; rating?: number }
    expect(sent.reviewerName).toContain('Malee')
    expect(sent.observerName).toBe('Real (Rob) Observer')
    expect(sent.rating).toBe(4)
    expect(dm).toHaveBeenCalledTimes(1)
  })

  it('announces nothing when the caller gave no review of that visit', async () => {
    asSale()
    await call({ kind: 'shadow_acked', recordId: 'v2' })
    expect(posts.acked).not.toHaveBeenCalled()
    expect(dm).not.toHaveBeenCalled()
  })

  it('does not announce a review of the caller\'s own visit', async () => {
    asLead()
    docs.shadowRecords.push({ id: 'v3', observerUid: 'lead1', storeName: 'Mine' })
    docs.shadowAcknowledgments.push({ id: 'v3__lead1', recordId: 'v3', reviewerUid: 'lead1', rating: 5 })
    await call({ kind: 'shadow_acked', recordId: 'v3' })
    expect(posts.acked).not.toHaveBeenCalled()
  })

  it('announces a review only once, so an edit or a replay posts nothing more', async () => {
    asLead()
    await call({ kind: 'shadow_acked', recordId: 'v2' })
    await call({ kind: 'shadow_acked', recordId: 'v2' })
    expect(posts.acked).toHaveBeenCalledTimes(1)
    expect(dm).toHaveBeenCalledTimes(1)
  })
})
