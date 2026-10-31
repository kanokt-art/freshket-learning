import { describe, it, expect } from 'vitest'
import { createStore, buildParams, deepMerge, collapseDuplicateRows, StoreError } from '@/lib/server/store'
import { USERS, COURSES, NOTIFICATIONS, APP_CONFIG } from '@/lib/server/docMap'

// The store talks to Postgres through its REST layer. These tests stand in a
// small in-memory server that behaves the way that layer does where it matters
// — filters, ordering, a cap on rows per response, an upsert that fills
// unmentioned columns with their defaults — so each test can say what the
// DATABASE ends up holding, not just what URL was built.
//
// The failure modes this guards are quiet ones. A read that stops at the
// server's row cap returns the first thousand employees and no error. A merge
// that sends an unmentioned column wipes it. A replace that does not name every
// column leaves stale fields behind. None of them throws; the data is just
// wrong, later.

type Row = Record<string, unknown>

interface Recorded {
  method: string
  path: string
  params: Record<string, string>
  body?: unknown
}

// What a column holds when an insert or upsert does not mention it.
const DEFAULTS: Record<string, Row> = {
  users: { display_name: '', role: 'sale', nickname: null, department: null, extra: {} },
  courses: { description: '', assigned_user_ids: [], extra: {} },
  notifications: { title: '', body: '', read: false, extra: {} },
  app_config: { value: {} },
}

// Columns declared NOT NULL with no default. Postgres checks the row an upsert
// PROPOSES against these BEFORE it looks for a conflict, so an upsert that leaves
// one out is refused even when the row it would have updated already exists.
const NOT_NULL: Record<string, string[]> = {
  courses: ['title'],
  assessment_sessions: ['uid'],
}

function parseList(s: string): string[] {
  // in.("a","b,c") — items are quoted, and a backslash escapes a quote or backslash.
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '"') {
      let item = ''
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\') i++
        item += s[i++]
      }
      i++
      out.push(item)
    } else i++
  }
  return out
}

function makeServer(opts: { maxRows?: number; failReadsOnce?: number } = {}) {
  const tables: Record<string, Row[]> = {}
  const requests: Recorded[] = []
  let readFailures = opts.failReadsOnce ?? 0

  const matches = (row: Row, col: string, expr: string) => {
    const v = row[col]
    if (expr === 'is.null') return v == null
    if (expr.startsWith('eq.')) return v != null && String(v) === expr.slice(3)
    if (expr.startsWith('in.(')) return v != null && parseList(expr.slice(4, -1)).includes(String(v))
    return true
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace('/rest/v1/', '')
    const params = Object.fromEntries(url.searchParams.entries())
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const headers = (init?.headers ?? {}) as Record<string, string>
    requests.push({ method, path, params, body })

    // A 204 may not carry a body — the Response constructor rejects one, as the
    // real layer never sends one for a delete with return=minimal.
    const reply = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(status === 204 ? null : JSON.stringify(data), {
        status, headers: { 'content-type': 'application/json', ...extra },
      })

    if (path.startsWith('rpc/')) {
      const courses = (tables.courses ??= [])
      const c = courses.find((r) => r.id === (body as Row).p_course_id)
      if (!c) return reply(0)
      const cur = (c.assigned_user_ids as string[]) ?? []
      const fresh = Array.from(new Set(((body as Row).p_uids as string[]).filter((u) => !cur.includes(u))))
      c.assigned_user_ids = [...cur, ...fresh]
      return reply(fresh.length)
    }

    const rows = (tables[path.split('?')[0]] ??= [])
    const filters = Object.entries(params).filter(([k]) =>
      !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k))
    const selected = () => rows.filter((r) => filters.every(([k, v]) => matches(r, k, v)))

    if (method === 'GET') {
      if (readFailures > 0) { readFailures--; return reply({ message: 'boom' }, 503) }
      let out = selected()
      for (const spec of (params.order ?? '').split(',').filter(Boolean).reverse()) {
        const [col, dir] = spec.split('.')
        out = [...out].sort((a, b) => {
          const x = a[col], y = b[col]
          if (x == null && y == null) return 0
          if (x == null) return 1            // nulls last, in either direction
          if (y == null) return -1
          const cmp = x < y ? -1 : x > y ? 1 : 0
          return dir === 'desc' ? -cmp : cmp
        })
      }
      const total = out.length
      const offset = Number(params.offset ?? 0)
      const limit = Math.min(Number(params.limit ?? Infinity), opts.maxRows ?? Infinity)
      const page = out.slice(offset, offset + limit)
      const range = page.length === 0 ? `*/${total}` : `${offset}-${offset + page.length - 1}/${total}`
      return reply(page, 200, headers.Prefer?.includes('count=exact') ? { 'content-range': range } : {})
    }

    if (method === 'POST') {
      const columns = (params.columns ?? '').split(',').filter(Boolean)
      const conflict = (params.on_conflict ?? '').split(',').filter(Boolean)
      const inserted: Row[] = []
      for (const row of body as Row[]) {
        for (const c of NOT_NULL[path] ?? []) {
          const proposed = columns.includes(c) && c in row ? row[c] : DEFAULTS[path]?.[c]
          if (proposed == null) {
            return reply({ code: '23502', message: `null value in column "${c}" of relation "${path}" violates not-null constraint` }, 400)
          }
        }
        const existing = rows.find((r) => conflict.every((c) => r[c] === row[c]))
        // users.auth_uid is unique: one login belongs to one person.
        if (path === 'users' && row.auth_uid != null && rows.some((r) => r !== existing && r.auth_uid === row.auth_uid)) {
          return reply({ message: 'duplicate key value violates unique constraint "users_auth_uid_key"' }, 409)
        }
        if (existing && headers.Prefer?.includes('ignore-duplicates')) continue
        const filled: Row = {}
        for (const c of columns) filled[c] = c in row ? row[c] : (DEFAULTS[path]?.[c] ?? null)
        if (existing) Object.assign(existing, filled)
        else { const made = { ...(DEFAULTS[path] ?? {}), ...filled }; rows.push(made); inserted.push(made) }
      }
      // return=representation answers with the rows that were inserted (not the ones ignored).
      return headers.Prefer?.includes('return=representation') ? reply(inserted, 201) : reply(null, 201)
    }

    if (method === 'PATCH') {
      const hit = selected()
      const b = body as Row
      if (path === 'users' && b.auth_uid != null && rows.some((r) => !hit.includes(r) && r.auth_uid === b.auth_uid)) {
        return reply({ message: 'duplicate key value violates unique constraint "users_auth_uid_key"' }, 409)
      }
      for (const r of hit) Object.assign(r, body)
      return reply(hit)
    }

    if (method === 'DELETE') {
      const hit = new Set(selected())
      tables[path] = rows.filter((r) => !hit.has(r))
      return reply(null, 204)
    }
    return reply({}, 400)
  }) as unknown as typeof fetch

  return { tables, requests, fetchImpl }
}

const make = (opts?: Parameters<typeof makeServer>[0]) => {
  const server = makeServer(opts)
  const store = createStore({ url: 'https://x.supabase.co', serviceKey: 'k', fetch: server.fetchImpl, timeoutMs: 1000 })
  return { ...server, store }
}

// ── buildParams ─────────────────────────────────────────────────────────────

describe('buildParams', () => {
  const asObject = (p: Array<[string, string]>) => Object.fromEntries(p)

  it('translates equality and `in` filters onto the stored columns', () => {
    const p = asObject(buildParams(COURSES, { where: [
      { field: 'createdBy', op: '==', value: 'u1' },
    ] }))
    expect(p.created_by).toBe('eq.u1')
  })

  it('quotes `in` items so commas, quotes and spaces survive', () => {
    const p = asObject(buildParams(USERS, { where: [
      { field: 'email', op: 'in', value: ['a,b@x', 'say "hi"', 'plain'] },
    ] }))
    expect(p.email).toBe('in.("a,b@x","say \\"hi\\"","plain")')
  })

  it('writes an empty `in` list as one that matches nothing', () => {
    const p = asObject(buildParams(USERS, { where: [{ field: 'email', op: 'in', value: [] }] }))
    expect(p.email).toBe('in.()')
  })

  it('always orders by the key last, so paging never repeats or skips a row', () => {
    expect(asObject(buildParams(COURSES, {})).order).toBe('id.asc')
    expect(asObject(buildParams(COURSES, { orderBy: [{ field: 'createdAt', direction: 'desc' }] })).order)
      .toBe('created_at.desc.nullslast,id.asc')
  })

  it('does not add the key twice when it is already ordered by', () => {
    expect(asObject(buildParams(COURSES, { orderBy: [{ field: 'id', direction: 'desc' }] })).order)
      .toBe('id.desc.nullslast')
  })

  it('sorts nulls last in both directions', () => {
    // Postgres would lead with them on a descending sort; Firestore dropped them.
    for (const direction of ['asc', 'desc'] as const) {
      expect(asObject(buildParams(COURSES, { orderBy: [{ field: 'startDate', direction }] })).order)
        .toContain('nullslast')
    }
  })

  it('scopes a notification query to its owner', () => {
    const p = asObject(buildParams(NOTIFICATIONS, {}, 'u1'))
    expect(p.uid).toBe('eq.u1')
  })

  it('maps users.uid and id to the same key column', () => {
    expect(asObject(buildParams(USERS, { where: [{ field: 'uid', op: '==', value: 'u1' }] })).uid).toBe('eq.u1')
    expect(asObject(buildParams(USERS, { where: [{ field: 'id', op: '==', value: 'u1' }] })).uid).toBe('eq.u1')
  })

  describe('refuses what it cannot map', () => {
    it.each([
      ['an unknown field', { where: [{ field: 'passwordHash', op: '==' as const, value: 'x' }] }],
      ['a column name used as a field', { where: [{ field: 'auth_uid', op: '==' as const, value: 'x' }] }],
      ['an unsupported operator', { where: [{ field: 'role', op: '>' as never, value: 'x' }] }],
      ['an `in` that is not a list', { where: [{ field: 'role', op: 'in' as const, value: 'x' }] }],
      ['an object value', { where: [{ field: 'role', op: '==' as const, value: { a: 1 } }] }],
      ['an unknown order field', { orderBy: [{ field: 'nope' }] }],
    ])('%s', (_name, q) => {
      expect(() => buildParams(USERS, q)).toThrow(StoreError)
    })

    it('an `in` with too many values', () => {
      expect(() => buildParams(USERS, { where: [{ field: 'role', op: 'in', value: Array(501).fill('x') }] }))
        .toThrow(/limited to 500/)
    })
  })
})

// ── reads ───────────────────────────────────────────────────────────────────

describe('query', () => {
  const seed = (n: number) => Array.from({ length: n }, (_, i) => ({
    uid: `u${String(i).padStart(4, '0')}`, email: `e${i}@x`, display_name: `n${i}`,
  }))

  it('returns EVERY row even when the server caps each response', () => {
    // The real failure: users has 1,642 rows and the REST layer answers with at
    // most 1,000, with no error. Here the cap is 10 and there are 25.
    const { tables, store, requests } = make({ maxRows: 10 })
    tables.users = seed(25)
    return store.query('users').then((docs) => {
      expect(docs).toHaveLength(25)
      expect(new Set(docs.map((d) => d.id)).size).toBe(25)        // no repeats
      expect(docs.map((d) => d.id)).toEqual([...docs.map((d) => d.id)].sort())
      expect(requests.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('stops at an explicit limit', async () => {
    const { tables, store } = make({ maxRows: 10 })
    tables.users = seed(25)
    expect(await store.query('users', { limit: 12 })).toHaveLength(12)
  })

  it('applies filters and ordering', async () => {
    const { tables, store } = make()
    tables.courses = [
      { id: 'a', title: 'A', created_by: 'u1', created_at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', title: 'B', created_by: 'u1', created_at: '2026-03-01T00:00:00.000Z' },
      { id: 'c', title: 'C', created_by: 'u2', created_at: '2026-02-01T00:00:00.000Z' },
    ]
    const docs = await store.query('courses', {
      where: [{ field: 'createdBy', op: '==', value: 'u1' }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    })
    expect(docs.map((d) => d.id)).toEqual(['b', 'a'])
  })

  it('answers with documents, not rows', async () => {
    const { tables, store } = make()
    tables.users = [{ uid: 'u1', email: 'a@x', display_name: 'A', team_id: null, created_at: '2026-01-01T00:00:00.000Z' }]
    const [doc] = await store.query('users')
    expect(doc).toEqual({ id: 'u1', uid: 'u1', email: 'a@x', displayName: 'A', createdAt: '2026-01-01T00:00:00.000Z' })
  })

  it('returns nothing for an empty `in` list', async () => {
    const { tables, store } = make()
    tables.users = seed(3)
    expect(await store.query('users', { where: [{ field: 'email', op: 'in', value: [] }] })).toEqual([])
  })

  it('only returns the owner\'s own notifications', async () => {
    const { tables, store } = make()
    tables.notifications = [
      { uid: 'u1', id: 'n1', type: 'x' }, { uid: 'u2', id: 'n1', type: 'x' }, { uid: 'u1', id: 'n2', type: 'x' },
    ]
    const docs = await store.query('notifications/u1/items')
    expect(docs.map((d) => d.id).sort()).toEqual(['n1', 'n2'])
  })

  it('refuses a collection it does not know', async () => {
    const { store } = make()
    await expect(store.query('_meta')).rejects.toMatchObject({ code: 'invalid-query' })
    await expect(store.query('users/x')).rejects.toMatchObject({ code: 'invalid-query' })
  })

  describe('when the database misbehaves', () => {
    it('retries a read that hits a 5xx', async () => {
      const { tables, store, requests } = make({ failReadsOnce: 1 })
      tables.users = seed(2)
      expect(await store.query('users')).toHaveLength(2)
      expect(requests.filter((r) => r.method === 'GET').length).toBe(2)
    })

    it('gives up as "unavailable" after repeated failures, not as a hang', async () => {
      const { store } = make({ failReadsOnce: 99 })
      await expect(store.query('users')).rejects.toMatchObject({ code: 'unavailable' })
    })

    it('reports an unreachable database as unavailable', async () => {
      const store = createStore({
        url: 'https://x.supabase.co', serviceKey: 'k', timeoutMs: 1000,
        fetch: (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch,
      })
      await expect(store.query('users')).rejects.toMatchObject({ code: 'unavailable' })
    })

    it('does not put the database\'s message in the error — it can quote a row', async () => {
      const store = createStore({
        url: 'https://x.supabase.co', serviceKey: 'k',
        fetch: (async () => new Response('{"message":"duplicate key (email)=(somebody@freshket.co)"}', { status: 409 })) as unknown as typeof fetch,
      })
      const err = await store.set('users', 'u1', { email: 'a@x' }).catch((e) => e)
      expect(err).toBeInstanceOf(StoreError)
      expect(err.code).toBe('rejected')
      expect(String(err.message)).not.toContain('somebody@freshket.co')
    })
  })
})

describe('get / getMany', () => {
  it('get returns null for a document that does not exist', async () => {
    const { store } = make()
    expect(await store.get('courses', 'nope')).toBeNull()
  })

  it('get finds one document by id', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', title: 'T' }, { id: 'c2', title: 'U' }]
    expect((await store.get('courses', 'c2'))?.title).toBe('U')
  })

  it('getMany reads ids in chunks so the URL stays short', async () => {
    const { tables, store, requests } = make()
    tables.courses = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}`, title: 'T' }))
    const docs = await store.getMany('courses', tables.courses.map((c) => String(c.id)))
    expect(docs).toHaveLength(250)
    expect(requests.filter((r) => r.method === 'GET')).toHaveLength(3)
  })
})

// ── writes ──────────────────────────────────────────────────────────────────

describe('set', () => {
  it('a merge writes only the fields it was given and leaves the rest', async () => {
    const { tables, store, requests } = make()
    tables.users = [{ uid: 'u1', email: 'a@x', nickname: 'Nick', department: 'Sales', display_name: 'A' }]
    await store.set('users', 'u1', { displayName: 'Renamed' }, { merge: true })

    expect(tables.users[0]).toMatchObject({ display_name: 'Renamed', nickname: 'Nick', department: 'Sales' })
    // An update of the row that is there, naming only what changed — not an upsert.
    expect(requests[0].method).toBe('PATCH')
    expect(Object.keys(requests[0].body as object)).toEqual(['display_name'])
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('a replace reverts every field it does not mention to its default', async () => {
    // Mandatory slides and cuisine guides rely on this: a removed field must go.
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', title: 'Old', description: 'was here', category: 'product', created_by: 'u' }]
    await store.set('courses', 'c1', { title: 'New', category: 'product', createdBy: 'u' }, { merge: false })
    expect(tables.courses[0]).toMatchObject({ title: 'New', description: '' })
  })

  it('creates the document when it does not exist', async () => {
    const { tables, store } = make()
    await store.set('courses', 'c1', { title: 'T', category: 'product', createdBy: 'u' })
    expect(tables.courses[0]).toMatchObject({ id: 'c1', title: 'T' })
  })

  it('folds fields kept in `extra` into what is already there', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', title: 'T', extra: { hasPreAssessment: true } }]
    await store.set('courses', 'c1', { title: 'T', legacyField: 'x' }, { merge: true })
    expect(tables.courses[0].extra).toEqual({ hasPreAssessment: true, legacyField: 'x' })
  })

  it('merges a config document deeply, as Firestore\'s merge did', async () => {
    const { tables, store } = make()
    tables.app_config = [{ id: 'moduleAccess', value: { departments: { Sales: { lms: true }, People: { lms: true } } } }]
    await store.set('appConfig', 'moduleAccess', { departments: { Sales: { shadow: true } } }, { merge: true })
    expect(tables.app_config[0].value).toEqual({
      departments: { Sales: { lms: true, shadow: true }, People: { lms: true } },
    })
  })

  it('addresses a notification by owner AND id', async () => {
    const { tables, store, requests } = make()
    await store.set('notifications/u1/items', 'new_course_c1', { type: 'new_course', title: 'x' })
    await store.set('notifications/u2/items', 'new_course_c1', { type: 'new_course', title: 'x' })
    // First the update is tried, addressed by owner AND id…
    const patch = requests.find((r) => r.method === 'PATCH')!
    expect([patch.params.uid, patch.params.id]).toEqual(['eq.u1', 'eq.new_course_c1'])
    // …and with nothing to update, the insert is keyed on both.
    expect(requests.find((r) => r.method === 'POST')!.params.on_conflict).toBe('uid,id')
    // The same notification id for two people is two rows, not one overwritten.
    expect(tables.notifications).toHaveLength(2)
    expect(tables.notifications.map((n) => n.uid).sort()).toEqual(['u1', 'u2'])
  })
})

describe('update', () => {
  it('changes only the named fields', async () => {
    const { tables, store } = make()
    tables.users = [{ uid: 'u1', email: 'a@x', team_id: 't1', display_name: 'A' }]
    await store.update('users', 'u1', { teamId: 't2' })
    expect(tables.users[0]).toMatchObject({ team_id: 't2', display_name: 'A' })
  })

  it('refuses to create a document that is not there', async () => {
    // This is what stops a stale uid becoming an empty "ghost" user.
    const { tables, store } = make()
    tables.users = []
    await expect(store.update('users', 'ghost', { teamId: 't1' })).rejects.toMatchObject({ code: 'not-found' })
    expect(tables.users).toHaveLength(0)
  })

  it('does not send the key as a column to change', async () => {
    const { tables, store, requests } = make()
    tables.users = [{ uid: 'u1', email: 'a@x' }]
    await store.update('users', 'u1', { teamId: 't2' })
    const patch = requests.find((r) => r.method === 'PATCH')!
    expect(Object.keys(patch.body as Row)).toEqual(['team_id'])
  })

  it('refuses to create a missing config document too', async () => {
    const { store } = make()
    await expect(store.update('appConfig', 'nope', { a: 1 })).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('remove / removeMany', () => {
  it('deletes one document', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1' }, { id: 'c2' }]
    await store.remove('courses', 'c1')
    expect(tables.courses.map((c) => c.id)).toEqual(['c2'])
  })

  it('deletes many, in chunks, leaving the rest', async () => {
    const { tables, store, requests } = make()
    tables.courses = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}` }))
    await store.removeMany('courses', tables.courses.slice(0, 220).map((c) => String(c.id)))
    expect(tables.courses).toHaveLength(30)
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(3)
  })

  it('deletes only the owner\'s notification when two people share an id', async () => {
    const { tables, store } = make()
    tables.notifications = [{ uid: 'u1', id: 'n1' }, { uid: 'u2', id: 'n1' }]
    await store.remove('notifications/u1/items', 'n1')
    expect(tables.notifications).toEqual([{ uid: 'u2', id: 'n1' }])
  })
})

describe('setMany', () => {
  it('a merge leaves alone a field a document does not mention', async () => {
    // The HR import omits `nickname` when the CSV cell is empty, on purpose. If
    // that document were sent in the same request as one that sets a nickname,
    // the first would be given the column's DEFAULT and the existing value lost.
    const { tables, store } = make()
    tables.users = [
      { uid: 'u1', email: 'a@x', nickname: 'Kept', department: 'Old' },
      { uid: 'u2', email: 'b@x', nickname: 'Also kept', department: 'Old' },
    ]
    await store.setMany('users', [
      { id: 'u1', data: { email: 'a@x', department: 'New' } },                    // no nickname
      { id: 'u2', data: { email: 'b@x', department: 'New', nickname: 'Changed' } },
    ], { merge: true })

    expect(tables.users[0]).toMatchObject({ department: 'New', nickname: 'Kept' })
    expect(tables.users[1]).toMatchObject({ department: 'New', nickname: 'Changed' })
  })

  it('sends documents with the same fields together', async () => {
    const { store, requests } = make()
    await store.setMany('users', [
      { id: 'u1', data: { email: 'a@x', department: 'D' } },
      { id: 'u2', data: { email: 'b@x', department: 'D' } },
      { id: 'u3', data: { email: 'c@x' } },
    ], { merge: true })
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2)
  })

  it('a replace is one request per chunk and names every column', async () => {
    const { tables, store, requests } = make()
    await store.setMany('courses', Array.from({ length: 1200 }, (_, i) => ({
      id: `c${i}`, data: { title: 'T', category: 'product', createdBy: 'u' },
    })))
    expect(tables.courses).toHaveLength(1200)
    const posts = requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(3)                                   // 500 + 500 + 200
    expect(posts[0].params.columns.split(',')).toEqual(expect.arrayContaining(['id', 'title', 'extra']))
  })

  it('names a person once even when the list has them twice (the later line wins)', async () => {
    // The same employee on two CSV lines used to fail the whole import with
    // "ON CONFLICT DO UPDATE command cannot affect row a second time".
    const { tables, store, requests } = make()
    tables.users = [{ uid: 'csv-1', email: 'a@x', nickname: 'Kept', department: 'Old' }]
    await store.setMany('users', [
      { id: 'csv-1', data: { email: 'a@x', department: 'First' } },
      { id: 'csv-2', data: { email: 'b@x', department: 'D' } },
      { id: 'csv-1', data: { email: 'a@x', department: 'Second' } },
    ], { merge: true })
    const sent = requests.filter((r) => r.method === 'POST').flatMap((r) => r.body as Row[])
    expect(sent.filter((r) => r.uid === 'csv-1')).toHaveLength(1)
    expect(tables.users.find((r) => r.uid === 'csv-1')).toMatchObject({ department: 'Second', nickname: 'Kept' })
  })

  it('does nothing for an empty list', async () => {
    const { store, requests } = make()
    await store.setMany('courses', [])
    expect(requests).toHaveLength(0)
  })
})

describe('addCourseLearners', () => {
  it('adds people to a roster and reports how many were new', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', assigned_user_ids: ['a', 'b'] }]
    expect(await store.addCourseLearners('c1', ['b', 'c', 'd'])).toBe(2)
    expect(tables.courses[0].assigned_user_ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reports zero for a course that does not exist', async () => {
    const { store } = make()
    expect(await store.addCourseLearners('nope', ['x'])).toBe(0)
  })
})

// ── identity lookups (server-internal) ──────────────────────────────────────

describe('findUsers', () => {
  const seedUsers = () => [
    { uid: 'csv-E1', email: 'Sam@Freshket.co', email_lc: 'sam@freshket.co', auth_uid: 'fb-sam', display_name: 'Sam' },
    { uid: 'csv-E2', email: 'first_last@freshket.co', email_lc: 'first_last@freshket.co', display_name: 'FL' },
    { uid: 'csv-E3', email: 'firstXlast@freshket.co', email_lc: 'firstxlast@freshket.co', display_name: 'FX' },
  ]

  it('finds a person by the Firebase uid they sign in with', async () => {
    const { tables, store } = make()
    tables.users = seedUsers()
    const [u] = await store.findUsers({ authUid: 'fb-sam' })
    expect(u.id).toBe('csv-E1')
    expect(u.authUid).toBe('fb-sam')
  })

  it('finds by email without regard to case, on the stored lower-case copy', async () => {
    const { tables, store, requests } = make()
    tables.users = seedUsers()
    const rows = await store.findUsers({ email: '  SAM@freshket.CO ' })
    expect(rows.map((r) => r.id)).toEqual(['csv-E1'])
    expect(requests[0].params.email_lc).toBe('eq.sam@freshket.co')
  })

  it('does not treat `_` in an address as a wildcard', async () => {
    // first_last@ must not also match firstXlast@ — that would sign someone in
    // as a different person.
    const { tables, store } = make()
    tables.users = seedUsers()
    expect((await store.findUsers({ email: 'first_last@freshket.co' })).map((r) => r.id)).toEqual(['csv-E2'])
  })

  it('does NOT put the Firebase uid inside the user document', async () => {
    // Every colleague can read every user document; a login identifier must not
    // travel with it. It comes back beside the document, never in it.
    const { tables, store } = make()
    tables.users = seedUsers()
    const [u] = await store.findUsers({ authUid: 'fb-sam' })
    const { authUid, ...document } = u
    void authUid
    expect(JSON.stringify(document)).not.toContain('fb-sam')
    expect(document).not.toHaveProperty('auth_uid')
  })

  it('returns nothing for a login nobody has', async () => {
    const { tables, store } = make()
    tables.users = seedUsers()
    expect(await store.findUsers({ authUid: 'nobody' })).toEqual([])
  })
})

describe('linkAuthUid', () => {
  it('links a person who has no login yet', async () => {
    const { tables, store } = make()
    tables.users = [{ uid: 'csv-E1', email: 'a@x' }]
    expect(await store.linkAuthUid('csv-E1', 'fb-1')).toBe(true)
    expect(tables.users[0].auth_uid).toBe('fb-1')
  })

  it('does NOT overwrite a login that is already there, and says so', async () => {
    // The condition is in the request itself, so two tabs signing in at once
    // cannot both win.
    const { tables, store } = make()
    tables.users = [{ uid: 'csv-E1', email: 'a@x', auth_uid: 'fb-first' }]
    expect(await store.linkAuthUid('csv-E1', 'fb-second')).toBe(false)
    expect(tables.users[0].auth_uid).toBe('fb-first')
  })

  it('reports false for a person who does not exist, and creates nobody', async () => {
    const { tables, store } = make()
    tables.users = []
    expect(await store.linkAuthUid('ghost', 'fb-1')).toBe(false)
    expect(tables.users).toHaveLength(0)
  })

  it('surfaces the database refusing a login another person already holds', async () => {
    const { tables, store } = make()
    tables.users = [
      { uid: 'csv-E1', email: 'a@x' },
      { uid: 'csv-E2', email: 'b@x', auth_uid: 'fb-taken' },
    ]
    await expect(store.linkAuthUid('csv-E1', 'fb-taken')).rejects.toMatchObject({ code: 'rejected' })
    expect(tables.users[0].auth_uid).toBeUndefined()
  })
})

describe('createUser', () => {
  it('creates a person with their login', async () => {
    const { tables, store } = make()
    await store.createUser({ uid: 'fb-new', email: 'n@x', role: 'sale', displayName: 'N' }, 'fb-new')
    expect(tables.users[0]).toMatchObject({ uid: 'fb-new', email: 'n@x', role: 'sale', auth_uid: 'fb-new' })
  })

  it('leaves an existing person alone — a racing second create must not clobber the first', async () => {
    // In particular it must not overwrite a role somebody has since set.
    const { tables, store } = make()
    tables.users = [{ uid: 'fb-new', email: 'n@x', role: 'manager', auth_uid: 'fb-new' }]
    await store.createUser({ uid: 'fb-new', email: 'n@x', role: 'sale' }, 'fb-new')
    expect(tables.users).toHaveLength(1)
    expect(tables.users[0].role).toBe('manager')
  })
})

// A partial merge onto a row that exists. The REST layer implements an upsert as
// INSERT … ON CONFLICT DO UPDATE, and Postgres checks NOT NULL on the INSERT half
// first — so "set submittedAt on this session" was refused with a null-uid error
// even though the session, and its uid, were right there. Every quiz submission
// failed at the step that closes the session.
describe('merging part of a document into one that exists', () => {
  it('changes only the fields given, and leaves the rest', async () => {
    const { tables, store } = make()
    tables.assessment_sessions = [{ id: 's1', uid: 'u1', assessment_id: 'a1', submitted_at: null, extra: {} }]
    await store.set('assessmentSessions', 's1', { submittedAt: new Date('2026-03-01T00:00:00Z'), timedOut: false }, { merge: true })
    expect(tables.assessment_sessions).toHaveLength(1)
    expect(tables.assessment_sessions[0]).toMatchObject({ id: 's1', uid: 'u1', assessment_id: 'a1' })
    expect(tables.assessment_sessions[0].submitted_at).toBeTruthy()
  })

  it('works for any table with a required column, not only sessions', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', title: 'Keep me', description: 'd', assigned_user_ids: [], extra: {} }]
    await store.set('courses', 'c1', { isPublished: true }, { merge: true })
    expect(tables.courses).toHaveLength(1)
    expect(tables.courses[0]).toMatchObject({ title: 'Keep me', is_published: true })
  })

  it('does not clobber a column it was not given', async () => {
    const { tables, store } = make()
    tables.courses = [{ id: 'c1', title: 'Keep me', description: 'Keep this too', assigned_user_ids: ['a'], extra: {} }]
    await store.set('courses', 'c1', { isPublished: true }, { merge: true })
    expect(tables.courses[0]).toMatchObject({ description: 'Keep this too', assigned_user_ids: ['a'] })
  })

  it('still creates a document that does not exist when it is complete', async () => {
    const { tables, store } = make()
    await store.set('courses', 'c-new', { title: 'Brand new', category: 'sales_skill' }, { merge: true })
    expect(tables.courses).toHaveLength(1)
    expect(tables.courses[0]).toMatchObject({ id: 'c-new', title: 'Brand new' })
  })

  it('refuses to invent a half-made document when it is not', async () => {
    // A merge onto a missing id used to be the way ghost profiles got made.
    const { tables, store } = make()
    await expect(store.set('courses', 'c-ghost', { isPublished: true }, { merge: true }))
      .rejects.toMatchObject({ code: 'rejected' })
    expect(tables.courses ?? []).toHaveLength(0)
  })

  it('a full replace is unaffected', async () => {
    const { tables, store } = make()
    await store.set('courses', 'c1', { title: 'T', category: 'x' }, { merge: false })
    expect(tables.courses[0]).toMatchObject({ id: 'c1', title: 'T' })
  })
})

// "Clear this field" must clear it. A null in a partial write used to be dropped on
// the way to the database, so taking someone out of a team (teamId: null), removing a
// mistaken score, or clearing a completion date silently did nothing.
describe('clearing a field with null', () => {
  const person = () => ({ uid: 'u1', email: 'a@x', display_name: 'A', team_id: 't1', nickname: 'Nick', visible_team_ids: ['t1'] })

  it('merge: sets the column to NULL and leaves the others', async () => {
    const { tables, store } = make()
    tables.users = [person()]
    await store.set('users', 'u1', { teamId: null }, { merge: true })
    expect(tables.users[0].team_id).toBeNull()
    expect(tables.users[0]).toMatchObject({ display_name: 'A', nickname: 'Nick' })
  })

  it('update: sets the column to NULL', async () => {
    const { tables, store } = make()
    tables.users = [person()]
    await store.update('users', 'u1', { teamId: null, visibleTeamIds: null })
    expect(tables.users[0].team_id).toBeNull()
    expect(tables.users[0].visible_team_ids).toBeNull()   // null = "sees every team", not "sees none"
    expect(tables.users[0].nickname).toBe('Nick')
  })

  it('setMany with merge: clears per document', async () => {
    const { tables, store } = make()
    tables.users = [person(), { ...person(), uid: 'u2' }]
    await store.setMany('users', [
      { id: 'u1', data: { email: 'a@x', teamId: null } },
      { id: 'u2', data: { email: 'a@x', nickname: 'Changed' } },
    ], { merge: true })
    const byId = Object.fromEntries(tables.users.map((u) => [u.uid, u]))
    expect(byId.u1.team_id).toBeNull()
    expect(byId.u2.team_id).toBe('t1')          // not mentioned, so untouched
    expect(byId.u2.nickname).toBe('Changed')
  })

  it('clears a date and a score on a training record', async () => {
    const { tables, store } = make()
    tables.training_records = [{ id: 'u_c', user_id: 'u', course_id: 'c', status: 'completed', score: 90, completed_at: '2026-01-01T00:00:00Z', extra: {} }]
    await store.set('trainingRecords', 'u_c', { userId: 'u', courseId: 'c', status: 'failed', completedAt: null, score: null }, { merge: true })
    expect(tables.training_records[0]).toMatchObject({ status: 'failed', completed_at: null, score: null })
  })

  it('a value that is not null still replaces as before', async () => {
    const { tables, store } = make()
    tables.users = [person()]
    await store.set('users', 'u1', { teamId: 't2' }, { merge: true })
    expect(tables.users[0].team_id).toBe('t2')
  })

  it('a full replace is unchanged: a null falls back to the default, it is not sent', async () => {
    const { requests, store } = make()
    await store.set('users', 'u1', { email: 'a@x', teamId: null }, { merge: false })
    const post = requests.find((r) => r.method === 'POST')!
    expect(JSON.stringify(post.body)).not.toContain('"team_id":null')
  })

  it('does not null a key column, whatever the document says', async () => {
    const { tables, store } = make()
    tables.users = [person()]
    await store.update('users', 'u1', { uid: null, teamId: 't3' } as Record<string, unknown>)
    expect(tables.users[0].uid).toBe('u1')
    expect(tables.users[0].team_id).toBe('t3')
  })
})

describe('claim', () => {
  it('creates the document and says it was the one that did', async () => {
    const { tables, store } = make()
    expect(await store.claim('slackPosts', 'takeaway_u1_c1', { kind: 'takeaway', postedAt: new Date('2026-03-01T00:00:00Z') })).toBe(true)
    expect(tables.slack_posts).toHaveLength(1)
    expect(tables.slack_posts[0]).toMatchObject({ id: 'takeaway_u1_c1', kind: 'takeaway' })
  })

  it('says no, and changes nothing, when it is already there', async () => {
    // The second save of a takeaway must not announce again, nor rewrite the first claim.
    const { tables, store } = make()
    await store.claim('slackPosts', 'takeaway_u1_c1', { kind: 'takeaway' })
    const before = JSON.stringify(tables.slack_posts)
    expect(await store.claim('slackPosts', 'takeaway_u1_c1', { kind: 'other' })).toBe(false)
    expect(JSON.stringify(tables.slack_posts)).toBe(before)
  })

  it('lets different ids each claim once', async () => {
    const { store } = make()
    expect(await store.claim('slackPosts', 'a', { kind: 'x' })).toBe(true)
    expect(await store.claim('slackPosts', 'b', { kind: 'x' })).toBe(true)
    expect(await store.claim('slackPosts', 'a', { kind: 'x' })).toBe(false)
  })

  it('surfaces a database refusal rather than reporting a claim', async () => {
    const { store } = make()
    await expect(store.claim('nope', 'a', {})).rejects.toMatchObject({ code: 'invalid-query' })
  })
})

// ── deepMerge ───────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('folds objects together and replaces everything else', () => {
    expect(deepMerge(
      { a: { x: 1, y: 2 }, list: [1, 2], s: 'old' },
      { a: { y: 3, z: 4 }, list: [9], s: 'new' },
    )).toEqual({ a: { x: 1, y: 3, z: 4 }, list: [9], s: 'new' })
  })

  it('does not touch its inputs', () => {
    const a = { a: { x: 1 } }
    deepMerge(a, { a: { y: 2 } })
    expect(a).toEqual({ a: { x: 1 } })
  })
})

// The app-config spec stores a whole document in one column.
describe('whole-document tables', () => {
  it('read back as the document, with its id', async () => {
    const { tables, store } = make()
    tables.app_config = [{ id: 'moduleAccess', value: { departments: { A: { lms: true } } } }]
    expect(await store.get('appConfig', 'moduleAccess')).toEqual({ id: 'moduleAccess', departments: { A: { lms: true } } })
    expect(APP_CONFIG.asJson).toBe('value')
  })
})

describe('collapseDuplicateRows', () => {
  it('keeps the later row; a merge also keeps columns only the earlier one had', () => {
    const rows = [{ uid: 'a', x: 1, y: 1 }, { uid: 'b', x: 1 }, { uid: 'a', x: 2 }]
    expect(collapseDuplicateRows(rows, ['uid'], false).find((r) => r.uid === 'a')).toEqual({ uid: 'a', x: 2 })
    expect(collapseDuplicateRows(rows, ['uid'], true).find((r) => r.uid === 'a')).toEqual({ uid: 'a', x: 2, y: 1 })
    expect(collapseDuplicateRows(rows, ['uid'], true)).toHaveLength(2)
  })

  it('treats the same id under different parents as different rows', () => {
    const rows = [{ uid: 'u1', id: 'n1' }, { uid: 'u2', id: 'n1' }]
    expect(collapseDuplicateRows(rows, ['uid', 'id'], false)).toHaveLength(2)
  })
})
