// One learner's standing in a whole Course Design, folded from their records in its courses. The dashboard and the
// summary read a package the way they read a course: a learner has a status, a start, a finish and before/after
// scores. For a package those are worked out here from the per-course records.

export interface RecordLike {
  status?: 'not_started' | 'in_progress' | 'completed' | 'failed'
  startedAt?: Date | string
  completedAt?: Date | string
  preTestScore?: number
  postTestScore?: number
}

export interface PackageStanding {
  status: 'not_started' | 'in_progress' | 'completed'
  /** The first day they started any course of the package. */
  startedAt?: Date
  /** The day they finished the last one — only once every course is finished. */
  completedAt?: Date
  /** Mean of the before / after scores they have in the package's courses. */
  preTestScore?: number
  postTestScore?: number
  /** Courses finished, of `courseCount`. */
  done: number
}

const toDate = (v: Date | string | undefined): Date | undefined => {
  if (!v) return undefined
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}
const mean = (xs: number[]): number | undefined =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : undefined

/** Fold a learner's records in a package's courses (courseCount of them) into one standing. */
export function packageStanding(records: readonly RecordLike[], courseCount: number): PackageStanding {
  const done = records.filter((r) => r.status === 'completed').length
  const touched = records.filter((r) => r.status && r.status !== 'not_started')
  const status: PackageStanding['status'] =
    courseCount > 0 && done >= courseCount ? 'completed' : touched.length > 0 ? 'in_progress' : 'not_started'

  const starts = records.map((r) => toDate(r.startedAt)).filter((d): d is Date => !!d)
  const ends = records.map((r) => toDate(r.completedAt)).filter((d): d is Date => !!d)
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

  return {
    status,
    startedAt: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : undefined,
    completedAt: status === 'completed' && ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : undefined,
    preTestScore: mean(records.map((r) => r.preTestScore).filter(num)),
    postTestScore: mean(records.map((r) => r.postTestScore).filter(num)),
    done,
  }
}
