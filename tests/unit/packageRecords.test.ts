import { describe, it, expect } from 'vitest'
import { packageStanding } from '@/lib/courses/packageRecords'

const day = (s: string) => new Date(`${s}T10:00:00Z`)

describe('packageStanding', () => {
  it('is not started without records, or with only not-started ones', () => {
    expect(packageStanding([], 3)).toMatchObject({ status: 'not_started', done: 0 })
    expect(packageStanding([{ status: 'not_started' }], 3).status).toBe('not_started')
  })

  it('is in progress once any course is touched and not all are finished', () => {
    const s = packageStanding([
      { status: 'completed', startedAt: day('2026-11-03'), completedAt: day('2026-11-04') },
      { status: 'in_progress', startedAt: day('2026-11-01') },
    ], 3)
    expect(s).toMatchObject({ status: 'in_progress', done: 1 })
    expect(s.startedAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z')
    expect(s.completedAt).toBeUndefined()
  })

  it('is completed when every course is finished, finishing on the last day', () => {
    const s = packageStanding([
      { status: 'completed', startedAt: day('2026-11-01'), completedAt: day('2026-11-02') },
      { status: 'completed', startedAt: day('2026-11-03'), completedAt: day('2026-11-09') },
    ], 2)
    expect(s.status).toBe('completed')
    expect(s.completedAt?.toISOString()).toBe('2026-11-09T10:00:00.000Z')
  })

  it('a package with a course still missing a record is not complete', () => {
    expect(packageStanding([{ status: 'completed' }], 2).status).toBe('in_progress')
  })

  it('averages the before and after scores that exist', () => {
    const s = packageStanding([
      { status: 'completed', preTestScore: 40, postTestScore: 80 },
      { status: 'completed', preTestScore: 60 },
      { status: 'in_progress' },
    ], 3)
    expect(s.preTestScore).toBe(50)
    expect(s.postTestScore).toBe(80)
  })
})
