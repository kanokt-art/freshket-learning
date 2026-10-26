import { describe, it, expect, vi, beforeEach } from 'vitest'

// The write seam — every mutation in the app goes through this module.
//
// WHAT THESE TESTS ARE FOR. The seam's job is to turn a plain record into the
// right request to /api/data, and almost every bug it can have is a wrong
// ARGUMENT rather than a thrown error: a merge where the caller needed a
// replace, an `undefined` that is sent as if it were data, a `null` dropped so a
// field can never be cleared, a request over the server's size cap. None of that
// fails at the call site — it shows up later as data that is quietly wrong. So
// these tests stand in for the server and assert on the requests the seam makes.

interface Sent { route: string; body: { ops?: any[]; path?: string; id?: string; constraints?: any[] } }
let sent: Sent[] = []
/** What the stand-in server answers to each route; tests override per case. */
let answer: (s: Sent) => { status?: number; json: unknown }

vi.mock('@/lib/api/authedFetch', () => ({
  authedFetch: async (url: string, init: RequestInit) => {
    const s: Sent = { route: url.replace('/api/data/', ''), body: JSON.parse(String(init.body)) }
    sent.push(s)
    const { status = 200, json } = answer(s)
    return new Response(JSON.stringify(json), { status })
  },
}))
vi.mock('@/lib/demo/demoMode', () => ({ getDemoMode: () => false }))

import { save, patch, remove, saveMany, removeMany, get, findBy } from '@/lib/data/collection'
import { onInvalidate } from '@/lib/data/invalidation'

/** Default server: every write succeeds and reports the ids it was given. */
const writesOk = (s: Sent) => ({
  json: {
    results: (s.body.ops ?? []).flatMap((o) =>
      o.docs ? o.docs.map((d: any) => ({ id: d.id }))
        : o.ids ? o.ids.map((id: string) => ({ id }))
        : [{ id: o.id === '' ? 'minted-1' : o.id }]),
  },
})

beforeEach(() => {
  sent = []
  answer = writesOk
})

/** The single op of the single write request the test made. */
function onlyOp() {
  expect(sent).toHaveLength(1)
  expect(sent[0].route).toBe('write')
  expect(sent[0].body.ops).toHaveLength(1)
  return sent[0].body.ops![0]
}

describe('save', () => {
  it('writes to the given collection and id', async () => {
    await save('courses', { id: 'c1', title: 'A' })
    const op = onlyOp()
    expect([op.op, op.path, op.id]).toEqual(['set', 'courses', 'c1'])
  })

  it('never writes `id` into the document body', async () => {
    // The id is the key. Storing it twice is how the two copies drift apart.
    await save('courses', { id: 'c1', title: 'A' })
    expect(onlyOp().data).toEqual({ title: 'A' })
  })

  it('asks the server to mint an id when the record has none, and returns what it chose', async () => {
    // Callers rely on the returned id — the mandatory-reading publish flow
    // notifies against it straight after saving.
    const res = await save('shadowRecords', { id: '', note: 'x' })
    expect(onlyOp().id).toBe('')
    expect(res).toEqual({ id: 'minted-1', persisted: true })
  })

  it('merges by default, so a partial record patches rather than truncates', async () => {
    await save('courses', { id: 'c1', title: 'A' })
    expect(onlyOp().merge).toBe(true)
  })

  it('replaces the whole document when asked', async () => {
    // Teams, mandatory slides and cuisine guides need a removed field to
    // actually disappear; a merge would leave it behind.
    await save('teams', { id: 't1', memberIds: ['a'] }, { replace: true })
    expect(onlyOp().merge).toBe(false)
  })

  it('propagates a refused write instead of swallowing it', async () => {
    // The bug this module exists to stop is a modal that closes on a failed
    // save, so the promise must reject and let the caller keep the form open.
    answer = () => ({ status: 403, json: { error: 'Forbidden' } })
    await expect(save('courses', { id: 'c1' })).rejects.toMatchObject({ status: 403, message: 'Forbidden' })
  })
})

describe('undefined vs null', () => {
  it('leaves out undefined fields', async () => {
    await save('users', { id: 'u1', name: 'A', nickname: undefined })
    expect(Object.keys(onlyOp().data)).toEqual(['name'])
  })

  it('KEEPS null — it is the only way to blank a stored value', async () => {
    // Not interchangeable with undefined: dropping null here would make
    // "clear this field" silently impossible, which is how a cleared teamId
    // used to come back after a refresh.
    await save('users', { id: 'u1', teamId: null })
    expect(onlyOp().data).toEqual({ teamId: null })
  })

  it('keeps other falsy values', async () => {
    // 0, '' and false are data, not absence.
    await save('courses', { id: 'c1', durationMinutes: 0, description: '', isPublished: false })
    expect(onlyOp().data).toEqual({ durationMinutes: 0, description: '', isPublished: false })
  })

  it('sends a Date as a time the server can read back', async () => {
    const at = new Date('2026-03-01T10:00:00.000Z')
    await save('courses', { id: 'c1', startDate: at })
    // Over the wire it is the ISO string; the server's field map reads that.
    expect(onlyOp().data).toEqual({ startDate: '2026-03-01T10:00:00.000Z' })
  })
})

describe('patch', () => {
  it('upserts through a merge by default', async () => {
    await patch('appConfig', 'moduleAccess', { lms: true })
    const op = onlyOp()
    expect([op.op, op.path, op.id, op.data, op.merge]).toEqual(['set', 'appConfig', 'moduleAccess', { lms: true }, true])
  })

  it('uses an update that fails on a missing doc when mustExist is set', async () => {
    // A plain upsert here created empty ghost users when a uid had been merged
    // away by dedup. This must reject instead, so the UI can say so.
    await patch('users', 'stale-uid', { teamId: 't1' }, { mustExist: true })
    const op = onlyOp()
    expect([op.op, op.path, op.id, op.data]).toEqual(['update', 'users', 'stale-uid', { teamId: 't1' }])
  })

  it('rejects when the server says the document is not there', async () => {
    answer = () => ({ status: 404, json: { error: 'Not found' } })
    await expect(patch('users', 'stale-uid', { teamId: 't1' }, { mustExist: true }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('strips undefined on the mustExist path too', async () => {
    await patch('users', 'u1', { teamId: undefined, role: 'sale' }, { mustExist: true })
    expect(onlyOp().data).toEqual({ role: 'sale' })
  })
})

describe('remove', () => {
  it('deletes the named document', async () => {
    const res = await remove('teams', 't1')
    const op = onlyOp()
    expect([op.op, op.path, op.id]).toEqual(['delete', 'teams', 't1'])
    expect(res).toEqual({ id: 't1', persisted: true })
  })
})

describe('saveMany', () => {
  it('writes every record in one request when it fits', async () => {
    await saveMany('tools', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const op = onlyOp()
    expect(op.op).toBe('setMany')
    expect(op.docs.map((d: any) => d.id)).toEqual(['a', 'b', 'c'])
  })

  it('chunks under the server cap of 2,000 documents per request', async () => {
    // 2,001 records → 1000 + 1000 + 1. Each request is judged whole, so a chunk
    // over the cap would be refused outright rather than half-written.
    const records = Array.from({ length: 2001 }, (_, i) => ({ id: `r${i}` }))
    await saveMany('assessmentScores', records)
    expect(sent.map((s) => s.body.ops![0].docs.length)).toEqual([1000, 1000, 1])
  })

  it('opens no request at all for an empty list', async () => {
    expect(await saveMany('tools', [])).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('overwrites by default', async () => {
    // Re-importing a score file must replace the row, not merge into it.
    await saveMany('assessmentScores', [{ id: 'a', pct: 80 }])
    expect(onlyOp().merge).toBe(false)
  })

  it('merges when asked, for the user upsert', async () => {
    // The CSV import patches existing employees rather than replacing them.
    await saveMany('users', [{ id: 'u1', department: 'Sales' }], { merge: true })
    expect(onlyOp().merge).toBe(true)
  })

  it('keeps id out of the body and strips undefined, same as save', async () => {
    await saveMany('users', [{ id: 'u1', name: 'A', nickname: undefined }])
    expect(onlyOp().docs).toEqual([{ id: 'u1', data: { name: 'A' } }])
  })

  it('returns how many records it wrote', async () => {
    expect(await saveMany('tools', [{ id: 'a' }, { id: 'b' }])).toBe(2)
  })

  it('stops at the first refused chunk, so the caller learns the import did not finish', async () => {
    let n = 0
    answer = (s) => (++n === 2 ? { status: 403, json: { error: 'Forbidden' } } : writesOk(s))
    const records = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}` }))
    await expect(saveMany('users', records)).rejects.toMatchObject({ status: 403 })
    expect(sent).toHaveLength(2)
  })
})

describe('removeMany', () => {
  it('chunks deletes the same way saveMany chunks writes', async () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `t${i}`)
    expect(await removeMany('teams', ids)).toBe(2001)
    expect(sent.map((s) => s.body.ops![0].ids.length)).toEqual([1000, 1000, 1])
  })

  it('opens no request for an empty list', async () => {
    expect(await removeMany('teams', [])).toBe(0)
    expect(sent).toHaveLength(0)
  })
})

describe('get', () => {
  it('returns null when the document does not exist', async () => {
    // progress.ts branches on exactly this to decide whether a startedAt stamp
    // is being set for the first time.
    answer = () => ({ json: { doc: null, dateFields: [] } })
    expect(await get('trainingRecords', 'nope')).toBeNull()
  })

  it('asks for that collection and id, and returns the document', async () => {
    answer = () => ({ json: { doc: { id: 'u1_c1', status: 'completed' }, dateFields: [] } })
    expect(await get('trainingRecords', 'u1_c1')).toEqual({ id: 'u1_c1', status: 'completed' })
    expect(sent[0]).toMatchObject({ route: 'get', body: { path: 'trainingRecords', id: 'u1_c1' } })
  })

  it('hands dates back as Dates', async () => {
    answer = () => ({
      json: { doc: { id: 'a', startedAt: '2026-03-01T10:00:00Z', note: '2026-03-01' }, dateFields: ['startedAt'] },
    })
    const doc = await get<{ startedAt: Date; note: string }>('trainingRecords', 'a')
    expect(doc!.startedAt).toEqual(new Date('2026-03-01T10:00:00Z'))
    // Only the fields the server named; a string that merely looks like a date stays a string.
    expect(doc!.note).toBe('2026-03-01')
  })
})

describe('findBy', () => {
  it('queries by equality and returns every matching document', async () => {
    answer = () => ({ json: { docs: [{ id: 'r1', userId: 'u1' }, { id: 'r2', userId: 'u1' }], dateFields: [] } })
    expect(await findBy('trainingRecords', 'userId', 'u1')).toEqual([
      { id: 'r1', userId: 'u1' },
      { id: 'r2', userId: 'u1' },
    ])
    expect(sent[0]).toMatchObject({
      route: 'query',
      body: { path: 'trainingRecords', constraints: [{ type: 'where', field: 'userId', op: '==', value: 'u1' }] },
    })
  })
})

describe('telling the screens', () => {
  it('announces the collection a write changed', async () => {
    const heard: Array<string | null> = []
    const stop = onInvalidate((p) => heard.push(p))
    await save('courses', { id: 'c1' })
    await removeMany('teams', ['t1'])
    stop()
    expect(heard).toEqual(['courses', 'teams'])
  })

  it('announces even a write that failed, because an earlier part of it may have gone through', async () => {
    const heard: Array<string | null> = []
    const stop = onInvalidate((p) => heard.push(p))
    answer = () => ({ status: 503, json: { error: 'Service unavailable' } })
    await expect(save('courses', { id: 'c1' })).rejects.toThrow()
    stop()
    expect(heard).toEqual(['courses'])
  })
})

// ── Demo mode ───────────────────────────────────────────────────────────────
// A separate module registry so the flag can be true at import time, which is
// when the seam reads it.
describe('demo mode', () => {
  it('persists nothing and reports it', async () => {
    vi.resetModules()
    vi.doMock('@/lib/demo/demoMode', () => ({ getDemoMode: () => true }))
    const demo = await import('@/lib/data/collection')

    const saved = await demo.save('courses', { id: 'c1', title: 'A' })
    expect(saved).toEqual({ id: 'c1', persisted: false })
    expect(await demo.saveMany('tools', [{ id: 'a' }])).toBe(0)
    expect(await demo.get('courses', 'c1')).toBeNull()
    expect(await demo.findBy('courses', 'x', 1)).toEqual([])

    // Nothing reached the server.
    expect(sent).toHaveLength(0)

    vi.doUnmock('@/lib/demo/demoMode')
    vi.resetModules()
  })
})
