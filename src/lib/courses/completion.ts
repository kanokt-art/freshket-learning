// Who decides that a course is finished.
//
// A course that has a graded post-test is finished when the SERVER says so: the
// learner's submission is graded, and passing sets "completed" (failing sets
// "failed"). The browser may report that a learner has started and how far through
// the lessons they are, but it cannot award itself "completed" — nothing it holds
// proves the test was passed. (Scores were already server-only; this closes the
// same gap for the status the reports count as "passed".)
//
// A course with no graded test has nothing to verify, so lesson ticks still finish
// it, as before.
//
// Pure functions shared by the browser (what to send), the data door (what to
// refuse) and the grading route (what to set), so the three cannot disagree.

import type { TrainingStatus } from '@/types/tracking'

interface CourseShape {
  topics?: Array<{ lessons?: Array<{ type?: string; quizRole?: string }> }>
}

/**
 * Does this course have a graded post-test? A lesson tagged `post_test` is sat
 * once, after the material; one tagged `pre_test` is sat twice and its second
 * sitting is the post-test. An untagged quiz is practice and does not count.
 */
export function requiresPostTest(course: CourseShape | null | undefined): boolean {
  return (course?.topics ?? []).some((t) =>
    (t.lessons ?? []).some((l) => l.type === 'quiz' && (l.quizRole === 'post_test' || l.quizRole === 'pre_test')),
  )
}

const isFinal = (s: unknown): s is 'completed' | 'failed' => s === 'completed' || s === 'failed'

/**
 * What the browser may write as `status`, given what is stored.
 * Returns `undefined` for "leave it alone".
 *
 *  · A course without a graded test: whatever the lessons say.
 *  · A course with one: never `completed` or `failed` from here, and never
 *    downgrade a result the server already recorded — a later lesson tick must not
 *    turn a graded "completed" back into "in progress".
 */
export function statusTheBrowserMayWrite(
  course: CourseShape | null | undefined,
  stored: string | undefined,
  wanted: TrainingStatus,
): TrainingStatus | undefined {
  if (!requiresPostTest(course)) return wanted
  if (isFinal(stored)) return undefined
  return wanted === 'completed' || wanted === 'failed' ? 'in_progress' : wanted
}

/**
 * Should a write that changes a learner's `status` be refused? True when it sets
 * "completed" or "failed" on a course with a graded post-test.
 */
export function refusesClientStatus(
  course: CourseShape | null | undefined,
  before: unknown,
  after: unknown,
): boolean {
  if (after === before || !isFinal(after)) return false
  return requiresPostTest(course)
}

/**
 * What the grading route sets after a POST-test is submitted.
 * Returns `undefined` for "leave it alone": a learner who has already passed is not
 * marked failed by a later, worse retake.
 */
export function statusAfterPostTest(stored: string | undefined, passed: boolean): 'completed' | 'failed' | undefined {
  if (passed) return 'completed'
  return stored === 'completed' ? undefined : 'failed'
}
