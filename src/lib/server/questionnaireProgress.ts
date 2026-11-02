import { requiresPostTest } from '@/lib/courses/completion'

// Submitting a questionnaire (MBTI, selling style) ticks its lesson. That used to be a browser handshake:
// the result page left a note and the course page ticked the lesson when the learner came back to it. A
// learner who closed the tab, or went to their profile, finished the questionnaire and still showed no
// progress. The server now writes the progress as part of the submission, so it can no longer be lost.

type Doc = Record<string, unknown>

interface LessonShape { id?: string; type?: string; bucketAssessmentId?: string }
interface CourseShape {
  id?: string
  title?: string
  isPublished?: boolean
  hasKeyTakeAway?: boolean
  endDate?: unknown
  topics?: Array<{ lessons?: LessonShape[] }>
}

export interface ProgressWrite {
  /** The record to merge into trainingRecords/{uid}_{courseId}. */
  record: Doc
  /** True when this submission is what finishes the course. */
  completedNow: boolean
}

const lessonsOf = (course: CourseShape): LessonShape[] => (course.topics ?? []).flatMap((t) => t.lessons ?? [])

/**
 * What a submitted questionnaire does to the learner's record for its course, or null when the lesson is
 * not really a questionnaire lesson of this course (so a request cannot tick anything it names).
 */
export function questionnaireProgress(
  course: CourseShape | null | undefined,
  lessonId: string,
  definitionId: string,
  prev: Doc | null,
  uid: string,
  memberName: string,
  now: Date = new Date(),
): ProgressWrite | null {
  if (!course || course.isPublished === false || !course.id) return null
  const lessons = lessonsOf(course)
  const lesson = lessons.find((l) => l.id === lessonId)
  // The lesson must be this questionnaire. A lesson without its own definition is the default (MBTI).
  if (!lesson || lesson.type !== 'personality' || (lesson.bucketAssessmentId ?? 'mbti') !== definitionId) return null

  const before = Array.isArray(prev?.completedLessonIds) ? (prev!.completedLessonIds as string[]) : []
  const completedLessonIds = before.includes(lessonId) ? before : [...before, lessonId]
  const totalLessons = lessons.length

  // A course with a graded post-test is finished by grading, never by a tick; and one that also asks for
  // a take-away is not finished until that is written.
  const finishesByLessons = !requiresPostTest(course) && !course.hasKeyTakeAway
  const allDone = lessons.every((l) => !!l.id && completedLessonIds.includes(l.id))
  const alreadyDone = prev?.status === 'completed' || prev?.status === 'failed'
  const completedNow = finishesByLessons && allDone && prev?.status !== 'completed'

  const record: Doc = {
    userId: uid,
    memberName,
    courseId: course.id,
    courseTitle: course.title ?? '',
    completedLessonIds,
    totalLessons,
    source: prev?.source ?? 'manual',
    updatedAt: now,
  }
  if (!alreadyDone) record.status = finishesByLessons && allDone ? 'completed' : 'in_progress'
  if (!prev?.startedAt) record.startedAt = now
  if (record.status === 'completed' && !prev?.completedAt) record.completedAt = now
  if (course.endDate && !prev?.dueDate) record.dueDate = new Date(course.endDate as string)
  return { record, completedNow }
}
