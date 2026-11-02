// Submitting a questionnaire (MBTI, selling style) ticks its lesson. That used to be a browser handshake:
// the result page left a note and the course page ticked the lesson when the learner came back to it. A
// learner who closed the tab, or went to their profile, finished the questionnaire and still showed no
// progress. The server now writes the progress as part of the submission, so it can no longer be lost.
//
// It also finishes the course when this was the last thing left: every lesson done, nothing graded to
// pass and no take-away to write. A questionnaire has no "finish" step worth asking for, so a learner who
// has answered it must not sit under "in progress". A course with a graded post-test is finished only by
// grading, and one that asks for a take-away waits for it. (The course page can no longer write a
// finished course back to in progress, so this sticks.)

import { requiresPostTest } from '@/lib/courses/completion'

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
 * What a submitted questionnaire does to the learner's record for its course (the lesson is ticked; the
 * course is finished when nothing else is left), or null when the lesson is not really a questionnaire lesson of this course
 * (so a request cannot tick anything it names).
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

  // A result already recorded (finished or failed) is never taken back by a tick.
  const alreadyFinal = prev?.status === 'completed' || prev?.status === 'failed'
  const finishesByLessons = !requiresPostTest(course) && !course.hasKeyTakeAway
  const allDone = lessons.every((l) => !!l.id && completedLessonIds.includes(l.id))
  const completedNow = finishesByLessons && allDone && prev?.status !== 'completed' && prev?.status !== 'failed'

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
  if (!alreadyFinal) record.status = completedNow ? 'completed' : 'in_progress'
  if (!prev?.startedAt) record.startedAt = now
  if (completedNow && !prev?.completedAt) record.completedAt = now
  if (course.endDate && !prev?.dueDate) record.dueDate = new Date(course.endDate as string)
  return { record, completedNow }
}
