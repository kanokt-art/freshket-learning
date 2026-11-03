// The learner's Library: what is not on their My Course list but is still theirs to open.
//
//   · courses they have finished (including ones they took off their lists) — to learn again, or to bring
//     back to My Course;
//   · courses an admin opened to everyone to choose (`openEnrollment`) — to enroll in. Enrolling adds the
//     learner to the course roster, so they count in the Team Lead's report like any assigned learner.

import { isInCourseTarget, type AudienceCourse, type AudienceUser } from './audience'

interface LibCourse extends AudienceCourse {
  id: string
  isPublished?: boolean
  openEnrollment?: boolean
}

interface LibRecord { courseId: string; status?: string; dismissedAt?: unknown }

export interface LibraryEntry<C> {
  course: C
  /** Finished by this learner. */
  finished: boolean
  /** Taken off their lists with the ✕ button. */
  dismissed: boolean
  /** Already on their My Course (assigned, or enrolled). */
  enrolled: boolean
}

export function libraryEntries<C extends LibCourse>(
  courses: readonly C[],
  records: readonly LibRecord[],
  me: AudienceUser,
): LibraryEntry<C>[] {
  const byCourse = new Map(records.map((r) => [r.courseId, r]))
  const out: LibraryEntry<C>[] = []
  for (const course of courses) {
    if (!course.isPublished) continue
    const rec = byCourse.get(course.id)
    const finished = rec?.status === 'completed'
    const open = course.openEnrollment === true
    if (!finished && !open) continue
    out.push({ course, finished, dismissed: !!rec?.dismissedAt, enrolled: isInCourseTarget(course, me) })
  }
  return out
}

/** What the learner may know about a course's other learners: counts only, never who. */
export interface LibraryStat {
  /** People with any record on the course. */
  learners: number
  /** Of them, finished. */
  completed: number
  /** Learners in the viewer's own team (others than the viewer). */
  teamPeers: number
  /** Learners in the viewer's own department (others than the viewer). */
  deptPeers: number
}

/** A course to offer: not finished, not already on Your Course. */
const offerable = <C,>(e: LibraryEntry<C>) => !e.finished && !e.enrolled

const createdMs = (c: { createdAt?: unknown }): number => {
  const t = c.createdAt instanceof Date ? c.createdAt.getTime() : new Date(c.createdAt as string).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Newest first, published within `days`: the "ใหม่ล่าสุด" row. */
export function newestEntries<C extends LibCourse & { createdAt?: unknown }>(
  entries: readonly LibraryEntry<C>[],
  now: Date = new Date(),
  days = 30,
  limit = 4,
): LibraryEntry<C>[] {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000
  return entries
    .filter((e) => offerable(e) && createdMs(e.course) >= since)
    .sort((a, b) => createdMs(b.course) - createdMs(a.course))
    .slice(0, limit)
}

/** Ranked by how many people in the viewer's department took it (then overall): "แนะนำสำหรับคุณ". */
export function recommendedEntries<C extends LibCourse>(
  entries: readonly LibraryEntry<C>[],
  stats: Readonly<Record<string, LibraryStat | undefined>>,
  limit = 4,
): LibraryEntry<C>[] {
  return entries
    .filter((e) => offerable(e) && (stats[e.course.id]?.deptPeers ?? 0) > 0)
    .sort((a, b) => {
      const sa = stats[a.course.id]!, sb = stats[b.course.id]!
      return sb.deptPeers - sa.deptPeers || sb.learners - sa.learners
    })
    .slice(0, limit)
}

/** The courses on the learner's Your Course list: published, aimed at them, and not taken off the list. */
export function yourCourseCount(
  courses: readonly (AudienceCourse & { id: string; isPublished?: boolean })[],
  records: readonly LibRecord[],
  me: AudienceUser,
): number {
  const dismissed = new Set(records.filter((r) => r.dismissedAt).map((r) => r.courseId))
  return courses.filter((c) => c.isPublished && isInCourseTarget(c, me) && !dismissed.has(c.id)).length
}
