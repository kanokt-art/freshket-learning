import { describe, it, expect } from 'vitest'
import { refreshUserStats, refreshManyUserStats } from '@/lib/server/userStats'

// The summary is read by every dashboard, so what matters is that it is built
// from the right person's records and replaces the old numbers rather than
// adding to them.

function fakeStore(records: Array<Record<string, unknown>>) {
  const queries: unknown[] = []
  const writes: Array<{ path: string; id: string; data: Record<string, unknown>; merge?: boolean }> = []
  return {
    queries, writes,
    store: {
      query: async (path: string, q: unknown) => { queries.push([path, q]); return records.map((r, i) => ({ id: `r${i}`, ...r })) },
      set: async (path: string, id: string, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        writes.push({ path, id, data, merge: opts?.merge })
      },
    },
  }
}

describe('refreshUserStats', () => {
  it("asks for that person's records only", async () => {
    const { store, queries } = fakeStore([])
    await refreshUserStats(store, 'csv-E1')
    expect(queries).toEqual([['trainingRecords', { where: [{ field: 'userId', op: '==', value: 'csv-E1' }] }]])
  })

  it('writes the folded numbers under that person, as a merge', async () => {
    const { store, writes } = fakeStore([
      { status: 'completed', score: 80 },
      { status: 'completed', score: 90 },
      { status: 'in_progress' },
    ])
    await refreshUserStats(store, 'csv-E1')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      path: 'userStats', id: 'csv-E1', merge: true,
      data: { uid: 'csv-E1', totalCount: 3, completedCount: 2, scoreSum: 170, scoredCount: 2 },
    })
    expect(writes[0].data.updatedAt).toBeInstanceOf(Date)
  })

  it('treats a record with no status as not started, and no score as unscored', async () => {
    const { store, writes } = fakeStore([{}, { status: 'completed', score: null }])
    await refreshUserStats(store, 'u')
    expect(writes[0].data).toMatchObject({ totalCount: 2, completedCount: 1, scoreSum: 0, scoredCount: 0 })
  })

  it('writes zeros for someone with no records, so a stale summary does not outlive them', async () => {
    const { store, writes } = fakeStore([])
    await refreshUserStats(store, 'u')
    expect(writes[0].data).toMatchObject({ totalCount: 0, completedCount: 0, scoreSum: 0, scoredCount: 0 })
  })
})

describe('refreshManyUserStats', () => {
  function manyStore(records: Array<Record<string, unknown>>) {
    const queries: Array<{ path: string; q: any }> = []
    const writes: Array<{ path: string; docs: Array<{ id: string; data: Record<string, any> }>; merge?: boolean }> = []
    return {
      queries, writes,
      store: {
        query: async (path: string, q: any) => {
          queries.push({ path, q })
          const wanted = new Set<string>(q.where[0].value)
          return records.filter((r) => wanted.has(String(r.userId))).map((r, i) => ({ id: `r${i}`, ...r }))
        },
        setMany: async (path: string, docs: any, opts?: { merge?: boolean }) => { writes.push({ path, docs, merge: opts?.merge }) },
      },
    }
  }

  it('gives each person their own numbers from one shared read', async () => {
    const { store, queries, writes } = manyStore([
      { userId: 'a', status: 'completed', score: 80 },
      { userId: 'a', status: 'in_progress' },
      { userId: 'b', status: 'completed', score: 60 },
    ])
    await refreshManyUserStats(store, ['a', 'b'])
    expect(queries).toHaveLength(1)
    const byId = Object.fromEntries(writes[0].docs.map((d) => [d.id, d.data]))
    expect(byId.a).toMatchObject({ uid: 'a', totalCount: 2, completedCount: 1, scoreSum: 80 })
    expect(byId.b).toMatchObject({ uid: 'b', totalCount: 1, completedCount: 1, scoreSum: 60 })
    expect(writes[0]).toMatchObject({ path: 'userStats', merge: true })
  })

  it('writes zeros for someone who has no records', async () => {
    const { store, writes } = manyStore([{ userId: 'a', status: 'completed', score: 80 }])
    await refreshManyUserStats(store, ['a', 'nobody'])
    const nobody = writes[0].docs.find((d) => d.id === 'nobody')!
    expect(nobody.data).toMatchObject({ totalCount: 0, completedCount: 0, scoreSum: 0, scoredCount: 0 })
  })

  it('counts a person listed twice once', async () => {
    const { store, writes } = manyStore([{ userId: 'a', status: 'completed', score: 80 }])
    await refreshManyUserStats(store, ['a', 'a'])
    expect(writes[0].docs).toHaveLength(1)
    expect(writes[0].docs[0].data.totalCount).toBe(1)
  })

  it('reads in chunks so a big import does not build an enormous filter', async () => {
    const uids = Array.from({ length: 450 }, (_, i) => `u${i}`)
    const { store, queries } = manyStore([])
    await refreshManyUserStats(store, uids)
    expect(queries.map((q) => q.q.where[0].value.length)).toEqual([200, 200, 50])
  })

  it('does nothing for an empty list', async () => {
    const { store, queries, writes } = manyStore([])
    await refreshManyUserStats(store, [])
    expect(queries).toHaveLength(0)
    expect(writes).toHaveLength(0)
  })

  it('does not credit one person with another\'s records', async () => {
    const { store, writes } = manyStore([{ userId: 'b', status: 'completed', score: 99 }])
    await refreshManyUserStats(store, ['a', 'b'])
    const a = writes[0].docs.find((d) => d.id === 'a')!
    expect(a.data.totalCount).toBe(0)
  })
})
