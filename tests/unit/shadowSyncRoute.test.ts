import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Who may call it, what it refuses, and that sending the same sheet again changes nothing
// while leaving a manager's review on a record alone.

type Rec = Record<string, unknown> & { id: string }
let users: Rec[] = []
let shadow: Rec[] = []
const writes: string[] = []

const fakeStore = {
  query: async (path: string) => (path === 'users' ? users : []),
  getMany: async (_p: string, ids: string[]) => shadow.filter((r) => ids.includes(r.id)),
  setMany: async (path: string, docs: Array<{ id: string; data: Record<string, unknown> }>, opts: { merge?: boolean } = {}) => {
    writes.push(path)
    for (const d of docs) {
      const i = shadow.findIndex((r) => r.id === d.id)
      // Like the real store: a merge changes only the fields given, a replace is the whole document.
      if (i >= 0) shadow[i] = opts.merge ? { ...shadow[i], ...d.data, id: d.id } : { ...d.data, id: d.id }
      else shadow.push({ ...d.data, id: d.id })
    }
  },
}
vi.mock('@/lib/server/store', () => ({ getStore: () => fakeStore }))

import { POST } from '@/app/api/sheets/shadow-sync/route'

const SECRET = 's3cret'
const call = (body: unknown, secret: string | null = SECRET) =>
  POST(new NextRequest('http://localhost/api/sheets/shadow-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'x-sync-secret': secret }) },
    body: JSON.stringify(body),
  }))

const visit = (over: Record<string, unknown> = {}) => ({
  timestamp: '2026-02-16T00:37:57.000Z', observerEmail: 'rin@freshket.co', mentorFullname: 'Somchai', mentorPosition: 'Senior',
  storeName: 'Ban Pasta', segment: 'Chain', persona: 'Chef', opening: 'o', interestPoint: 'i', customerPain: 'p',
  diagnosticApproach: 'd', closingNextStep: 'c', ...over,
})

beforeEach(() => {
  process.env.SHEETS_SYNC_SECRET = SECRET
  users = [{ id: 'csv-1', email: 'Rin@freshket.co', displayName: 'Rin' }]
  shadow = []
  writes.length = 0
})

describe('who may call it', () => {
  it('refuses a missing or wrong secret and writes nothing', async () => {
    expect((await call({ rows: [visit()] }, null)).status).toBe(401)
    expect((await call({ rows: [visit()] }, 'nope')).status).toBe(401)
    expect(shadow).toEqual([])
  })

  it('refuses everyone when the server has no secret', async () => {
    delete process.env.SHEETS_SYNC_SECRET
    expect((await call({ rows: [visit()] }, '')).status).toBe(500)
  })

  it('rejects rows that are not a list', async () => {
    expect((await call({ rows: 'x' })).status).toBe(400)
  })
})

describe('importing visits', () => {
  it('writes a record under the observer’s person id', async () => {
    const res = await (await call({ rows: [visit()] })).json()
    expect(res).toMatchObject({ ok: true, written: 1, created: 1, unmatched: [] })
    expect(shadow[0]).toMatchObject({ observerUid: 'csv-1', observerName: 'Rin', storeName: 'Ban Pasta', segment: 'Chain' })
  })

  it('sending the same sheet again makes no duplicates', async () => {
    await call({ rows: [visit()] })
    const again = await (await call({ rows: [visit()] })).json()
    expect(shadow).toHaveLength(1)
    expect(again).toMatchObject({ written: 1, created: 0 })
  })

  it('a corrected cell in the sheet replaces the stored one', async () => {
    await call({ rows: [visit()] })
    await call({ rows: [visit({ storeName: 'Ban Pasta 2' })] })
    expect(shadow[0].storeName).toBe('Ban Pasta 2')
  })

  it('leaves what was added in the app alone', async () => {
    await call({ rows: [visit()] })
    shadow[0] = { ...shadow[0], evaluatorEmail: 'boss@freshket.co', ratingScore: 5, evaluationFeedback: 'great' }
    await call({ rows: [visit()] })
    expect(shadow[0]).toMatchObject({ evaluatorEmail: 'boss@freshket.co', ratingScore: 5, evaluationFeedback: 'great' })
  })

  it('keeps two visits by the same person apart, and merges the same visit listed twice', async () => {
    await call({ rows: [visit(), visit({ timestamp: '2026-02-17T00:00:00.000Z' })] })
    expect(shadow).toHaveLength(2)
    shadow.length = 0
    await call({ rows: [visit({ storeName: 'First' }), visit({ storeName: 'Second' })] })
    expect(shadow).toHaveLength(1)
    expect(shadow[0].storeName).toBe('Second')
  })

  it('reports an observer nobody has, and still imports the rest', async () => {
    const res = await (await call({ rows: [visit(), visit({ observerEmail: 'stranger@x.co' })] })).json()
    expect(res).toMatchObject({ written: 1, unmatched: ['stranger@x.co'], errorCount: 1 })
  })

  it('reports a segment or persona the app does not list, but keeps the row', async () => {
    const res = await (await call({ rows: [visit({ segment: 'Franchise' })] })).json()
    expect(res.unknownChoices).toEqual(['Segment "Franchise"'])
    expect(shadow[0].segment).toBe('Franchise')
  })

  it('refuses a row with no timestamp and says which row', async () => {
    const res = await (await call({ rows: [visit(), visit({ timestamp: '' })] })).json()
    expect(res.errors).toEqual([{ row: 3, message: expect.stringContaining('Timestamp') }])
  })

  it('only ever writes shadowRecords', async () => {
    await call({ rows: [visit()] })
    expect(new Set(writes)).toEqual(new Set(['shadowRecords']))
  })
})
