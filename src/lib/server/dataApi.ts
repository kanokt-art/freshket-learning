// The one door the browser uses to read and write data.
//
// The browser used to talk to Firestore directly and firestore.rules decided what
// it could do. Postgres is behind the server instead, so this is where each
// request is checked and carried out: resolve the collection, ask policies.ts
// whether THIS person may, and only then touch the store.
//
// PURE OF FRAMEWORK. Everything here takes the store and the already-verified
// caller as arguments and returns a plain result, so the whole of it is tested
// without Next, a token, or a database. The route files are thin shells that
// authenticate and hand over.
//
// WRITES ARE CHECKED ALL AT ONCE, BEFORE ANY IS DONE. A request can carry many
// operations (the HR import writes thousands of users). Every document is judged
// first, against the document as it would be after the operations before it in
// the same request — not just as it is in the database — and if any one is
// refused, nothing is written. Judging against the database alone would let a
// request be assembled from two operations that are each allowed in isolation
// but not together.
//
// Writes across several operations are not one transaction: once they pass,
// they run in order, and a failure part-way leaves the earlier ones done. The
// app's own writes already behaved that way (a batch per chunk); a request is
// refused, never half-checked.

import {
  resolveCollection, dateFieldsOf, type Doc,
} from './docMap'
import {
  canRead, canWrite, classify, changedKeys, resultingDoc, validId, viewOf, queryFieldsAllowed,
  type Actor, type WriteOp,
} from './policies'
import { StoreError, type Store, type Query } from './store'
import { refusesClientStatus } from '@/lib/courses/completion'

// ── Results ─────────────────────────────────────────────────────────────────

export type ApiResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string }
const fail = (status: number, error: string): { ok: false; status: number; error: string } =>
  ({ ok: false, status, error })

/** A store failure, as the caller should see it. The database's own words stay in the log. */
function fromStoreError(e: unknown): { ok: false; status: number; error: string } {
  if (e instanceof StoreError) {
    switch (e.code) {
      case 'invalid-query': return fail(400, 'Bad request')
      case 'not-found': return fail(404, 'Not found')
      case 'rejected': return fail(422, 'The change was rejected')
      case 'unavailable': return fail(503, 'Service unavailable')
    }
  }
  console.error('dataApi: unexpected failure', e)
  return fail(500, 'Internal error')
}

// ── Reading ─────────────────────────────────────────────────────────────────

const MAX_CONSTRAINTS = 10
const MAX_LIMIT = 10_000

/** A constraint as the browser sends it. */
interface Constraint {
  type?: unknown; field?: unknown; op?: unknown; value?: unknown; direction?: unknown; count?: unknown
}

function toQuery(constraints: unknown): Query | null {
  if (constraints === undefined) return {}
  if (!Array.isArray(constraints) || constraints.length > MAX_CONSTRAINTS) return null
  const q: Query = { where: [], orderBy: [] }

  for (const c of constraints as Constraint[]) {
    if (!c || typeof c !== 'object') return null
    if (c.type === 'where') {
      if (typeof c.field !== 'string' || (c.op !== '==' && c.op !== 'in')) return null
      q.where!.push({ field: c.field, op: c.op, value: c.value })
    } else if (c.type === 'orderBy') {
      if (typeof c.field !== 'string') return null
      q.orderBy!.push({ field: c.field, direction: c.direction === 'desc' ? 'desc' : 'asc' })
    } else if (c.type === 'limit') {
      if (typeof c.count !== 'number' || !Number.isInteger(c.count) || c.count < 1 || c.count > MAX_LIMIT) return null
      q.limit = c.count
    } else {
      return null
    }
  }
  return q
}

export interface DocsResponse {
  docs: Doc[]
  /** Which fields hold dates — JSON cannot carry one, so the browser revives them. */
  dateFields: string[]
}

export async function runQuery(store: Store, actor: Actor, body: unknown): Promise<ApiResult<DocsResponse>> {
  const b = (body ?? {}) as { path?: unknown; constraints?: unknown }
  if (typeof b.path !== 'string') return fail(400, 'Bad request')

  const target = resolveCollection(b.path)
  if (!target) return fail(400, 'Bad request')

  if (!canRead({ actor, collection: target.spec.source, parentUid: target.parentUid })) return fail(403, 'Forbidden')

  const query = toQuery(b.constraints)
  if (!query) return fail(400, 'Bad request')
  const fieldsUsed = [...(query.where ?? []).map((w) => w.field), ...(query.orderBy ?? []).map((o) => o.field)]
  if (!queryFieldsAllowed(actor, target.spec.source, fieldsUsed)) return fail(403, 'Forbidden')

  try {
    const found = await store.query(b.path, query)
    const docs = found.map((d) => viewOf(actor, target.spec.source, d)).filter((d): d is Doc => d !== null)
    return { ok: true, value: { docs, dateFields: dateFieldsOf(target.spec) } }
  } catch (e) {
    return fromStoreError(e)
  }
}

export async function runGet(
  store: Store, actor: Actor, body: unknown,
): Promise<ApiResult<{ doc: Doc | null; dateFields: string[] }>> {
  const b = (body ?? {}) as { path?: unknown; id?: unknown }
  if (typeof b.path !== 'string' || !validId(b.id)) return fail(400, 'Bad request')

  const target = resolveCollection(b.path)
  if (!target) return fail(400, 'Bad request')
  if (!canRead({ actor, collection: target.spec.source, parentUid: target.parentUid })) return fail(403, 'Forbidden')

  try {
    const found = await store.get(b.path, b.id)
    const doc = found ? viewOf(actor, target.spec.source, found) : null
    return { ok: true, value: { doc, dateFields: dateFieldsOf(target.spec) } }
  } catch (e) {
    return fromStoreError(e)
  }
}

// ── Writing ─────────────────────────────────────────────────────────────────

const MAX_OPS = 50
const MAX_DOCS = 2000

/** Firestore's own auto-ids: twenty letters and digits. */
export function newId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

type ClientOp =
  | { op: 'set'; path: string; id: string; data: Record<string, unknown>; merge?: boolean }
  | { op: 'update'; path: string; id: string; data: Record<string, unknown> }
  | { op: 'delete'; path: string; id: string }
  | { op: 'setMany'; path: string; docs: Array<{ id: string; data: Record<string, unknown> }>; merge?: boolean }
  | { op: 'deleteMany'; path: string; ids: string[] }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The data without its `id`: the id is the key and is passed separately. */
function withoutId(data: Record<string, unknown>): Record<string, unknown> {
  const { id, ...rest } = data
  void id
  return rest
}

/** One document the request touches, with enough to judge it and to do it. */
interface Planned {
  opIndex: number
  path: string
  collection: string
  parentUid?: string
  id: string
  kind: 'set' | 'update' | 'delete'
  data: Record<string, unknown>
  merge: boolean
}

function parseOps(body: unknown): { ops: ClientOp[]; planned: Planned[] } | null {
  const b = (body ?? {}) as { ops?: unknown }
  if (!Array.isArray(b.ops) || b.ops.length === 0 || b.ops.length > MAX_OPS) return null

  const ops: ClientOp[] = []
  const planned: Planned[] = []

  for (const raw of b.ops as unknown[]) {
    if (!isObject(raw) || typeof raw.path !== 'string') return null
    const target = resolveCollection(raw.path)
    if (!target) return null
    const base = { opIndex: ops.length, path: raw.path, collection: target.spec.source, parentUid: target.parentUid }

    switch (raw.op) {
      case 'set': {
        if (typeof raw.id !== 'string' || !isObject(raw.data)) return null
        // An empty id means "make one", as an auto-id document did.
        const id = raw.id === '' ? newId() : raw.id
        if (!validId(id)) return null
        const merge = raw.merge !== false
        ops.push({ op: 'set', path: raw.path, id, data: raw.data, merge })
        planned.push({ ...base, id, kind: 'set', data: withoutId(raw.data), merge })
        break
      }
      case 'update': {
        if (!validId(raw.id) || !isObject(raw.data)) return null
        ops.push({ op: 'update', path: raw.path, id: raw.id, data: raw.data })
        planned.push({ ...base, id: raw.id, kind: 'update', data: withoutId(raw.data), merge: true })
        break
      }
      case 'delete': {
        if (!validId(raw.id)) return null
        ops.push({ op: 'delete', path: raw.path, id: raw.id })
        planned.push({ ...base, id: raw.id, kind: 'delete', data: {}, merge: true })
        break
      }
      case 'setMany': {
        if (!Array.isArray(raw.docs)) return null
        const docs: Array<{ id: string; data: Record<string, unknown> }> = []
        for (const d of raw.docs as unknown[]) {
          if (!isObject(d) || !validId(d.id) || !isObject(d.data)) return null
          docs.push({ id: d.id, data: d.data })
        }
        const merge = raw.merge === true            // a bulk write replaces unless told to merge
        ops.push({ op: 'setMany', path: raw.path, docs, merge })
        for (const d of docs) planned.push({ ...base, id: d.id, kind: 'set', data: withoutId(d.data), merge })
        break
      }
      case 'deleteMany': {
        if (!Array.isArray(raw.ids) || !raw.ids.every(validId)) return null
        const ids = raw.ids as string[]
        ops.push({ op: 'deleteMany', path: raw.path, ids })
        for (const id of ids) planned.push({ ...base, id, kind: 'delete', data: {}, merge: true })
        break
      }
      default:
        return null
    }
    if (planned.length > MAX_DOCS) return null
  }
  return { ops, planned }
}

export interface WriteResponse {
  results: Array<{ id: string }>
}

export async function runWrite(store: Store, actor: Actor, body: unknown): Promise<ApiResult<WriteResponse>> {
  const parsed = parseOps(body)
  if (!parsed) return fail(400, 'Bad request')
  const { ops, planned } = parsed

  // What is there now, for every document the request touches.
  const state = new Map<string, Doc | null>()
  const keyOf = (path: string, id: string) => `${path}\u0000${id}`
  try {
    const idsByPath = new Map<string, Set<string>>()
    for (const p of planned) {
      if (!idsByPath.has(p.path)) idsByPath.set(p.path, new Set())
      idsByPath.get(p.path)!.add(p.id)
    }
    for (const [path, ids] of Array.from(idsByPath)) {
      const found = await store.getMany(path, Array.from(ids))
      for (const id of Array.from(ids)) state.set(keyOf(path, id), found.find((d) => d.id === id) ?? null)
    }
  } catch (e) {
    return fromStoreError(e)
  }

  // Judge every document first. `state` moves forward as we go, so a document is
  // judged as it would be after the operations before it in this same request.
  for (const p of planned) {
    const existing = state.get(keyOf(p.path, p.id)) ?? null
    if (p.kind === 'update' && existing === null) return fail(404, 'Not found')

    const incoming = p.kind === 'delete'
      ? null
      : resultingDoc(existing, { id: p.id, ...p.data }, p.merge)

    const allowed = canWrite({
      actor, collection: p.collection, parentUid: p.parentUid, id: p.id,
      op: classify(existing, incoming) as WriteOp,
      existing, incoming, changed: changedKeys(existing, incoming),
    })
    // Not saying which rule, or even which document: that would be a map for
    // someone probing what they can get away with.
    if (!allowed) return fail(403, 'Forbidden')

    // A course with a graded post-test is finished by the server grading it, not by
    // the browser saying so (lib/courses/completion.ts). This needs the course, which
    // the per-document rules above cannot see.
    if (p.collection === 'trainingRecords' && p.kind !== 'delete' && incoming) {
      const before = existing?.status
      const after = incoming.status
      if (after !== before && (after === 'completed' || after === 'failed')) {
        const courseId = String(incoming.courseId ?? existing?.courseId ?? '')
        try {
          const course = courseId ? await store.get('courses', courseId) : null
          if (refusesClientStatus(course as Parameters<typeof refusesClientStatus>[0], before, after)) return fail(403, 'Forbidden')
        } catch (e) {
          return fromStoreError(e)
        }
      }
    }

    state.set(keyOf(p.path, p.id), incoming)
  }

  // Everything is allowed. Now do it, in order.
  try {
    for (const op of ops) {
      if (op.op === 'set') await store.set(op.path, op.id, withoutId(op.data), { merge: op.merge })
      else if (op.op === 'update') await store.update(op.path, op.id, withoutId(op.data))
      else if (op.op === 'delete') await store.remove(op.path, op.id)
      else if (op.op === 'setMany') {
        await store.setMany(op.path, op.docs.map((d) => ({ id: d.id, data: withoutId(d.data) })), { merge: op.merge })
      } else await store.removeMany(op.path, op.ids)
    }
  } catch (e) {
    return fromStoreError(e)
  }

  return { ok: true, value: { results: planned.map((p) => ({ id: p.id })) } }
}
