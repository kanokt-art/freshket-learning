import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Telling a member that a team lead / manager commented on, rated, or assessed them. The caller names
// the thing; the words and numbers come from what was saved. Each is told once, to the member only.

type Doc = Record<string, unknown> & { id: string }
let docs: Record<string, Doc[]> = {}
const claimed = new Set<string>()
let bells: Array<{ path: string; id: string; data: Record<string, unknown> }> = []

const fakeStore = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  getMany: async (path: string, ids: string[]) => (docs[path] ?? []).filter((d) => ids.includes(d.id)),
  claim: async (path: string, id: string) => {
    const k = `${path}/${id}`
    if (claimed.has(k)) return false
    claimed.add(k)
    return true
  },
  set: async (path: string, id: string, data: Record<string, unknown>) => { bells.push({ path, id, data }) },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

let caller: { uid: string; role: string; isSuperAdmin: boolean; person: Record<string, unknown> }
vi.mock('@/lib/server/auth', () => ({ requireStaff: async () => ({ ok: true, ...caller }) }))

const dm = vi.fn(async (..._a: unknown[]) => 1)
vi.mock('@/lib/notifications/slackDm', () => ({
  dmPeople: (...a: unknown[]) => dm(...a),
  dmPeopleIds: async () => [],
}))

import { POST } from '@/app/api/notifications/announce/route'
import { ROLEPLAY_TOPICS } from '@/types/roleplay'

const call = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/notifications/announce', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))

const asLead = () => { caller = { uid: 'lead1', role: 'team_lead', isSuperAdmin: false, person: { id: 'lead1', displayNameEN: 'Malee Sriwong', nickname: 'Mali' } } }
const asSale = () => { caller = { uid: 'sale1', role: 'sale', isSuperAdmin: false, person: { id: 'sale1', displayNameEN: 'Somchai Jaidee' } } }
const dmText = () => JSON.stringify(dm.mock.calls[0]?.[2] ?? {})

beforeEach(() => {
  claimed.clear(); bells = []; dm.mockClear(); dm.mockResolvedValue(1)
  docs = {
    courses: [{ id: 'c1', title: 'Product Knowledge' }],
    courseFeedback: [
      { id: 'sale1_c1', memberUid: 'sale1', courseId: 'c1', leadUid: 'lead1', score: 4, comment: 'ตั้งใจเรียนดีมาก' },
      { id: 'sale2_c1', memberUid: 'sale2', courseId: 'c1', leadUid: 'someone-else', score: 5, comment: 'x' },
      { id: 'sale3_c1', memberUid: 'sale3', courseId: 'c1', leadUid: 'lead1', score: null, comment: '' },
    ],
    roleplayAssessments: [
      { id: 'rp1', assessorUid: 'lead1', subjectUid: 'sale1', type: 'post', round: 2, overallNote: 'พัฒนาขึ้นมาก',
        topics: ROLEPLAY_TOPICS.map((t) => ({ key: t.key, rating: t.group === 'Greeting' ? 9 : 7, comment: '' })) },
      { id: 'rp2', assessorUid: 'someone-else', subjectUid: 'sale1', type: 'pre', round: 1, topics: [] },
    ],
  }
})

describe('course feedback', () => {
  it('tells the member privately, with the stars and comment that were saved', async () => {
    asLead()
    const res = await call({ kind: 'course_feedback', memberUid: 'sale1', courseId: 'c1' })
    expect((await res.json()).dmSent).toBe(1)
    expect(dm.mock.calls[0][1]).toEqual(['sale1'])
    expect(dmText()).toContain('4/5 ดาว')
    expect(dmText()).toContain('ตั้งใจเรียนดีมาก')
    expect(dmText()).toContain('Product Knowledge')
    expect(bells).toHaveLength(0)
  })

  it('rings the in-app bell instead when no Slack DM reached them', async () => {
    asLead(); dm.mockResolvedValue(0)
    await call({ kind: 'course_feedback', memberUid: 'sale1', courseId: 'c1' })
    expect(bells).toHaveLength(1)
    expect(bells[0].path).toBe('notifications/sale1/items')
    expect(bells[0].data).toMatchObject({ type: 'course_feedback_received', refPath: '/courses/c1', read: false })
  })

  it('tells them once: editing the feedback later says nothing more', async () => {
    asLead()
    await call({ kind: 'course_feedback', memberUid: 'sale1', courseId: 'c1' })
    await call({ kind: 'course_feedback', memberUid: 'sale1', courseId: 'c1' })
    expect(dm).toHaveBeenCalledTimes(1)
  })

  it('says nothing for feedback the caller did not give, an empty one, a learner, or oneself', async () => {
    asLead()
    await call({ kind: 'course_feedback', memberUid: 'sale2', courseId: 'c1' })
    await call({ kind: 'course_feedback', memberUid: 'sale3', courseId: 'c1' })
    await call({ kind: 'course_feedback', memberUid: 'lead1', courseId: 'c1' })
    expect(dm).not.toHaveBeenCalled()
    asSale()
    expect((await call({ kind: 'course_feedback', memberUid: 'sale1', courseId: 'c1' })).status).toBe(403)
    expect(dm).not.toHaveBeenCalled()
  })
})

describe('role play assessment', () => {
  it('tells the member, with the average and the category averages from the saved scores', async () => {
    asLead()
    const res = await call({ kind: 'roleplay_assessed', assessmentId: 'rp1' })
    expect((await res.json()).dmSent).toBe(1)
    expect(dm.mock.calls[0][1]).toEqual(['sale1'])
    expect(dmText()).toContain('Post รอบที่ 2')
    expect(dmText()).toContain('Greeting 9.0')
    expect(dmText()).toContain('Preparation 7.0')
    expect(dmText()).toContain('พัฒนาขึ้นมาก')
  })

  it('rings the bell when no DM reached them, and tells once per assessment', async () => {
    asLead(); dm.mockResolvedValue(0)
    await call({ kind: 'roleplay_assessed', assessmentId: 'rp1' })
    await call({ kind: 'roleplay_assessed', assessmentId: 'rp1' })
    expect(bells).toHaveLength(1)
    expect(bells[0].data).toMatchObject({ type: 'roleplay_assessed', refPath: '/sale' })
  })

  it('says nothing for an assessment someone else made, a missing one, or from a learner', async () => {
    asLead()
    await call({ kind: 'roleplay_assessed', assessmentId: 'rp2' })
    await call({ kind: 'roleplay_assessed', assessmentId: 'nope' })
    expect(dm).not.toHaveBeenCalled()
    asSale()
    expect((await call({ kind: 'roleplay_assessed', assessmentId: 'rp1' })).status).toBe(403)
  })
})
