import { describe, it, expect } from 'vitest'
import { runQuery, runGet, runWrite, newId } from '@/lib/server/dataApi'
import { StoreError, type Store } from '@/lib/server/store'
import { resolveCollection, type Doc } from '@/lib/server/docMap'
import type { Actor } from '@/lib/server/policies'

// The one door the browser uses. These tests drive it with a store held in
// memory, so what is checked is the door itself: that a request is judged before
// anything is done, that a refused request leaves no trace, and that nothing a
// caller sends can reach past the rules.

// ── A store in memory ───────────────────────────────────────────────────────

type Writes = Array<{ op: string; path: string; id?: string; fields?: Record<string, unknown> }>

function memStore(initial: Record<string, Doc[]> = {}) {
  const data = new Map<string, Map<string, Doc>>()
  const writes: Writes = []
  let failWith: Error | null = null

  const coll = (path: string) => {
    if (!data.has(path)) data.set(path, new Map())
    return data.get(path)!
  }
  for (const [path, docs] of Object.entries(initial)) for (const d of docs) coll(path).set(d.id, d)

  const store = {
    async query(path: string, q: { where?: Array<{ field: string; op: string; value: unknown }>; orderBy?: Array<{ field: string; direction?: string }>; limit?: number } = {}) {
      if (!resolveCollection(path)) throw new StoreError('invalid-query', 'unknown collection')
      for (const w of q.where ?? []) if (w.field.startsWith('bad')) throw new StoreError('invalid-query', 'cannot filter')
      let docs = Array.from(coll(path).values())
      for (const w of q.where ?? []) {
        docs = docs.filter((d) => w.op === 'in' ? (w.value as unknown[]).includes(d[w.field]) : d[w.field] === w.value)
      }
      for (const o of [...(q.orderBy ?? [])].reverse()) {
        docs = [...docs].sort((a, b) => {
          const x = String(a[o.field] ?? ''), y = String(b[o.field] ?? '')
          return (x < y ? -1 : x > y ? 1 : 0) * (o.direction === 'desc' ? -1 : 1)
        })
      }
      return q.limit ? docs.slice(0, q.limit) : docs
    },
    async get(path: string, id: string) { return coll(path).get(id) ?? null },
    async getMany(path: string, ids: string[]) { return ids.map((i) => coll(path).get(i)).filter((d): d is Doc => !!d) },
    async set(path: string, id: string, fields: Record<string, unknown>, opts: { merge?: boolean } = {}) {
      if (failWith) throw failWith
      writes.push({ op: 'set', path, id, fields })
      const cur = coll(path).get(id)
      coll(path).set(id, (opts.merge ?? true) && cur ? { ...cur, ...fields, id } : { ...fields, id })
    },
    async update(path: string, id: string, fields: Record<string, unknown>) {
      if (failWith) throw failWith
      writes.push({ op: 'update', path, id, fields })
      const cur = coll(path).get(id)
      if (!cur) throw new StoreError('not-found', 'missing')
      coll(path).set(id, { ...cur, ...fields, id })
    },
    async remove(path: string, id: string) { if (failWith) throw failWith; writes.push({ op: 'remove', path, id }); coll(path).delete(id) },
    async setMany(path: string, docs: Array<{ id: string; data: Record<string, unknown> }>, opts: { merge?: boolean } = {}) {
      if (failWith) throw failWith
      for (const d of docs) {
        writes.push({ op: 'setMany', path, id: d.id, fields: d.data })
        const cur = coll(path).get(d.id)
        coll(path).set(d.id, opts.merge && cur ? { ...cur, ...d.data, id: d.id } : { ...d.data, id: d.id })
      }
    },
    async removeMany(path: string, ids: string[]) { if (failWith) throw failWith; for (const id of ids) { writes.push({ op: 'removeMany', path, id }); coll(path).delete(id) } },
  } as unknown as Store

  return {
    store, writes,
    docs: (path: string) => Array.from(coll(path).values()),
    failNextWrites: (e: Error) => { failWith = e },
  }
}

const sale = (uid = 'me'): Actor => ({ uid, role: 'sale' })
const lead: Actor = { uid: 'lead', role: 'team_lead' }
const mgr: Actor = { uid: 'mgr', role: 'manager' }
const admin: Actor = { uid: 'admin', role: 'super_admin' }

const doc = (id: string, fields: Record<string, unknown> = {}): Doc => ({ id, ...fields })

// ── Reading ─────────────────────────────────────────────────────────────────

describe('runQuery', () => {
  it('returns documents together with which fields are dates', async () => {
    const m = memStore({ courses: [doc('c1', { title: 'T', createdAt: '2026-01-01T00:00:00.000Z' })] })
    const r = await runQuery(m.store, sale(), { path: 'courses' })
    expect(r.ok && r.value.docs).toEqual([doc('c1', { title: 'T', createdAt: '2026-01-01T00:00:00.000Z' })])
    expect(r.ok && r.value.dateFields).toEqual(expect.arrayContaining(['createdAt', 'updatedAt', 'startDate']))
  })

  it('applies where, orderBy and limit', async () => {
    const m = memStore({ trainingRecords: [
      doc('a', { userId: 'u1', updatedAt: '2026-01-01' }), doc('b', { userId: 'u1', updatedAt: '2026-03-01' }),
      doc('c', { userId: 'u2', updatedAt: '2026-02-01' }),
    ] })
    const r = await runQuery(m.store, sale(), { path: 'trainingRecords', constraints: [
      { type: 'where', field: 'userId', op: '==', value: 'u1' },
      { type: 'orderBy', field: 'updatedAt', direction: 'desc' },
      { type: 'limit', count: 1 },
    ] })
    expect(r.ok && r.value.docs.map((d) => d.id)).toEqual(['b'])
  })

  describe('who may read what', () => {
    it('refuses an answer-key collection to everyone but super_admin', async () => {
      const m = memStore({ assessments: [doc('a1', { title: 'Quiz' })] })
      for (const a of [sale(), lead, mgr]) {
        const r = await runQuery(m.store, a, { path: 'assessments' })
        expect(r.ok, a.role).toBe(false)
        expect(!r.ok && r.status).toBe(403)
      }
      expect((await runQuery(m.store, admin, { path: 'assessments' })).ok).toBe(true)
    })

    it('refuses the server-held collections to everyone', async () => {
      const m = memStore()
      for (const path of ['assessmentAttempts', 'assessmentSessions', 'slackPosts']) {
        const r = await runQuery(m.store, admin, { path })
        expect(!r.ok && r.status, path).toBe(403)
      }
    })

    it('refuses to read somebody else\'s notification feed', async () => {
      const m = memStore({ 'notifications/them/items': [doc('n1', { title: 'private' })] })
      const r = await runQuery(m.store, sale('me'), { path: 'notifications/them/items' })
      expect(!r.ok && r.status).toBe(403)
    })

    it('lets a person read their own feed', async () => {
      const m = memStore({ 'notifications/me/items': [doc('n1', { title: 'mine' })] })
      const r = await runQuery(m.store, sale('me'), { path: 'notifications/me/items' })
      expect(r.ok && r.value.docs).toHaveLength(1)
    })
  })

  describe('refuses a malformed request', () => {
    it.each([
      ['no path', {}],
      ['a path that is not a string', { path: 42 }],
      ['an unknown collection', { path: 'nope' }],
      ['a notification feed with no owner', { path: 'notifications' }],
      ['a sub-path that is not a feed', { path: 'users/someone' }],
      ['constraints that are not a list', { path: 'courses', constraints: 'x' }],
      ['too many constraints', { path: 'courses', constraints: Array(11).fill({ type: 'limit', count: 1 }) }],
      ['an unknown constraint type', { path: 'courses', constraints: [{ type: 'join' }] }],
      ['an operator that is not allowed', { path: 'courses', constraints: [{ type: 'where', field: 'title', op: '>', value: 'a' }] }],
      ['a limit that is not a positive integer', { path: 'courses', constraints: [{ type: 'limit', count: 0 }] }],
      ['an absurd limit', { path: 'courses', constraints: [{ type: 'limit', count: 1e9 }] }],
      ['a constraint that is not an object', { path: 'courses', constraints: [null] }],
    ])('%s', async (_name, body) => {
      const r = await runQuery(memStore().store, admin, body)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.status).toBe(400)
    })

    it('a field the table does not store, as reported by the store', async () => {
      const r = await runQuery(memStore().store, admin, { path: 'courses', constraints: [{ type: 'where', field: 'badfield', op: '==', value: 1 }] })
      expect(!r.ok && r.status).toBe(400)
    })
  })

  it('does not echo the caller\'s input back in an error', async () => {
    const r = await runQuery(memStore().store, admin, { path: '<script>alert(1)</script>' })
    expect(!r.ok && JSON.stringify(r)).not.toContain('script')
  })
})

describe('runGet', () => {
  it('returns the document, or null', async () => {
    const m = memStore({ courses: [doc('c1', { title: 'T' })] })
    expect((await runGet(m.store, sale(), { path: 'courses', id: 'c1' }))).toMatchObject({ ok: true, value: { doc: { title: 'T' } } })
    const none = await runGet(m.store, sale(), { path: 'courses', id: 'nope' })
    expect(none.ok && none.value.doc).toBeNull()
  })

  it('applies the same read rules', async () => {
    const m = memStore({ assessments: [doc('a1')] })
    const r = await runGet(m.store, sale(), { path: 'assessments', id: 'a1' })
    expect(!r.ok && r.status).toBe(403)
  })

  it.each([[{ path: 'courses' }], [{ path: 'courses', id: '' }], [{ path: 'courses', id: 'a/b' }], [{ id: 'x' }]])(
    'refuses a malformed request %j', async (body) => {
      const r = await runGet(memStore().store, admin, body)
      expect(!r.ok && r.status).toBe(400)
    })
})

// ── Writing ─────────────────────────────────────────────────────────────────

describe('runWrite', () => {
  describe('a single document', () => {
    it('creates one', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'T' } }] })
      expect(r.ok && r.value.results).toEqual([{ id: 'c1' }])
      expect(m.docs('courses')[0]).toMatchObject({ id: 'c1', title: 'T' })
    })

    it('mints an id when it is left empty, and returns it', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: '', data: { title: 'T' } }] })
      expect(r.ok && r.value.results[0].id).toMatch(/^[A-Za-z0-9]{20}$/)
      expect(m.docs('courses')[0].id).toBe(r.ok && r.value.results[0].id)
    })

    it('merges by default and replaces when told to', async () => {
      const m = memStore({ courses: [doc('c1', { title: 'Old', description: 'kept?' })] })
      await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'New' } }] })
      expect(m.docs('courses')[0]).toMatchObject({ title: 'New', description: 'kept?' })
      await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'Replaced' }, merge: false }] })
      expect(m.docs('courses')[0]).toEqual({ id: 'c1', title: 'Replaced' })
    })

    it('ignores an id inside the data — the id is the key', async () => {
      const m = memStore()
      await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { id: 'HIJACK', title: 'T' } }] })
      expect(m.docs('courses').map((d) => d.id)).toEqual(['c1'])
      // And it never reaches the store as a field either — it would be kept as
      // a stray value in `extra` and could be read back as the document's id.
      expect(m.writes[0].fields).toEqual({ title: 'T' })
    })

    it('strips the id from bulk writes and updates too', async () => {
      const m = memStore({ teams: [doc('t1', { name: 'A' })] })
      await runWrite(m.store, mgr, { ops: [
        { op: 'setMany', path: 'teams', docs: [{ id: 't2', data: { id: 'HIJACK', name: 'B' } }] },
        { op: 'update', path: 'teams', id: 't1', data: { id: 'HIJACK', name: 'C' } },
      ] })
      expect(m.writes.map((w) => w.fields)).toEqual([{ name: 'B' }, { name: 'C' }])
    })

    it('update changes a document that exists', async () => {
      const m = memStore({ teams: [doc('t1', { name: 'A' })] })
      const r = await runWrite(m.store, mgr, { ops: [{ op: 'update', path: 'teams', id: 't1', data: { name: 'B' } }] })
      expect(r.ok).toBe(true)
      expect(m.docs('teams')[0].name).toBe('B')
    })

    it('update of a document that is not there is a 404 and writes nothing', async () => {
      const m = memStore()
      const r = await runWrite(m.store, mgr, { ops: [{ op: 'update', path: 'teams', id: 'ghost', data: { name: 'B' } }] })
      expect(!r.ok && r.status).toBe(404)
      expect(m.writes).toEqual([])
    })

    it('deletes', async () => {
      const m = memStore({ courses: [doc('c1')] })
      await runWrite(m.store, admin, { ops: [{ op: 'delete', path: 'courses', id: 'c1' }] })
      expect(m.docs('courses')).toEqual([])
    })
  })

  describe('many documents', () => {
    it('setMany replaces unless told to merge', async () => {
      const m = memStore({ tools: [doc('t1', { title: 'Old', description: 'was here' })] })
      await runWrite(m.store, admin, { ops: [{ op: 'setMany', path: 'tools', docs: [{ id: 't1', data: { title: 'New' } }] }] })
      expect(m.docs('tools')[0]).toEqual({ id: 't1', title: 'New' })
    })

    it('setMany merges when asked', async () => {
      const m = memStore({ tools: [doc('t1', { title: 'Old', description: 'kept' })] })
      await runWrite(m.store, admin, { ops: [{ op: 'setMany', path: 'tools', merge: true, docs: [{ id: 't1', data: { title: 'New' } }] }] })
      expect(m.docs('tools')[0]).toMatchObject({ title: 'New', description: 'kept' })
    })

    it('deleteMany', async () => {
      const m = memStore({ teams: [doc('a'), doc('b'), doc('c')] })
      await runWrite(m.store, mgr, { ops: [{ op: 'deleteMany', path: 'teams', ids: ['a', 'b'] }] })
      expect(m.docs('teams').map((d) => d.id)).toEqual(['c'])
    })

    it('reports an id for every document, in order', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [
        { op: 'set', path: 'courses', id: 'c1', data: { title: 'A' } },
        { op: 'setMany', path: 'tools', docs: [{ id: 't1', data: { title: 'x' } }, { id: 't2', data: { title: 'y' } }] },
      ] })
      expect(r.ok && r.value.results.map((x) => x.id)).toEqual(['c1', 't1', 't2'])
    })
  })

  describe('the rules apply', () => {
    it('a learner cannot award themselves a score', async () => {
      const m = memStore()
      const r = await runWrite(m.store, sale('me'), { ops: [{
        op: 'set', path: 'trainingRecords', id: 'me_c1', data: { userId: 'me', courseId: 'c1', status: 'completed', score: 100 },
      }] })
      expect(!r.ok && r.status).toBe(403)
      expect(m.writes).toEqual([])
    })

    it('a learner can report their own progress', async () => {
      const m = memStore()
      const r = await runWrite(m.store, sale('me'), { ops: [{
        op: 'set', path: 'trainingRecords', id: 'me_c1', data: { userId: 'me', courseId: 'c1', status: 'in_progress' },
      }] })
      expect(r.ok).toBe(true)
    })

    it('a manager cannot grant themselves super_admin', async () => {
      const m = memStore({ users: [doc('mgr', { uid: 'mgr', role: 'manager' })] })
      const r = await runWrite(m.store, mgr, { ops: [{ op: 'update', path: 'users', id: 'mgr', data: { role: 'super_admin' } }] })
      expect(!r.ok && r.status).toBe(403)
      expect(m.docs('users')[0].role).toBe('manager')
    })

    it('nobody creates a notification through here, not even into their own feed', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'notifications/admin/items', id: 'n', data: { type: 'x' } }] })
      expect(!r.ok && r.status).toBe(403)
    })

    it('a learner can mark their own notification read', async () => {
      const m = memStore({ 'notifications/me/items': [doc('n1', { read: false })] })
      const r = await runWrite(m.store, sale('me'), { ops: [{ op: 'update', path: 'notifications/me/items', id: 'n1', data: { read: true } }] })
      expect(r.ok).toBe(true)
      expect(m.docs('notifications/me/items')[0].read).toBe(true)
    })

    it('refuses a collection with no write rule at all', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'userBucketResults', id: 'x', data: { code: 'INFP' } }] })
      expect(!r.ok && r.status).toBe(403)
    })

    it('does not say which rule or which document refused', async () => {
      const r = await runWrite(memStore().store, sale(), { ops: [{ op: 'set', path: 'courses', id: 'secret-id', data: { title: 'T' } }] })
      expect(!r.ok && r.error).toBe('Forbidden')
    })
  })

  describe('judged before anything is done', () => {
    it('one refused document means NOTHING in the request is written', async () => {
      // The first operation is allowed on its own; the second is not. A request
      // must be refused whole, not left half-applied.
      const m = memStore()
      const r = await runWrite(m.store, sale('me'), { ops: [
        { op: 'set', path: 'trainingRecords', id: 'me_c1', data: { userId: 'me', courseId: 'c1', status: 'in_progress' } },
        { op: 'set', path: 'courses', id: 'c1', data: { title: 'not allowed' } },
      ] })
      expect(!r.ok && r.status).toBe(403)
      expect(m.writes).toEqual([])
      expect(m.docs('trainingRecords')).toEqual([])
    })

    it('judges a document as it WOULD be after the operations before it, not just as it is now', async () => {
      // Each operation is fine against an empty database as a create. Together
      // they are not: the second changes a protected field of the row the first
      // made. Judged against the database alone, the second would be treated as
      // another create and slip through.
      const m = memStore()
      const r = await runWrite(m.store, sale('me'), { ops: [
        { op: 'set', path: 'users', id: 'me', data: { uid: 'me', role: 'sale', email: 'a@x' } },
        { op: 'set', path: 'users', id: 'me', data: { uid: 'me', role: 'sale', teamId: 'chosen-team' } },
      ] })
      expect(!r.ok && r.status).toBe(403)
      expect(m.writes).toEqual([])
    })

    it('an update to a document an earlier operation in the same request created is allowed', async () => {
      const m = memStore()
      const r = await runWrite(m.store, admin, { ops: [
        { op: 'set', path: 'courses', id: 'c1', data: { title: 'A' } },
        { op: 'update', path: 'courses', id: 'c1', data: { title: 'B' } },
      ] })
      expect(r.ok).toBe(true)
      expect(m.docs('courses')[0].title).toBe('B')
    })

    it('a delete is judged against what it removes', async () => {
      const m = memStore({ shadowRecords: [doc('s1', { observerUid: 'them' })] })
      const r = await runWrite(m.store, sale('me'), { ops: [{ op: 'delete', path: 'shadowRecords', id: 's1' }] })
      expect(!r.ok && r.status).toBe(403)
      expect(m.docs('shadowRecords')).toHaveLength(1)
    })
  })

  describe('refuses a malformed request', () => {
    it.each([
      ['no ops', { ops: [] }],
      ['ops that are not a list', { ops: 'x' }],
      ['no body', undefined],
      ['an unknown op', { ops: [{ op: 'drop', path: 'courses', id: 'x' }] }],
      ['an unknown collection', { ops: [{ op: 'set', path: 'nope', id: 'x', data: {} }] }],
      ['an id with a slash', { ops: [{ op: 'set', path: 'courses', id: 'a/b', data: {} }] }],
      ['data that is not an object', { ops: [{ op: 'set', path: 'courses', id: 'x', data: 'str' }] }],
      ['data that is a list', { ops: [{ op: 'set', path: 'courses', id: 'x', data: [] }] }],
      ['an update with no id', { ops: [{ op: 'update', path: 'courses', id: '', data: {} }] }],
      ['a setMany with a bad doc', { ops: [{ op: 'setMany', path: 'tools', docs: [{ id: '', data: {} }] }] }],
      ['a deleteMany with a bad id', { ops: [{ op: 'deleteMany', path: 'teams', ids: ['ok', ''] }] }],
      ['too many operations', { ops: Array(51).fill({ op: 'delete', path: 'courses', id: 'x' }) }],
    ])('%s', async (_name, body) => {
      const m = memStore()
      const r = await runWrite(m.store, admin, body)
      expect(!r.ok && r.status).toBe(400)
      expect(m.writes).toEqual([])
    })

    it('too many documents in one request', async () => {
      const docs = Array.from({ length: 2001 }, (_, i) => ({ id: `u${i}`, data: { email: 'a@x' } }))
      const r = await runWrite(memStore().store, admin, { ops: [{ op: 'setMany', path: 'users', docs }] })
      expect(!r.ok && r.status).toBe(400)
    })
  })

  describe('when the store fails', () => {
    it.each([
      ['rejected', 422], ['unavailable', 503], ['invalid-query', 400], ['not-found', 404],
    ] as const)('maps a %s failure to %i', async (code, status) => {
      const m = memStore()
      m.failNextWrites(new StoreError(code, 'detail that must not leak'))
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'T' } }] })
      expect(!r.ok && r.status).toBe(status)
      expect(JSON.stringify(r)).not.toContain('must not leak')
    })

    it('treats anything unexpected as a 500 and does not leak it', async () => {
      const m = memStore()
      m.failNextWrites(new Error('postgres://user:secret@host'))
      const r = await runWrite(m.store, admin, { ops: [{ op: 'set', path: 'courses', id: 'c1', data: { title: 'T' } }] })
      expect(!r.ok && r.status).toBe(500)
      expect(JSON.stringify(r)).not.toContain('secret')
    })
  })
})

describe('newId', () => {
  it('makes twenty letters and digits, and not the same one twice', () => {
    const ids = new Set(Array.from({ length: 200 }, newId))
    expect(ids.size).toBe(200)
    for (const id of Array.from(ids)) expect(id).toMatch(/^[A-Za-z0-9]{20}$/)
  })
})
