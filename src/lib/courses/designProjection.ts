// A Course Design decides who a course is for and when; a course keeps only its content. But the rest of the
// app — a learner's course list, enrolment, deadlines, Slack, the team reports — reads a course's own audience and
// dates, so those fields are kept as a PROJECTION of the live Course Designs the course belongs to (the same idea
// as the roster snapshot the course already carried). This is the one place that works the projection out.
//
//   · a course in at least one live Course Design is published, for the union of those audiences;
//   · it opens on the earliest start date (as soon as any of them has none), closes on the latest end date (no
//     deadline as soon as any of them has none);
//   · a course in no live Course Design is a draft: nobody is assigned and learners do not see it.

export interface DesignLike {
  isPublished?: boolean
  courseIds?: readonly string[]
  assignedUserIds?: readonly string[]
  assignedDepartments?: readonly string[]
  assignedTeamIds?: readonly string[]
  targetRoles?: readonly string[]
  startDate?: Date | string | null
  endDate?: Date | string | null
}

export interface CourseProjection {
  isPublished: boolean
  assignedUserIds: string[]
  assignedDepartments: string[]
  assignedTeamIds: string[]
  /** Roles the audience falls back to (only a package made from an older course has any). */
  targetRoles: string[]
  startDate: Date | null
  endDate: Date | null
}

/** What a course becomes when no live Course Design holds it. */
export const DRAFT_PROJECTION: CourseProjection = {
  isPublished: false,
  assignedUserIds: [],
  assignedDepartments: [],
  assignedTeamIds: [],
  targetRoles: [],
  startDate: null,
  endDate: null,
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

const union = (lists: Array<readonly string[] | undefined>): string[] => Array.from(new Set(lists.flatMap((l) => l ?? [])))

/** The projection for one course, or null when no live Course Design holds it. */
export function projectCourse(courseId: string, designs: readonly DesignLike[]): CourseProjection | null {
  const live = designs.filter((d) => d.isPublished === true && (d.courseIds ?? []).includes(courseId))
  if (live.length === 0) return null

  const starts = live.map((d) => toDate(d.startDate))
  const ends = live.map((d) => toDate(d.endDate))
  const everyStart = starts.every((s) => s !== null)
  const everyEnd = ends.every((e) => e !== null)

  return {
    isPublished: true,
    assignedUserIds: union(live.map((d) => d.assignedUserIds)),
    assignedDepartments: union(live.map((d) => d.assignedDepartments)),
    assignedTeamIds: union(live.map((d) => d.assignedTeamIds)),
    targetRoles: union(live.map((d) => d.targetRoles)),
    startDate: everyStart ? new Date(Math.min(...starts.map((s) => (s as Date).getTime()))) : null,
    endDate: everyEnd ? new Date(Math.max(...ends.map((e) => (e as Date).getTime()))) : null,
  }
}

/** Do two projections say the same thing? (Lists compare as sets, dates by the moment.) */
export function sameProjection(
  a: CourseProjection,
  current: {
    isPublished?: boolean
    assignedUserIds?: readonly string[]
    assignedDepartments?: readonly string[]
    assignedTeamIds?: readonly string[]
    targetRoles?: readonly string[]
    startDate?: Date | string | null
    endDate?: Date | string | null
  },
): boolean {
  const set = (l: readonly string[] | undefined) => JSON.stringify(Array.from(new Set(l ?? [])).sort())
  const ms = (d: Date | string | null | undefined) => toDate(d)?.getTime() ?? null
  return (current.isPublished === true) === a.isPublished
    && set(a.assignedUserIds) === set(current.assignedUserIds)
    && set(a.assignedDepartments) === set(current.assignedDepartments)
    && set(a.assignedTeamIds) === set(current.assignedTeamIds)
    && set(a.targetRoles) === set(current.targetRoles)
    && ms(a.startDate) === ms(current.startDate)
    && ms(a.endDate) === ms(current.endDate)
}
