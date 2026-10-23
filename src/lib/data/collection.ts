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
// This is the only module that knows those operations touch Firestore. Callers
// name a collection and pass a record; they never see `doc()`, `setDoc()`, a
// batch, or a Timestamp. That is what lets the storage behind this file be
// swapped without reopening fourteen page components.
//
// Reads still come from useFirestore's live-listener hooks — those are a
// separate seam with a separate problem (subscriptions, not mutations).

import { getDemoMode } from '@/lib/demo/demoMode'

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

  const fb = await import('@/lib/firebase/client')
  const db = fb.getClientFirestore()
  const id = givenId || fb.doc(fb.collection(db, collectionName)).id

  await fb.setDoc(
    fb.doc(db, collectionName, id),
    stripUndefined(fields),
    opts.replace ? {} : { merge: true },
  )
  return { id, persisted: true }
}

/** Delete one document. Callers own the confirmation prompt. */
export async function remove(collectionName: string, id: string): Promise<WriteResult> {
  if (DEMO_MODE) return { id, persisted: false }
  const fb = await import('@/lib/firebase/client')
  await fb.deleteDoc(fb.doc(fb.getClientFirestore(), collectionName, id))
  return { id, persisted: true }
}

/** Patch named fields on an existing document, leaving the rest untouched. */
export async function patch(
  collectionName: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<WriteResult> {
  if (DEMO_MODE) return { id, persisted: false }
  const fb = await import('@/lib/firebase/client')
  await fb.setDoc(
    fb.doc(fb.getClientFirestore(), collectionName, id),
    stripUndefined(fields),
    { merge: true },
  )
  return { id, persisted: true }
}

/**
 * Write many documents at once, for the "import the built-in defaults" action
 * each authoring surface offers.
 *
 * Chunked under the backing store's per-batch write cap so a caller never has
 * to know there is one — the one surface that did know (assessment score
 * import) had the number 450 hard-coded in a page component.
 */
export async function saveMany(collectionName: string, records: Doc[]): Promise<number> {
  if (DEMO_MODE || records.length === 0) return 0

  const fb = await import('@/lib/firebase/client')
  const db = fb.getClientFirestore()
  const CHUNK = 450 // the store caps a batch at 500; leave headroom

  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = fb.writeBatch(db)
    for (const { id, ...fields } of records.slice(i, i + CHUNK)) {
      batch.set(fb.doc(db, collectionName, id), stripUndefined(fields))
    }
    await batch.commit()
  }
  return records.length
}

/**
 * The store rejects `undefined` outright, so callers used to hand-roll an
 * omit-undefined pass (three of them did; the ones that forgot threw at
 * runtime on an untouched optional field). `null` is left alone — it is the
 * only way to actively blank a stored value, and the two are not
 * interchangeable here.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as Partial<T>
}
