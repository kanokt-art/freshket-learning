import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// The Apps Script posts one course's rows from the HR sheet. What matters here is the
// route's own decisions: who may call it, which rows it refuses, how a person's before
// and after land on one record, and that sending the same rows twice changes nothing.

type Rec = Record<string, unknown> & { id: string }
let users: Rec[] = []
let records: Rec[] = []
let courses: Rec[] = []
let statsFor: string[] = []

const fakeStore = {
  get: async (path: string, id: string) => (path === 'courses' ? courses.find((c) => c.id === id) ?? null : null),
  query: async (path: string) => (path === 'users' ? users : []),
  getMany: async (_p: string, ids: string[]) => records.filter((r) => ids.includes(r.id)),
  setMany: async (_p: string, docs: Array<{ id: string; data: Record<string, unknown> }>) => {
    for (const d of docs) {
      const i = records.findIndex((r) => r.id === d.id)
      // Like a real merge: only the fields given change; null clears.
      if (i >= 0) records[i] = { ...records[i], ...d.data, id: d.id }
      else records.push({ ...d.data, id: d.id })
    }
  },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))
vi.mock('@/lib/server/userStats', () => ({ refreshManyUserStats: async (_s: unknown, ids: string[]) => { statsFor = ids } }))

import { POST } from '@/app/api/sheets/course-scores-sync/route'

const SECRET = 'test-secret'
const call = (body: unknown, secret: string | null = SECRET) =>
  POST(new NextRequest('http://localhost/api/sheets/course-scores-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-sync-secret': secret }) },
    body: JSON.stringify(body),
  }))

const rows = [
  { email: 'Rin@Freshket.co', type: 'ก่อนเรียน (Pre Test)', score: '9 / 10', timestamp: '2026-02-16T00:37:57.000Z' },
  { email: 'sirin@freshket.co', type: 'ก่อนเรียน (Pre Test)', score: '8 / 10', timestamp: '2026-02-16T00:38:08.000Z' },
  { email: 'rin@freshket.co', type: 'หลังเรียน (Post Test)', score: '10 / 10', timestamp: '2026-02-16T01:38:41.000Z' },
]

beforeEach(() => {
  process.env.SHEETS_SYNC_SECRET = SECRET
  users = [
    { id: 'csv-1', email: 'rin@freshket.co' },
    { id: 'csv-2', email: 'Sirin@freshket.co' },
  ]
  records = []
  courses = [{ id: 'c1', title: 'Restaurant 101' }]
  statsFor = []
})

describe('who may call it', () => {
  it('refuses a missing or wrong secret and writes nothing', async () => {
    expect((await call({ courseId: 'c1', rows }, null)).status).toBe(401)
    expect((await call({ courseId: 'c1', rows }, 'nope')).status).toBe(401)
    expect(records).toEqual([])
  })

  it('refuses everyone when the server has no secret configured', async () => {
    delete process.env.SHEETS_SYNC_SECRET
    expect((await call({ courseId: 'c1', rows }, '')).status).toBe(500)
  })
})

describe('bad requests', () => {
  it('rejects a course id that is not an id, or that does not exist', async () => {
    expect((await call({ courseId: '../x', rows })).status).toBe(400)
    expect((await call({ courseId: 'ghost', rows })).status).toBe(404)
  })

  it('rejects rows that are not a list', async () => {
    expect((await call({ courseId: 'c1', rows: 'x' })).status).toBe(400)
  })
})

describe('writing a course', () => {
  it('puts each person’s before and after on one record under the person id', async () => {
    const res = await (await call({ courseId: 'c1', rows })).json()
    expect(res).toMatchObject({ ok: true, people: 2, written: 2, created: 2, unmatched: [] })
    const rin = records.find((r) => r.id === 'csv-1_c1')!
    expect(rin).toMatchObject({ userId: 'csv-1', courseId: 'c1', courseTitle: 'Restaurant 101', preTestScore: 90, postTestScore: 100, score: 100, status: 'completed', source: 'google_form' })
    const sirin = records.find((r) => r.id === 'csv-2_c1')!
    expect(sirin).toMatchObject({ preTestScore: 80, status: 'in_progress' })
    expect(sirin).not.toHaveProperty('score')   // a before-test is not the course result
  })

  it('matches emails regardless of case', async () => {
    await call({ courseId: 'c1', rows })
    expect(records.map((r) => r.id).sort()).toEqual(['csv-1_c1', 'csv-2_c1'])
  })

  it('refreshes the learners’ summaries', async () => {
    await call({ courseId: 'c1', rows })
    expect(statsFor.sort()).toEqual(['csv-1', 'csv-2'])
  })

  it('sending the same rows again changes nothing', async () => {
    await call({ courseId: 'c1', rows })
    const first = JSON.stringify(records.map(({ updatedAt, ...r }) => r))
    const again = await (await call({ courseId: 'c1', rows })).json()
    expect(JSON.stringify(records.map(({ updatedAt, ...r }) => r))).toBe(first)
    expect(again.created).toBe(0)
  })

  it('a corrected score in the sheet replaces the stored one', async () => {
    await call({ courseId: 'c1', rows })
    await call({ courseId: 'c1', rows: rows.map((r) => (r.type.includes('Post') ? { ...r, score: '7 / 10' } : r)) })
    expect(records.find((r) => r.id === 'csv-1_c1')).toMatchObject({ postTestScore: 70, score: 70, preTestScore: 90 })
  })

  it('keeps the later sitting when someone retook it, whatever order the sheet lists them', async () => {
    const retake = [
      { email: 'rin@freshket.co', type: 'post', score: '9 / 10', timestamp: '2026-03-02T00:00:00.000Z' },
      { email: 'rin@freshket.co', type: 'post', score: '5 / 10', timestamp: '2026-03-01T00:00:00.000Z' },
    ]
    await call({ courseId: 'c1', rows: retake })
    expect(records[0]).toMatchObject({ postTestScore: 90 })
  })

  it('leaves a stored after-score alone when the sheet only has a before row', async () => {
    records = [{ id: 'csv-1_c1', userId: 'csv-1', courseId: 'c1', postTestScore: 100, score: 100, status: 'completed' }]
    await call({ courseId: 'c1', rows: [rows[0]] })
    expect(records[0]).toMatchObject({ preTestScore: 90, postTestScore: 100, score: 100, status: 'completed' })
  })

  it('does not touch lesson progress already on the record', async () => {
    records = [{ id: 'csv-1_c1', userId: 'csv-1', courseId: 'c1', completedLessonIds: ['l1', 'l2'], status: 'in_progress' }]
    await call({ courseId: 'c1', rows })
    expect(records[0].completedLessonIds).toEqual(['l1', 'l2'])
  })
})

describe('rows it cannot use', () => {
  it('reports an email nobody has, and still imports the rest', async () => {
    const res = await (await call({ courseId: 'c1', rows: [...rows, { email: 'stranger@x.co', type: 'post', score: '5 / 10', timestamp: '2026-02-16T02:00:00.000Z' }] })).json()
    expect(res.unmatched).toEqual(['stranger@x.co'])
    expect(res.written).toBe(2)
  })

  it('refuses a blank email, an unknown type, and a score a spreadsheet turned into a date — and says which row', async () => {
    const res = await (await call({ courseId: 'c1', rows: [
      { email: '', type: 'pre', score: '5 / 10' },
      { email: 'rin@freshket.co', type: 'midterm', score: '5 / 10' },
      { email: 'rin@freshket.co', type: 'pre', score: '10-Jun-26' },
      { email: 'rin@freshket.co', type: 'pre', score: '4 / 10' },
    ] })).json()
    expect(res.errorCount).toBe(3)
    expect(res.errors.map((e: { row: number }) => e.row)).toEqual([2, 3, 4])
    expect(records[0]).toMatchObject({ preTestScore: 40 })
  })
})
