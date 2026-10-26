// The browser's side of /api/data.
//
// Three calls — query, get, write — that carry a request to the server and hand
// back documents shaped as the app has always had them: `id` plus fields, with
// dates as Date. JSON cannot carry a date, so the server says which fields hold
// one (`dateFields`) and they are revived here, in one place, rather than every
// screen guessing.
//
// A successful write tells the rest of the app (see invalidation.ts) so live
// queries read again without waiting for their next poll.

import { authedFetch } from '@/lib/api/authedFetch'
import { invalidate } from './invalidation'

export interface Doc {
  id: string
  [field: string]: unknown
}

export interface Constraint {
  type: 'where' | 'orderBy' | 'limit'
  field?: string
  op?: string
  value?: unknown
  direction?: 'asc' | 'desc'
  count?: number
}

export type WriteOp =
  | { op: 'set'; path: string; id: string; data: Record<string, unknown>; merge?: boolean }
  | { op: 'update'; path: string; id: string; data: Record<string, unknown> }
  | { op: 'delete'; path: string; id: string }
  | { op: 'setMany'; path: string; docs: Array<{ id: string; data: Record<string, unknown> }>; merge?: boolean }
  | { op: 'deleteMany'; path: string; ids: string[] }

/** The server refused or could not do it. `status` is the HTTP status. */
export class DataError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'DataError'
    this.status = status
  }
}

async function call<T>(route: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await authedFetch(`/api/data/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch itself failed: no network, not a server answer.
    throw new DataError(0, 'เครือข่ายขัดข้อง — กรุณาลองใหม่')
  }
  let json: unknown = null
  try { json = await res.json() } catch { /* an error page, not JSON */ }
  if (!res.ok) {
    const message = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new DataError(res.status, message)
  }
  return json as T
}

function revive(doc: Doc, dateFields: string[]): Doc {
  const out: Doc = { ...doc }
  for (const f of dateFields) {
    const v = out[f]
    if (typeof v !== 'string') continue
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) out[f] = d
  }
  return out
}

/** Every document in `path` matching the constraints. */
export async function queryDocs(path: string, constraints: Constraint[] = []): Promise<Doc[]> {
  const { docs, dateFields } = await call<{ docs: Doc[]; dateFields: string[] }>(
    'query', constraints.length ? { path, constraints } : { path },
  )
  return docs.map((d) => revive(d, dateFields))
}

/** One document, or null when there is none. */
export async function getDocument(path: string, id: string): Promise<Doc | null> {
  const { doc, dateFields } = await call<{ doc: Doc | null; dateFields: string[] }>('get', { path, id })
  return doc ? revive(doc, dateFields) : null
}

/** Carry out writes in order. Returns the id each document was written under. */
export async function writeOps(ops: WriteOp[]): Promise<Array<{ id: string }>> {
  try {
    const { results } = await call<{ results: Array<{ id: string }> }>('write', { ops })
    return results
  } finally {
    // Also on failure: a request that stopped part-way (writes are not one
    // transaction) leaves earlier documents changed, and the screen should show
    // what is really there.
    for (const path of Array.from(new Set(ops.map((o) => o.path)))) invalidate(path)
  }
}
