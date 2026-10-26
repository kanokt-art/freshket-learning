import { describe, it, expect, vi, beforeEach } from 'vitest'

// The write seam — every mutation in the app goes through this module, and
// nothing covered it.
//
// WHAT THESE TESTS ARE FOR. The seam's job is to turn a plain record into the
// right call on the backing store, and almost every bug it can have is a wrong
// ARGUMENT rather than a thrown error: a merge where the caller needed a
// replace, an `undefined` that silently deletes nothing, a `null` dropped so a
// field can never be cleared, a batch that exceeds the store's write cap. None
// of that shows up as a failure at the call site — it shows up as data that is
// quietly wrong, later. So these tests stub the Firebase client and assert on
// the calls the seam makes: the id it chose, the options it passed, how many
// batches it opened.
//
// They deliberately do NOT re-describe the implementation. Each one names a
// behaviour a caller depends on, and several correspond to bugs the seam was
// written to stop (see the comments in src/lib/data/collection.ts).

// ── Firebase client stub ────────────────────────────────────────────────────
// Mirrors the subset of the SDK the seam re-exports. doc()/collection() return
// descriptive markers rather than real refs, so assertions read as the path
// that was written to.

type Ref = { path: string }
type Snap = { exists: () => boolean; id: string; data: () => Record<string, unknown> }

const setDoc = vi.fn<(ref: Ref, data: Record<string, unknown>, options?: unknown) => Promise<void>>(
  async () => undefined)
const updateDoc = vi.fn<(ref: Ref, data: Record<string, unknown>) => Promise<void>>(
  async () => undefined)
const deleteDoc = vi.fn<(ref: Ref) => Promise<void>>(async () => undefined)
const getDoc = vi.fn<(ref: Ref) => Promise<Snap>>(
  async () => ({ exists: () => false, id: 'x', data: () => ({}) }))
const getDocs = vi.fn<(q: unknown) => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>>(
  async () => ({ docs: [] }))

/** One writeBatch() call — records what was staged before commit. */
interface FakeBatch {
  set: ReturnType<typeof vi.fn<(ref: Ref, data: Record<string, unknown>, options?: unknown) => void>>
  delete: ReturnType<typeof vi.fn<(ref: Ref) => void>>
  commit: ReturnType<typeof vi.fn<() => Promise<void>>>
}
let batches: FakeBatch[] = []

function newBatch(): FakeBatch {
  const b: FakeBatch = {
    set: vi.fn<(ref: Ref, data: Record<string, unknown>, options?: unknown) => void>(),
    delete: vi.fn<(ref: Ref) => void>(),
    commit: vi.fn<() => Promise<void>>(async () => undefined),
  }
  batches.push(b)
  return b
}

let mintedIdCounter = 0

vi.mock('@/lib/firebase/client', () => ({
  getClientFirestore: () => ({ __db: true }),
  // doc(db, collection, id) → a ref marker; doc(collectionRef) → a minted id,
  // which is how the real SDK generates one for a new document.
  doc: (...args: unknown[]) => {
    if (args.length === 3) return { path: `${args[1]}/${args[2]}` }
    return { id: `minted-${++mintedIdCounter}` }
  },
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query: (...args: unknown[]) => ({ __query: args }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  writeBatch: () => newBatch(),
}))

// DEMO_MODE is read once at module load, so it is pinned false here: the
// demo short-circuit is a separate concern, covered in its own block below by
// re-importing with the flag flipped.
vi.mock('@/lib/demo/demoMode', () => ({ getDemoMode: () => false }))

import { save, patch, remove, saveMany, removeMany, get, findBy } from '@/lib/data/collection'

beforeEach(() => {
  setDoc.mockClear()
  updateDoc.mockClear()
  deleteDoc.mockClear()
  getDoc.mockClear()
  getDocs.mockClear()
  batches = []
  mintedIdCounter = 0
})

/** Arguments of the single setDoc call made by the test. */
function lastSetDoc() {
  expect(setDoc).toHaveBeenCalledTimes(1)
  const [ref, data, options] = setDoc.mock.calls[0]
  return { path: ref.path, data, options }
}

describe('save', () => {
  it('writes to the given collection and id', async () => {
    await save('courses', { id: 'c1', title: 'A' })
    expect(lastSetDoc().path).toBe('courses/c1')
  })

  it('never writes `id` into the document body', async () => {
    // The id is the key. Storing it twice is how the two copies drift apart.
    await save('courses', { id: 'c1', title: 'A' })
    expect(lastSetDoc().data).toEqual({ title: 'A' })
  })

  it('mints an id when the record has none, and returns it', async () => {
    // Callers rely on the returned id — the mandatory-reading publish flow
    // notifies against it straight after saving.
    const res = await save('shadowRecords', { id: '', note: 'x' })
    expect(res.id).toBe('minted-1')
    expect(res.persisted).toBe(true)
    expect(lastSetDoc().path).toBe('shadowRecords/minted-1')
  })

  it('merges by default, so a partial record patches rather than truncates', async () => {
    await save('courses', { id: 'c1', title: 'A' })
    expect(lastSetDoc().options).toEqual({ merge: true })
  })

  it('replaces the whole document when asked', async () => {
    // Teams, mandatory slides and cuisine guides need a removed field to
    // actually disappear; a merge would leave it behind.
    await save('teams', { id: 't1', memberIds: ['a'] }, { replace: true })
    expect(lastSetDoc().options).toEqual({})
  })

  it('propagates a rejected write instead of swallowing it', async () => {
    // The bug this module exists to stop is a modal that closes on a failed
    // save, so the promise must reject and let the caller keep the form open.
    setDoc.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(save('courses', { id: 'c1' })).rejects.toThrow('permission-denied')
  })
})

describe('undefined vs null', () => {
  it('drops undefined fields, which the store rejects outright', async () => {
    await save('users', { id: 'u1', name: 'A', nickname: undefined })
    expect(lastSetDoc().data).toEqual({ name: 'A' })
  })

  it('KEEPS null — it is the only way to blank a stored value', async () => {
    // Not interchangeable with undefined: dropping null here would make
    // "clear this field" silently impossible, which is how a cleared teamId
    // used to come back after a refresh.
    await save('users', { id: 'u1', teamId: null })
    expect(lastSetDoc().data).toEqual({ teamId: null })
  })

  it('keeps other falsy values', async () => {
    // 0, '' and false are data, not absence.
    await save('courses', { id: 'c1', durationMinutes: 0, description: '', isPublished: false })
    expect(lastSetDoc().data).toEqual({ durationMinutes: 0, description: '', isPublished: false })
  })
})

describe('patch', () => {
  it('upserts through a merge by default', async () => {
    await patch('appConfig', 'moduleAccess', { lms: true })
    const { path, data, options } = lastSetDoc()
    expect(path).toBe('appConfig/moduleAccess')
    expect(data).toEqual({ lms: true })
    expect(options).toEqual({ merge: true })
  })

  it('uses an update that fails on a missing doc when mustExist is set', async () => {
    // A plain upsert here created empty ghost users when a uid had been merged
    // away by dedup. This must reject instead, so the UI can say so.
    await patch('users', 'stale-uid', { teamId: 't1' }, { mustExist: true })
    expect(setDoc).not.toHaveBeenCalled()
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const [ref, data] = updateDoc.mock.calls[0]
    expect(ref.path).toBe('users/stale-uid')
    expect(data).toEqual({ teamId: 't1' })
  })

  it('strips undefined on the mustExist path too', async () => {
    await patch('users', 'u1', { teamId: undefined, role: 'sale' }, { mustExist: true })
    expect(updateDoc.mock.calls[0][1]).toEqual({ role: 'sale' })
  })
})

describe('remove', () => {
  it('deletes the named document', async () => {
    const res = await remove('teams', 't1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
    expect(deleteDoc.mock.calls[0][0].path).toBe('teams/t1')
    expect(res).toEqual({ id: 't1', persisted: true })
  })
})

describe('saveMany', () => {
  it('writes every record in one batch when it fits', async () => {
    await saveMany('tools', [{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(batches).toHaveLength(1)
    expect(batches[0].set).toHaveBeenCalledTimes(3)
    expect(batches[0].commit).toHaveBeenCalledTimes(1)
  })

  it('chunks under the store cap of 500 writes per batch', async () => {
    // The whole point of owning this here: the assessment-score import used to
    // carry the number 450 in a page component. 901 records → 450 + 450 + 1.
    const records = Array.from({ length: 901 }, (_, i) => ({ id: `r${i}` }))
    await saveMany('assessmentScores', records)
    expect(batches).toHaveLength(3)
    expect(batches[0].set).toHaveBeenCalledTimes(450)
    expect(batches[1].set).toHaveBeenCalledTimes(450)
    expect(batches[2].set).toHaveBeenCalledTimes(1)
    for (const b of batches) expect(b.commit).toHaveBeenCalledTimes(1)
  })

  it('opens no batch at all for an empty list', async () => {
    expect(await saveMany('tools', [])).toBe(0)
    expect(batches).toHaveLength(0)
  })

  it('overwrites by default', async () => {
    // Re-importing a score file must replace the row, not merge into it.
    await saveMany('assessmentScores', [{ id: 'a', pct: 80 }])
    expect(batches[0].set.mock.calls[0][2]).toEqual({})
  })

  it('merges when asked, for the user upsert', async () => {
    // The CSV import patches existing employees rather than replacing them.
    await saveMany('users', [{ id: 'u1', department: 'Sales' }], { merge: true })
    expect(batches[0].set.mock.calls[0][2]).toEqual({ merge: true })
  })

  it('keeps id out of the body and strips undefined, same as save', async () => {
    await saveMany('users', [{ id: 'u1', name: 'A', nickname: undefined }])
    expect(batches[0].set.mock.calls[0][1]).toEqual({ name: 'A' })
  })

  it('returns how many records it wrote', async () => {
    expect(await saveMany('tools', [{ id: 'a' }, { id: 'b' }])).toBe(2)
  })
})

describe('removeMany', () => {
  it('chunks deletes the same way saveMany chunks writes', async () => {
    const ids = Array.from({ length: 901 }, (_, i) => `t${i}`)
    expect(await removeMany('teams', ids)).toBe(901)
    expect(batches).toHaveLength(3)
    expect(batches[0].delete).toHaveBeenCalledTimes(450)
    expect(batches[2].delete).toHaveBeenCalledTimes(1)
  })

  it('opens no batch for an empty list', async () => {
    expect(await removeMany('teams', [])).toBe(0)
    expect(batches).toHaveLength(0)
  })
})

describe('get', () => {
  it('returns null when the document does not exist', async () => {
    // progress.ts branches on exactly this to decide whether a startedAt stamp
    // is being set for the first time.
    expect(await get('trainingRecords', 'nope')).toBeNull()
  })

  it('returns the document with its id folded in', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'u1_c1',
      data: () => ({ status: 'completed' }),
    })
    expect(await get('trainingRecords', 'u1_c1')).toEqual({ id: 'u1_c1', status: 'completed' })
  })
})

describe('findBy', () => {
  it('returns every matching document with its id', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'r1', data: () => ({ userId: 'u1' }) },
        { id: 'r2', data: () => ({ userId: 'u1' }) },
      ],
    })
    expect(await findBy('trainingRecords', 'userId', 'u1')).toEqual([
      { id: 'r1', userId: 'u1' },
      { id: 'r2', userId: 'u1' },
    ])
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

    // Nothing reached the store.
    expect(setDoc).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
    expect(deleteDoc).not.toHaveBeenCalled()
    expect(batches).toHaveLength(0)

    vi.doUnmock('@/lib/demo/demoMode')
    vi.resetModules()
  })
})
