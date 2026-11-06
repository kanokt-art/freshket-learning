import { isInCourseTarget, type AudienceCourse, type AudienceUser } from '@/lib/courses/audience'

// Course Design (a package of courses): the rules for what a learner sees of one and how a package is edited.
// Pure, so it is tested without a screen. A course keeps its own audience and its own training record; the package
// only chooses and orders them.

export type PackageCourseStatus = 'not_started' | 'in_progress' | 'completed' | 'failed'

interface PackageLike {
  isPublished?: boolean
  courseIds?: readonly string[]
  sequential?: boolean
}
type PackageCourse = AudienceCourse & { id: string; isPublished?: boolean }

export interface PackageItem<C extends PackageCourse> {
  course: C
  /** Is this course meant for this learner? A course outside their audience is shown, but not counted or opened. */
  applicable: boolean
  status: PackageCourseStatus
  /** The package is sequential and an earlier course is not finished yet. */
  locked: boolean
}

export interface PackageProgress<C extends PackageCourse> {
  items: PackageItem<C>[]
  /** Courses the learner has to take / has finished. */
  total: number
  done: number
  pct: number
  /** The first course still to do, if any. */
  next: PackageItem<C> | null
}

/**
 * The package as one learner sees it: its courses in order (a deleted or unpublished course is left out), which
 * are theirs, how far they have got, and — for a sequential package — which are still locked.
 */
export function packageProgress<C extends PackageCourse>(
  pkg: PackageLike,
  courses: readonly C[],
  statusOf: (courseId: string) => PackageCourseStatus,
  user: AudienceUser,
  /** An admin looking at the package sees every course as theirs (they are not being enrolled in anything). */
  opts: { allApplicable?: boolean } = {},
): PackageProgress<C> {
  const byId = new Map(courses.map((c) => [c.id, c]))
  const items: PackageItem<C>[] = []
  let earlierUnfinished = false
  for (const id of pkg.courseIds ?? []) {
    const course = byId.get(id)
    if (!course || course.isPublished === false) continue
    const applicable = opts.allApplicable || isInCourseTarget(course, user)
    const status = applicable ? statusOf(id) : 'not_started'
    const locked = !!pkg.sequential && applicable && earlierUnfinished && status !== 'completed'
    items.push({ course, applicable, status, locked })
    if (applicable && status !== 'completed') earlierUnfinished = true
  }
  const mine = items.filter((i) => i.applicable)
  const done = mine.filter((i) => i.status === 'completed').length
  return {
    items,
    total: mine.length,
    done,
    pct: mine.length > 0 ? Math.round((done / mine.length) * 100) : 0,
    next: mine.find((i) => i.status !== 'completed') ?? null,
  }
}

/** A package a learner may see: published, with at least one course that is theirs. */
export function packageVisibleTo(
  pkg: PackageLike,
  courses: readonly PackageCourse[],
  user: AudienceUser,
): boolean {
  if (!pkg.isPublished) return false
  const mine = new Set(courses.filter((c) => c.isPublished !== false && isInCourseTarget(c, user)).map((c) => c.id))
  return (pkg.courseIds ?? []).some((id) => mine.has(id))
}

// ── Editing the order ─────────────────────────────────────────────────────────

/** Move the course at index `from` to index `to`. Out-of-range moves leave the list as it is. */
export function moveCourse(ids: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return [...ids]
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Add a course at the end; one already in the package is not added twice. */
export function addCourse(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id]
}

export function removeCourse(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id)
}
