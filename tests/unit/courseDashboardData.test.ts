import { describe, it, expect } from 'vitest'
import { rowsInRange, trendOf, grainFor, departmentStats, statusCounts, prePostAverages, type DashRow } from '@/lib/courses/dashboardData'

const now = new Date('2026-11-05T12:00:00')
const d = (s: string) => new Date(`${s}T10:00:00`)

const rows: DashRow[] = [
  { department: 'Sales', record: { status: 'completed', startedAt: d('2026-11-01'), completedAt: d('2026-11-03'), preTestScore: 40, postTestScore: 80 } },
  { department: 'Sales', record: { status: 'in_progress', startedAt: d('2026-10-20'), preTestScore: 50 } },
  { department: 'Key Account', record: { status: 'failed', startedAt: d('2026-08-01'), preTestScore: 60, postTestScore: 55 } },
  { department: 'Key Account', record: { status: 'not_started' } },
  { department: '', record: { status: 'completed', startedAt: d('2025-11-10'), completedAt: d('2025-11-12') } },
]

describe('rowsInRange', () => {
  it('keeps everyone for "all", and only dated joiners inside a window', () => {
    expect(rowsInRange(rows, 'all', now)).toHaveLength(5)
    expect(rowsInRange(rows, '30d', now)).toHaveLength(2)
    expect(rowsInRange(rows, '90d', now)).toHaveLength(2)
    expect(rowsInRange(rows, '12m', now)).toHaveLength(4)
  })
})

describe('trendOf', () => {
  it('picks day, week or month by how long the range is', () => {
    expect(grainFor(30)).toBe('day')
    expect(grainFor(90)).toBe('week')
    expect(grainFor(365)).toBe('month')
  })

  it('counts starts and finishes per day over 30 days, with empty days as zeros', () => {
    const { grain, points } = trendOf(rowsInRange(rows, '30d', now), '30d', now)
    expect(grain).toBe('day')
    expect(points.length).toBeGreaterThanOrEqual(30)
    expect(points.find((p) => p.date === '2026-11-01')).toMatchObject({ started: 1, completed: 0 })
    expect(points.find((p) => p.date === '2026-11-03')).toMatchObject({ started: 0, completed: 1 })
    expect(points.find((p) => p.date === '2026-10-25')).toMatchObject({ started: 0, completed: 0 })
  })

  it('is empty when nobody has a date', () => {
    expect(trendOf([{ record: { status: 'not_started' } }], 'all', now).points).toEqual([])
  })
})

describe('departments and status', () => {
  it('groups by department, largest first, with before/after means', () => {
    const out = departmentStats(rows)
    // Sales and Key Account tie on two learners, so the name breaks the tie
    expect(out.map((x) => x.department)).toEqual(['Key Account', 'Sales', 'ไม่ระบุแผนก'])
    expect(out.find((x) => x.department === 'Sales')).toMatchObject({ learners: 2, avgPre: 45, avgPost: 80 })
    expect(out.find((x) => x.department === 'Key Account')).toMatchObject({ learners: 2, avgPre: 60, avgPost: 55 })
    expect(out.find((x) => x.department === 'ไม่ระบุแผนก')?.learners).toBe(1)
  })

  it('counts the four states', () => {
    expect(statusCounts(rows)).toEqual({ completed: 2, failed: 1, inProgress: 1, notStarted: 1 })
  })
})

describe('prePostAverages', () => {
  it('averages each, and takes the change only over people with both', () => {
    // pre: 40, 50, 60 → 50; post: 80, 55 → 67.5; both: (80-40)=40, (55-60)=-5 → 17.5
    expect(prePostAverages(rows)).toEqual({ pre: 50, post: 67.5, delta: 17.5, pairs: 2 })
  })

  it('has nothing without scores', () => {
    expect(prePostAverages([{ record: { status: 'not_started' } }])).toEqual({ pre: null, post: null, delta: null, pairs: 0 })
  })
})
