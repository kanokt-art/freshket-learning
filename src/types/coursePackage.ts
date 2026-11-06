// A Course Design: several existing courses gathered into one package, in the order they are meant to be taken.
// Learners work through the package; each course in it is still the ordinary course with its own lessons, quiz
// and training record, so nothing about a course changes by being in a package.

export interface CoursePackage {
  id: string
  title: string
  description?: string
  /** The courses, in the order they are taken. A course that is later deleted or unpublished is simply skipped. */
  courseIds: string[]
  /** Learners must finish each course before the next one opens. */
  sequential?: boolean
  isPublished: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
