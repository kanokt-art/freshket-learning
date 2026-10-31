import { describe, it, expect } from 'vitest'
import { resolveImportRows, type ImportRow } from '@/lib/users/importDedupe'
import type { UserProfile } from '@/types/user'

const row = (uid: string, over: Record<string, unknown> = {}, matched = true): ImportRow => ({
  matched,
  profile: { uid, displayName: `Name ${uid}`, employeeId: `E-${uid}`, ...over } as unknown as UserProfile,
})
const person = (uid: string) => ({ uid, displayName: `Name ${uid}` }) as unknown as UserProfile

describe('resolveImportRows', () => {
  it('names each person once; the later line stands', () => {
    const r = resolveImportRows([row('a', { department: 'Old' }), row('b'), row('a', { department: 'New' })], [])
    expect(r.valid.map((p) => p.uid).sort()).toEqual(['a', 'b'])
    expect(r.valid.find((p) => p.uid === 'a')).toMatchObject({ department: 'New' })
    expect(r.duplicates).toHaveLength(1)
  })

  it('an Active line beats a later Resigned one: someone who came back is working here', () => {
    const r = resolveImportRows([row('a', { employmentStatus: 'Active' }), row('a', { employmentStatus: 'Resigned' })], [])
    expect(r.valid[0]).toMatchObject({ employmentStatus: 'Active' })
    expect(r.hidden).toBe(0)
    expect(r.duplicates[0]).toContain('Active')
  })

  it('a later Active line replaces an earlier Resigned one', () => {
    const r = resolveImportRows([row('a', { employmentStatus: 'Resigned' }), row('a', { employmentStatus: 'Active' })], [])
    expect(r.valid[0]).toMatchObject({ employmentStatus: 'Active' })
  })

  it('never marks as dropped out someone the file lists', () => {
    const r = resolveImportRows([row('a')], [person('a'), person('gone')])
    expect(r.missing.map((p) => p.uid)).toEqual(['gone'])
  })

  it('counts updates and hidden from the lines that stand', () => {
    const r = resolveImportRows([
      row('a', {}, true), row('b', {}, false), row('c', { employmentStatus: 'Resigned' }, true), row('a', {}, true),
    ], [])
    expect(r.updated.sort()).toEqual(['Name a', 'Name c'])
    expect(r.hidden).toBe(1)
  })
})
