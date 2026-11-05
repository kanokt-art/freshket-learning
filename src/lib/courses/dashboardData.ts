// The numbers behind a course's dashboard, from its learners and their training records. Pure, so they are
// tested without a screen. Quiz attempts (time taken, questions missed) come separately from the server.

export interface DashRecord {
  status?: 'not_started' | 'in_progress' | 'completed' | 'failed'
  startedAt?: Date | string
  completedAt?: Date | string
  updatedAt?: Date | string
  preTestScore?: number
  postTestScore?: number
}

export interface DashRow {
  department?: string
  record?: DashRecord
}

export type RangeId = '30d' | '90d' | '12m' | 'all'

export const RANGES: { id: RangeId; label: string; days: number | null }[] = [
  { id: '30d', label: '30 วัน', days: 30 },
  { id: '90d', label: '90 วัน', days: 90 },
  { id: '12m', label: '12 เดือน', days: 365 },
  { id: 'all', label: 'ทั้งหมด', days: null },
]

const DAY = 86_400_000

function toDate(v: unknown): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v as string)
  return isNaN(d.getTime()) ? null : d
}

/** When this learner joined the course, as far as the record says. */
export function joinedAt(r: DashRecord | undefined): Date | null {
  return toDate(r?.startedAt) ?? toDate(r?.completedAt)
}

/** The start of the range, or null for "all". */
export function rangeStart(range: RangeId, now = new Date()): Date | null {
  const days = RANGES.find((r) => r.id === range)?.days ?? null
  return days === null ? null : new Date(now.getTime() - days * DAY)
}

/** Learners who joined the course in the range. With "all", everyone is kept, dated or not. */
export function rowsInRange<T extends DashRow>(rows: readonly T[], range: RangeId, now = new Date()): T[] {
  const from = rangeStart(range, now)
  if (!from) return [...rows]
  return rows.filter((r) => {
    const j = joinedAt(r.record)
    return !!j && j.getTime() >= from.getTime()
  })
}

export type Grain = 'day' | 'week' | 'month'

export function grainFor(spanDays: number): Grain {
  return spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'
}

function bucketStart(d: Date, grain: Grain): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (grain === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  if (grain === 'month') x.setDate(1)
  return x
}

function nextBucket(d: Date, grain: Grain): Date {
  const x = new Date(d)
  if (grain === 'day') x.setDate(x.getDate() + 1)
  else if (grain === 'week') x.setDate(x.getDate() + 7)
  else x.setMonth(x.getMonth() + 1)
  return x
}

export interface TrendPoint {
  /** The first day of the bucket, as an ISO date. */
  date: string
  started: number
  completed: number
}

/**
 * Learners starting and finishing the course over time, one point per day, week or month (by how long the
 * range is), with empty stretches kept as zeros so the axis stays even.
 */
export function trendOf(rows: readonly DashRow[], range: RangeId, now = new Date()): { grain: Grain; points: TrendPoint[] } {
  const starts = rows.map((r) => joinedAt(r.record)).filter((d): d is Date => !!d)
  const ends = rows.map((r) => (r.record?.status === 'completed' ? toDate(r.record.completedAt) : null)).filter((d): d is Date => !!d)
  const all = [...starts, ...ends]
  if (all.length === 0) return { grain: 'month', points: [] }

  const from = rangeStart(range, now) ?? new Date(Math.min(...all.map((d) => d.getTime())))
  const spanDays = Math.max(1, Math.round((now.getTime() - from.getTime()) / DAY))
  const grain = grainFor(spanDays)

  const counts = new Map<number, TrendPoint>()
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (let b = bucketStart(from, grain); b.getTime() <= now.getTime(); b = nextBucket(b, grain)) {
    counts.set(b.getTime(), { date: iso(b), started: 0, completed: 0 })
  }
  const add = (d: Date, key: 'started' | 'completed') => {
    const p = counts.get(bucketStart(d, grain).getTime())
    if (p) p[key]++
  }
  starts.forEach((d) => add(d, 'started'))
  ends.forEach((d) => add(d, 'completed'))
  return { grain, points: Array.from(counts.values()) }
}

export interface DepartmentStat {
  department: string
  learners: number
  avgPre: number | null
  avgPost: number | null
}

const mean = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

/** Learners per department, largest first, with each department's mean before and after score. */
export function departmentStats(rows: readonly DashRow[]): DepartmentStat[] {
  const by = new Map<string, DashRow[]>()
  for (const r of rows) {
    const k = (r.department ?? '').trim() || 'ไม่ระบุแผนก'
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return Array.from(by.entries())
    .map(([department, list]) => ({
      department,
      learners: list.length,
      avgPre: mean(list.map((r) => r.record?.preTestScore).filter((v): v is number => typeof v === 'number')),
      avgPost: mean(list.map((r) => r.record?.postTestScore).filter((v): v is number => typeof v === 'number')),
    }))
    .sort((a, b) => b.learners - a.learners || a.department.localeCompare(b.department))
}

export interface StatusCounts { completed: number; failed: number; inProgress: number; notStarted: number }

export function statusCounts(rows: readonly DashRow[]): StatusCounts {
  const c: StatusCounts = { completed: 0, failed: 0, inProgress: 0, notStarted: 0 }
  for (const r of rows) {
    const s = r.record?.status ?? 'not_started'
    if (s === 'completed') c.completed++
    else if (s === 'failed') c.failed++
    else if (s === 'in_progress') c.inProgress++
    else c.notStarted++
  }
  return c
}

/** Mean before and after score over everyone who has one. */
export function prePostAverages(rows: readonly DashRow[]): { pre: number | null; post: number | null; delta: number | null; pairs: number } {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const pre = mean(rows.map((r) => r.record?.preTestScore).filter(num))
  const post = mean(rows.map((r) => r.record?.postTestScore).filter(num))
  // The change is only honest over people who have both scores.
  const both = rows.filter((r) => num(r.record?.preTestScore) && num(r.record?.postTestScore))
  const gain = mean(both.map((r) => (r.record!.postTestScore as number) - (r.record!.preTestScore as number)))
  return { pre, post, delta: gain, pairs: both.length }
}
