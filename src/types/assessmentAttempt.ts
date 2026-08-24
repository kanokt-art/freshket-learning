// One row per quiz submission, written ONLY by the server (Admin SDK) from
// POST /api/assessment/submit.
//
// Before this existed, a submission left no trace at all: answers lived in React
// state, were graded in the browser, and everything except a single percentage
// was discarded. Nobody could review what a learner answered, re-grade after
// fixing a bad question, or see how long an attempt took. `attemptCount` on the
// training record was hard-coded to 1, so retakes were invisible too.
//
// firestore.rules denies all client access to this collection — it is an audit
// trail, so the account being audited must not be able to read or rewrite it.

export interface AttemptAnswer {
  questionId: string
  /** Learner's answer: choice id for multiple_choice, text for open_ended, {pairId: rightText} for drag_drop. */
  given: string | Record<string, string>
  /** null for open_ended, which is not auto-graded. */
  correct: boolean | null
  pointsEarned: number
  pointsPossible: number
}

export interface AssessmentAttempt {
  id: string
  uid: string
  assessmentId: string
  assessmentTitle: string
  /** Present when the quiz was launched from a course step, absent for a standalone run. */
  courseId?: string
  step?: 'pre' | 'post'
  /** Percentage 0-100, rounded — the same number the learner is shown. */
  score: number
  passingScore: number
  passed: boolean
  pointsEarned: number
  pointsPossible: number
  /** Which attempt this was for this (uid, assessmentId) pair, starting at 1. */
  attemptNumber: number
  answers: AttemptAnswer[]
  /** True when the submission was forced by the anti-cheat violation limit. */
  autoSubmitted: boolean
  createdAt: Date
}
