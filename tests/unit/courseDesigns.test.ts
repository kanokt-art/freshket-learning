import { describe, it, expect } from 'vitest'
import { syncCourseDesigns, convertLiveCoursesToDesigns } from '@/lib/server/courseDesigns'

type Doc = Record<string, unknown> & { id: string }

// A tiny in-memory stand-in for the store: query by collection, set with merge.
function fakeStore(data: Record<string, Doc[]>) {
  const writes: Array<{ path: string; id: string; data: Record<string, unknown>; merge?: boolean }> = []
  return {
    writes,
    store: {
      query: async (path: string) => (data[path] ?? []).map((d) => ({ ...d })),
      set: async (path: string, id: string, d: Record<string, unknown>, opts?: { merge?: boolean }) => {
        writes.push({ path, id, data: d, merge: opts?.merge })
        const list = (data[path] ??= [])
        const at = list.findIndex((x) => x.id === id)
        const next = { ...(at >= 0 && opts?.merge !== false ? list[at] : {}), ...d, id } as Doc
        if (at >= 0) list[at] = next
        else list.push(next)
      },
    } as never,
  }
}

const day = (s: string) => new Date(`${s}T00:00:00Z`)

describe('syncCourseDesigns', () => {
  it('publishes a course for the audience of the live design that holds it', async () => {
    const { store, writes } = fakeStore({
      courses: [{ id: 'a', isPublished: false, assignedUserIds: [] }],
      coursePackages: [{ id: 'p1', isPublished: true, courseIds: ['a'], assignedUserIds: ['u1'], assignedDepartments: ['Sales'], startDate: day('2026-11-10') }],
    })
    const { updated } = await syncCourseDesigns(store)
    expect(updated).toEqual(['a'])
    expect(writes[0]).toMatchObject({ path: 'courses', id: 'a', merge: true })
    expect(writes[0].data).toMatchObject({ isPublished: true, assignedUserIds: ['u1'], assignedDepartments: ['Sales'], designManaged: true })
  })

  it('does not write again when nothing changed', async () => {
    const data = {
      courses: [{ id: 'a', isPublished: false }],
      coursePackages: [{ id: 'p1', isPublished: true, courseIds: ['a'], assignedUserIds: ['u1'] }],
    }
    const first = fakeStore(data)
    await syncCourseDesigns(first.store)
    const second = fakeStore(data)
    expect((await syncCourseDesigns(second.store)).updated).toEqual([])
  })

  it('sends a managed course back to a draft when its design is hidden or deleted', async () => {
    const { store, writes } = fakeStore({
      courses: [{ id: 'a', isPublished: true, designManaged: true, assignedUserIds: ['u1'] }],
      coursePackages: [{ id: 'p1', isPublished: false, courseIds: ['a'], assignedUserIds: ['u1'] }],
    })
    await syncCourseDesigns(store)
    expect(writes[0].data).toMatchObject({ isPublished: false, assignedUserIds: [], startDate: null, endDate: null, designManaged: false })
  })

  it('leaves an older course that no design has touched exactly as it is', async () => {
    const { store, writes } = fakeStore({
      courses: [{ id: 'old', isPublished: true, assignedUserIds: ['u9'] }, { id: 'draft', isPublished: false }],
      coursePackages: [],
    })
    expect((await syncCourseDesigns(store)).updated).toEqual([])
    expect(writes).toEqual([])
  })
})

describe('convertLiveCoursesToDesigns', () => {
  const live = { id: 'a', title: 'Product Knowledge', description: 'x', isPublished: true, assignedUserIds: ['u1'], assignedDepartments: ['Sales'], assignedTeamIds: [], targetRoles: ['sale'], startDate: day('2026-11-01') }

  it('wraps each live, unwrapped course in a design with the same audience and dates', async () => {
    const { store, writes } = fakeStore({
      courses: [live, { id: 'draft', isPublished: false, title: 'D' }],
      coursePackages: [],
    })
    let n = 0
    const { converted } = await convertLiveCoursesToDesigns(store, 'admin', () => `pkg-${++n}`)
    expect(converted).toEqual(['a'])
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ path: 'coursePackages', id: 'pkg-1', merge: false })
    expect(writes[0].data).toMatchObject({
      title: 'Product Knowledge', courseIds: ['a'], isPublished: true, sequential: false, createdBy: 'admin',
      assignedUserIds: ['u1'], assignedDepartments: ['Sales'], targetRoles: ['sale'],
    })
  })

  it('skips a course already held by a design or already managed, so a second run does nothing', async () => {
    const data = {
      courses: [live, { ...live, id: 'b', designManaged: true }, { ...live, id: 'c' }],
      coursePackages: [{ id: 'p', courseIds: ['c'], isPublished: true }],
    }
    const { store } = fakeStore(data)
    let n = 0
    expect((await convertLiveCoursesToDesigns(store, 'admin', () => `pkg-${++n}`)).converted).toEqual(['a'])
    expect((await convertLiveCoursesToDesigns(store, 'admin', () => `pkg-${++n}`)).converted).toEqual([])
  })
})
