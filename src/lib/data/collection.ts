// The write seam for document collections.
//
// Every surface that authors content — tools, knowledge decks, cuisine
// guides, mandatory slides, announcements — had its own copy of the same
// four operations: mint-an-id-or-reuse-one then upsert, delete, flip
// isPublished, and bulk-import the built-in defaults. Each copy opened its
// own dynamic `import('@/lib/firebase/client')`, spelled the error message
// differently, and drifted: one closed its modal before awaiting the write
// (so a failed save looked identical to a successful one), one wrote without
// `merge` where the others merged, one skipped the demo-mode guard.
//
// This is the only module that knows how those operations reach the database
// (the /api/data door, see data/client.ts). Callers name a collection and pass
// a record; they never see a request, a batch, or a timestamp format. That is what lets the storage behind this file be
// swapped without reopening fourteen page components.
//
// Reads still come from useFirestore's live-query hooks — those are a
// separate seam with a separate problem (subscriptions, not mutations).

import { getDemoMode } from '@/lib/demo/demoMode'
import { getDocument, queryDocs, writeOps } from './client'

const DEMO_MODE = getDemoMode()

/** A stored document. `id` is the document id; everything else is content. */
export interface Doc {
  id: string
  [field: string]: unknown
}

export interface WriteResult {
  /** The id written — useful when `save` minted one for a new record. */
  id: string
  /** False when demo mode short-circuited the write. */
  persisted: boolean
}

/**
 * Create or update one document.
 *
 * A record whose `id` is empty gets a fresh id. `id` itself is never written
 * into the document body — it is the key, and storing it twice is how the two
 * copies drift apart.
 *
 * Merges by default, so a partial record patches rather than truncates. Pass
 * `replace: true` for the full-row semantics mandatory slides and cuisine
 * guides rely on, where a removed field must actually disappear.
 *
 * Throws on failure. Callers must await before closing a form — the bug this
 * module exists to stop is a modal that closes on a rejected write.
 */
export async function save(
  collectionName: string,
  record: Doc,
  opts: { replace?: boolean } = {},
): Promise<WriteResult> {
  const { id: givenId, ...fields } = record
  if (DEMO_MODE) return { id: givenId || 'demo', persisted: false }

  // An empty id asks the server to mint one; it answers with the id it used.
  const [{ id }] = await writeOps([{
    op: 'set', path: collectionName, id: givenId ?? '', data: stripUndefined(fields), merge: !opts.replace,
  }])
  return { id, persisted: true }
}

/** Delete one document. Callers own the confirmation prompt. */
export async function remove(collectionName: string, id: string): Promise<WriteResult> {
  if (DEMO_MODE) return { id, persisted: false }
  await writeOps([{ op: 'delete', path: collectionName, id }])
  return { id, persisted: true }
}

/**
 * Patch named fields on an existing document, leaving the rest untouched.
 *
 * By default this upserts: a missing document is created from the patch. Pass
 * `mustExist: true` to reject instead — the member-reassignment path needs
 * that, because a stale uid silently created an empty ghost user rather than
 * surfacing the fact that the member had been merged away.
 */
export async function patch(
  collectionName: string,
  id: string,
  fields: Record<string, unknown>,
  opts: { mustExist?: boolean } = {},
): Promise<WriteResult> {
  if (DEMO_MODE) return { id, persisted: false }
  const data = stripUndefined(fields)
  await writeOps([opts.mustExist
    ? { op: 'update', path: collectionName, id, data }
    : { op: 'set', path: collectionName, id, data, merge: true }])
  return { id, persisted: true }
}

/**
 * Write many documents at once, for the "import the built-in defaults" action
 * each authoring surface offers.
 *
 * Chunked under the server's per-request cap so a caller never has to know
 * there is one — the one surface that did know (assessment score import) had
 * the number 450 hard-coded in a page component.
 */
export async function saveMany(
  collectionName: string,
  records: Doc[],
  opts: { merge?: boolean } = {},
): Promise<number> {
  if (DEMO_MODE || records.length === 0) return 0

  for (let i = 0; i < records.length; i += CHUNK) {
    await writeOps([{
      op: 'setMany', path: collectionName, merge: !!opts.merge,
      docs: records.slice(i, i + CHUNK).map(({ id, ...fields }) => ({ id, data: stripUndefined(fields) })),
    }])
  }
  return records.length
}

/**
 * Delete many documents at once, chunked the same way `saveMany` is — the bulk
 * team delete used to spell out its own batch loop to do this.
 */
export async function removeMany(collectionName: string, ids: string[]): Promise<number> {
  if (DEMO_MODE || ids.length === 0) return 0

  for (let i = 0; i < ids.length; i += CHUNK) {
    await writeOps([{ op: 'deleteMany', path: collectionName, ids: ids.slice(i, i + CHUNK) }])
  }
  return ids.length
}

/** Documents per request. The server judges every one before writing any, and caps a request at 2,000. */
const CHUNK = 1000

/**
 * Fetch one document, or null when it does not exist.
 *
 * This is the one-shot read, not the live subscription — the handful of
 * callers that need to look at stored state before writing it (a first-time
 * timestamp that must not be overwritten, a role check at sign-in). Screens
 * that display data use the listener hooks instead.
 */
export async function get<T = Doc>(collectionName: string, id: string): Promise<T | null> {
  if (DEMO_MODE) return null
  return (await getDocument(collectionName, id)) as T | null
}

/** Every document whose `field` equals `value`. */
export async function findBy<T = Doc>(
  collectionName: string,
  field: string,
  value: unknown,
): Promise<T[]> {
  if (DEMO_MODE) return []
  return (await queryDocs(collectionName, [{ type: 'where', field, op: '==', value }])) as T[]
}

/**
 * Leave out fields that are `undefined`, so an untouched optional field is not
 * sent at all (JSON would drop it anyway, but `merge` semantics should not
 * depend on that). `null` is kept — it is the only way to actively blank a
 * stored value, and the two are not interchangeable here.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as Partial<T>
}
