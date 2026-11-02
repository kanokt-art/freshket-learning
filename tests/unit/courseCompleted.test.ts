import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.hoisted(() => vi.fn(async (_e: unknown) => true))
vi.mock('@/lib/notifications/slack', async (orig) => ({
  ...(await orig<typeof import('@/lib/notifications/slack')>()),
  postCourseCompletedToSlack: (e: unknown) => post(e),
}))

import { announceCourseCompleted } from '@/lib/server/courseCompleted'

type Doc = Record<string, unknown>
let docs: Record<string, Doc[]>
const claimed = new Set<string>()
const store = {
  get: async (path: string, id: string) => (docs[path] ?? []).find((d) => d.id === id) ?? null,
  claim: async (path: string, id: string) => {
    const k = `${path}/${id}`
    if (claimed.has(k)) return false
    claimed.add(k)
    return true
  },
}

beforeEach(() => {
  post.mockClear()
  claimed.clear()
  docs = {
    users: [
      { id: 'u1', displayNameEN: 'Somchai Jaidee', nickname: 'Chai', department: 'Sales Management', position: 'Sales Rep' },
      { id: 'u2', displayNameEN: 'Malee Sriwong', department: 'People Experience' },
      { id: 'u3', displayNameEN: 'Gone Person', department: 'Sales Management', employmentStatus: 'Resigned' },
    ],
    courses: [{ id: 'c1', title: 'MBTI — แบบประเมินบุคลิกภาพ' }],
  }
})

describe('announceCourseCompleted', () => {
  it('tells the trainer group when a sales learner finishes a course', async () => {
    expect(await announceCourseCompleted(store, 'u1', 'c1')).toBe(true)
    const sent = post.mock.calls[0][0] as { learnerName: string; courseTitle: string; department?: string }
    expect(sent.learnerName).toContain('Somchai')
    expect(sent.courseTitle).toBe('MBTI — แบบประเมินบุคลิกภาพ')
    expect(sent.department).toBe('Sales Management')
  })

  it('tells them only once per person and course', async () => {
    await announceCourseCompleted(store, 'u1', 'c1')
    await announceCourseCompleted(store, 'u1', 'c1')
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('says nothing for someone outside the sales organisation, or who has left', async () => {
    expect(await announceCourseCompleted(store, 'u2', 'c1')).toBe(false)
    expect(await announceCourseCompleted(store, 'u3', 'c1')).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('says nothing, and does not throw, for an unknown person or course', async () => {
    expect(await announceCourseCompleted(store, 'nobody', 'c1')).toBe(false)
    expect(await announceCourseCompleted(store, 'u1', 'nope')).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('swallows a store failure', async () => {
    const broken = { get: async () => { throw new Error('down') }, claim: async () => true }
    expect(await announceCourseCompleted(broken, 'u1', 'c1')).toBe(false)
  })
})
