// The server's document store, backed by Supabase Postgres.
//
// Callers name a collection and deal in documents — the same shape Firestore
// gave them — and never see a table, a column or a SQL string. docMap.ts knows
// how a document maps to a row; this file knows how to ask Postgres for it.
//
// SERVER ONLY. It holds the service_role key, which bypasses Row Level Security
// entirely. Every table has RLS on with no policy, so this key is the only way
// in, and nothing that reaches a browser may ever import this file.
//
// WHY PLAIN fetch AND NOT supabase-js. The requests are simple (equality and
// `in` filters, ordering, upserts), and writing them out makes three things
// explicit that a client library would hide:
//  · a TIMEOUT on every call. A hung dependency on a serverless function burns
//    the whole time budget and surfaces as a bare 504 with nothing in the logs —
//    which is exactly how an earlier Firestore quota failure hid for days;
//  · PAGINATION. The REST layer silently caps a response (1,000 rows by
//    default). `users` has more than that, so an unpaged read would return the
//    first thousand employees and no error;
//  · the exact shape of every write, so it can be tested without a database.
//
// FETCH IS INJECTED so tests can stand in a fake server and assert on the
// requests the store makes.

import {
  resolveCollection, transformDoc, rowToDoc, columnFor, allColumns, normalize, identityRemap,
  NOTIFICATIONS, type Doc, type Row, type TableSpec,
} from './docMap'

// ── Errors ──────────────────────────────────────────────────────────────────

export type StoreErrorCode =
  | 'not-found'        // an update to a document that does not exist
  | 'invalid-query'    // a field, operator or path this store refuses
  | 'unavailable'      // the database could not be reached, or timed out
  | 'rejected'         // the database refused the write (constraint, bad value)

export class StoreError extends Error {
  constructor(public code: StoreErrorCode, message: string, public status?: number) {
    super(message)
    this.name = 'StoreError'
  }
}

// ── Query shape ─────────────────────────────────────────────────────────────

export type QueryOp = '==' | 'in'

export interface Where {
  field: string
  op: QueryOp
  value: unknown
}

export interface OrderBy {
  field: string
  direction?: 'asc' | 'desc'
}

export interface Query {
  where?: Where[]
  orderBy?: OrderBy[]
  limit?: number
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface StoreConfig {
  url: string
  serviceKey: string
  fetch?: typeof fetch
  /** Per-request budget. A call that exceeds it fails fast instead of hanging. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const PAGE = 1000          // rows per page when reading everything
const MAX_LIMIT = 10_000   // the most one query may ask for
const MAX_IN = 500         // values in one `in` filter
const IN_CHUNK = 100       // ids per request when reading/deleting by id (URL length)
const WRITE_CHUNK = 500

// ── PostgREST encoding ──────────────────────────────────────────────────────

/** A scalar for the right-hand side of `eq.` — PostgREST takes it literally. */
function scalar(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  throw new StoreError('invalid-query', 'filter values must be strings, numbers or booleans')
}

/** One element of an `in.(...)` list, quoted so commas, parentheses and spaces survive. */
function listItem(v: unknown): string {
  const s = scalar(v)
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

type Params = Array<[string, string]>

function ownerFilter(spec: TableSpec, parentUid: string | undefined): Params {
  // notifications are a per-person feed: the owner is part of every address.
  return spec === NOTIFICATIONS && parentUid !== undefined ? [['uid', `eq.${parentUid}`]] : []
}

/** Translate a document query into REST parameters. Refuses anything it cannot map. */
export function buildParams(spec: TableSpec, q: Query, parentUid?: string): Params {
  const params: Params = [['select', '*'], ...ownerFilter(spec, parentUid)]

  for (const w of q.where ?? []) {
    const column = columnFor(spec, w.field)
    if (!column) throw new StoreError('invalid-query', `cannot filter ${spec.source} on "${w.field}"`)
    if (w.op === '==') {
      params.push([column, `eq.${scalar(w.value)}`])
    } else if (w.op === 'in') {
      if (!Array.isArray(w.value)) throw new StoreError('invalid-query', '"in" needs a list')
      if (w.value.length > MAX_IN) throw new StoreError('invalid-query', `"in" is limited to ${MAX_IN} values`)
      // An empty list matches nothing; `in.()` is how PostgREST says so.
      params.push([column, `in.(${w.value.map(listItem).join(',')})`])
    } else {
      throw new StoreError('invalid-query', `unsupported operator "${String((w as Where).op)}"`)
    }
  }

  // Key columns break ties, so paging through an ordered result never repeats
  // or skips a row. Nulls sort last either way: Firestore dropped documents
  // missing the ordered field, and the nearest honest equivalent is to put them
  // at the end rather than let Postgres lead with them on a descending sort.
  const order: string[] = []
  for (const o of q.orderBy ?? []) {
    const column = columnFor(spec, o.field)
    if (!column) throw new StoreError('invalid-query', `cannot order ${spec.source} by "${o.field}"`)
    order.push(`${column}.${o.direction === 'desc' ? 'desc' : 'asc'}.nullslast`)
  }
  for (const k of spec.keyColumns) if (!order.some((x) => x.startsWith(`${k}.`))) order.push(`${k}.asc`)
  params.push(['order', order.join(',')])

  return params
}

const toQueryString = (params: Params) =>
  params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

// ── The store ───────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Keep fields the document does not mention (the default for a write). */
  merge?: boolean
}

export function createStore(config: StoreConfig) {
  const base = config.url.replace(/\/$/, '')
  const doFetch = config.fetch ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    ...extra,
  })

  async function call(path: string, init: RequestInit & { retry?: boolean } = {}): Promise<Response> {
    // Reads are safe to repeat, so a brief outage costs a retry rather than an
    // error. Writes are never retried: a timed-out write may have landed.
    const attempts = init.retry ? 3 : 1
    let last: unknown
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await doFetch(`${base}/rest/v1/${path}`, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (res.status >= 500 && i < attempts - 1) { last = new Error(`HTTP ${res.status}`); continue }
        return res
      } catch (e) {
        last = e
      }
    }
    throw new StoreError('unavailable', `database unreachable: ${last instanceof Error ? last.message : String(last)}`)
  }

  async function fail(res: Response, what: string): Promise<never> {
    // The database's message is for the log, not for a client: it can quote the
    // row that was rejected, which may be somebody's personal data.
    const text = (await res.text().catch(() => '')).slice(0, 300)
    console.error(`store: ${what} -> HTTP ${res.status} ${text}`)
    throw new StoreError(res.status >= 500 ? 'unavailable' : 'rejected', `${what} failed`, res.status)
  }

  function resolve(path: string) {
    const r = resolveCollection(path)
    if (!r) throw new StoreError('invalid-query', `unknown collection "${path}"`)
    return r
  }

  // ── reads ────────────────────────────────────────────────────────────────

  /**
   * Run a query. With no `limit` it returns EVERY match, paging through the
   * server's response cap; the total comes from the response itself, so this
   * stays correct whatever that cap is configured to.
   */
  async function query(path: string, q: Query = {}): Promise<Doc[]> {
    const { spec, parentUid } = resolve(path)
    const wanted = Math.min(q.limit ?? Infinity, MAX_LIMIT)
    const params = buildParams(spec, q, parentUid)
    const rows: Row[] = []

    while (rows.length < wanted) {
      const size = Math.min(PAGE, wanted - rows.length)
      const res = await call(`${spec.table}?${toQueryString([...params, ['limit', String(size)], ['offset', String(rows.length)]])}`, {
        headers: headers({ Prefer: 'count=exact' }),
        retry: true,
      })
      if (!res.ok) await fail(res, `read ${spec.table}`)

      const page = (await res.json()) as Row[]
      rows.push(...page)

      // "0-999/1642": stop once we have everything the server says exists.
      const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
      if (page.length === 0 || (Number.isFinite(total) && rows.length >= total)) break
    }

    return rows.slice(0, wanted).map((r) => rowToDoc(spec, r))
  }

  async function get(path: string, id: string): Promise<Doc | null> {
    const rows = await query(path, { where: [{ field: 'id', op: '==', value: id }], limit: 1 })
    return rows[0] ?? null
  }

  async function getMany(path: string, ids: string[]): Promise<Doc[]> {
    const out: Doc[] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      out.push(...(await query(path, { where: [{ field: 'id', op: 'in', value: ids.slice(i, i + IN_CHUNK) }] })))
    }
    return out
  }

  // ── writes ───────────────────────────────────────────────────────────────

  /** Document -> row, using the path's own owner for a notification. */
  function toRow(spec: TableSpec, parentUid: string | undefined, id: string, data: Record<string, unknown>): Row {
    const input = parentUid !== undefined ? { ...data, __parentUid: parentUid } : data
    return transformDoc(spec, id, input, identityRemap).row
  }

  const keyFilter = (spec: TableSpec, parentUid: string | undefined, id: string): Params => [
    ...(parentUid !== undefined ? ([['uid', `eq.${parentUid}`]] as Params) : []),
    [spec.keyColumns[spec.keyColumns.length - 1], `eq.${id}`],
  ]

  async function post(spec: TableSpec, rows: Row[], columns: string[]): Promise<void> {
    if (rows.length === 0) return
    const qs = `on_conflict=${spec.keyColumns.join(',')}&columns=${columns.map(encodeURIComponent).join(',')}`
    const res = await call(`${spec.table}?${qs}`, {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/json',
        // missing=default: a column the row does not mention takes its default.
        // That is what makes a full replace revert unmentioned fields, and why
        // a merge names only the columns it was given.
        Prefer: 'resolution=merge-duplicates,return=minimal,missing=default',
      }),
      body: JSON.stringify(rows),
    })
    if (!res.ok) await fail(res, `write ${spec.table}`)
  }

  /** A document's fields without its id. */
  function stripId(doc: Doc): Record<string, unknown> {
    const { id, ...rest } = doc
    void id
    return rest
  }

  async function set(path: string, id: string, data: Record<string, unknown>, opts: WriteOptions = {}): Promise<void> {
    const { spec, parentUid } = resolve(path)
    const merge = opts.merge ?? true
    let row = toRow(spec, parentUid, id, data)

    if (merge && spec.asJson) {
      // A config document merges deeply, like Firestore's setDoc(..., {merge:true}).
      const existing = await get(path, id)
      const merged = deepMerge(existing ? stripId(existing) : {}, data)
      row = { id, [spec.asJson]: normalize(merged) ?? {} }
    } else if (merge) {
      row = await foldIntoExtra(path, spec, id, row)
    }

    await post(spec, [row], merge ? Object.keys(row) : allColumns(spec))
  }

  /**
   * Fields kept in `extra` are one JSON column. Firestore's merge folds into a
   * document key by key; a plain column write would replace the lot and quietly
   * drop whatever the caller did not mention. So for a merge the existing value
   * is read and folded in first.
   */
  async function foldIntoExtra(path: string, spec: TableSpec, id: string, row: Row): Promise<Row> {
    if (!spec.hasExtra || row.extra === undefined) return row
    const res = await call(
      `${spec.table}?${toQueryString([['select', 'extra'], ...keyFilter(spec, resolve(path).parentUid, id), ['limit', '1']])}`,
      { headers: headers(), retry: true },
    )
    if (!res.ok) await fail(res, `read ${spec.table}.extra`)
    const [existing] = (await res.json()) as Array<{ extra?: Record<string, unknown> }>
    return { ...row, extra: { ...(existing?.extra ?? {}), ...(row.extra as Record<string, unknown>) } }
  }

  /** Change fields on a document that must already exist; refuses to create one. */
  async function update(path: string, id: string, data: Record<string, unknown>): Promise<void> {
    const { spec, parentUid } = resolve(path)
    if (spec.asJson) {
      // Same rule, expressed through the generic path: read, fold, write back.
      const existing = await get(path, id)
      if (!existing) throw new StoreError('not-found', `${path}/${id} does not exist`)
      return set(path, id, data, { merge: true })
    }

    let row = toRow(spec, parentUid, id, data)
    row = await foldIntoExtra(path, spec, id, row)
    // The key itself is what the filter selects on; it is not a column to change.
    for (const k of spec.keyColumns) delete row[k]
    if (Object.keys(row).length === 0) {
      if ((await get(path, id)) === null) throw new StoreError('not-found', `${path}/${id} does not exist`)
      return
    }

    const res = await call(`${spec.table}?${toQueryString(keyFilter(spec, parentUid, id))}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    })
    if (!res.ok) await fail(res, `update ${spec.table}`)
    if (((await res.json()) as unknown[]).length === 0) {
      throw new StoreError('not-found', `${path}/${id} does not exist`)
    }
  }

  async function remove(path: string, id: string): Promise<void> {
    const { spec, parentUid } = resolve(path)
    const res = await call(`${spec.table}?${toQueryString(keyFilter(spec, parentUid, id))}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    })
    if (!res.ok) await fail(res, `delete ${spec.table}`)
  }

  /**
   * Write many documents. A MERGE writes only the fields each document has, so
   * documents are grouped by which columns they set and each group goes out as
   * its own request: sending them together would give a document that lacks a
   * field that field's DEFAULT — wiping a value the caller meant to leave alone
   * (the HR import leaves `nickname` out when the CSV cell is empty, on purpose).
   * A replace names every column, so it is one request per chunk.
   */
  async function setMany(
    path: string,
    docs: Array<{ id: string; data: Record<string, unknown> }>,
    opts: WriteOptions = {},
  ): Promise<void> {
    const { spec, parentUid } = resolve(path)
    const merge = opts.merge ?? false
    const rows = docs.map((d) => toRow(spec, parentUid, d.id, d.data))

    if (!merge) {
      const columns = allColumns(spec)
      for (let i = 0; i < rows.length; i += WRITE_CHUNK) await post(spec, rows.slice(i, i + WRITE_CHUNK), columns)
      return
    }

    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const key = Object.keys(row).sort().join(',')
      const g = groups.get(key)
      if (g) g.push(row)
      else groups.set(key, [row])
    }
    for (const [key, group] of Array.from(groups)) {
      const columns = key.split(',')
      for (let i = 0; i < group.length; i += WRITE_CHUNK) await post(spec, group.slice(i, i + WRITE_CHUNK), columns)
    }
  }

  async function removeMany(path: string, ids: string[]): Promise<void> {
    const { spec, parentUid } = resolve(path)
    const idColumn = spec.keyColumns[spec.keyColumns.length - 1]
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const params: Params = [
        ...(parentUid !== undefined ? ([['uid', `eq.${parentUid}`]] as Params) : []),
        [idColumn, `in.(${ids.slice(i, i + IN_CHUNK).map(listItem).join(',')})`],
      ]
      const res = await call(`${spec.table}?${toQueryString(params)}`, {
        method: 'DELETE',
        headers: headers({ Prefer: 'return=minimal' }),
      })
      if (!res.ok) await fail(res, `delete ${spec.table}`)
    }
  }

  /** Add people to a course roster atomically (see supabase/migrations/006). */
  async function addCourseLearners(courseId: string, uids: string[]): Promise<number> {
    const res = await call('rpc/add_course_learners', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_course_id: courseId, p_uids: uids }),
    })
    if (!res.ok) await fail(res, 'add_course_learners')
    const n = await res.json()
    return typeof n === 'number' ? n : 0
  }

  return { query, get, getMany, set, update, remove, setMany, removeMany, addCourseLearners }
}

export type Store = ReturnType<typeof createStore>

/** Firestore-style deep merge: objects fold together, anything else replaces. */
export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k]
    const bothObjects =
      v !== null && typeof v === 'object' && !Array.isArray(v) &&
      cur !== null && typeof cur === 'object' && !Array.isArray(cur)
    out[k] = bothObjects ? deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>) : v
  }
  return out
}

// ── The shared instance ─────────────────────────────────────────────────────

let shared: Store | null = null

/** The store the API routes use, configured from the server's environment. */
export function getStore(): Store {
  if (shared) return shared
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new StoreError('unavailable', 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  shared = createStore({ url, serviceKey })
  return shared
}
