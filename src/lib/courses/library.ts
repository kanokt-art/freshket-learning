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
