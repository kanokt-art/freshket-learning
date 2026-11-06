// A Course Design: several existing courses gathered into one package, in the order they are meant to be taken —
// and the step where courses are launched. A Course Design owns who the learners are, when it starts and ends, and
// whether it is live; a course on its own is only a draft of content (its lessons, quiz and Key Take Away).
//
// Each course in a package is still the ordinary course with its own lessons, quiz and training record. What a
// learner is assigned follows the launched Course Designs a course belongs to (lib/courses/designProjection.ts).

export interface CoursePackage {
  id: string
  title: string
  description?: string
  /** The courses, in the order they are taken. A course that is later deleted is simply skipped. */
  courseIds: string[]
  /** Learners must finish each course before the next one opens. */
  sequential?: boolean
  /** Live: learners get the courses. Off: the package is a draft and its courses stay drafts (unless another live package holds them). */
  isPublished: boolean

  // ── Who it is for, and when ──
  /** The people named one by one, and the snapshot of whoever the conditions below picked. */
  assignedUserIds?: string[]
  /** Whole departments, and individual teams, the audience follows (so a new joiner is included). */
  assignedDepartments?: string[]
  assignedTeamIds?: string[]
  /** Roles the audience falls back to; a package made by hand leaves it empty, one made from an older course keeps what that course had. */
  targetRoles?: string[]
  /** Open from this day; none = as soon as it is live. */
  startDate?: Date
  /** Closes on this day; none = no deadline. */
  endDate?: Date

  createdBy: string
  createdAt: Date
  updatedAt: Date
}
