import type { Question } from '@/types/assessment'
import type { AttemptAnswer } from '@/types/assessmentAttempt'

// Grading, extracted so it lives in exactly one place and can be unit-tested.
// This runs SERVER-SIDE ONLY (api/assessment/submit) — it needs the answer key,
// and the whole point of the change is that the key never reaches a browser.

export interface GradeResult {
  score: number          // percentage 0-100, rounded
  pointsEarned: number
  pointsPossible: number
  answers: AttemptAnswer[]
}

export type GivenAnswers = Record<string, string | Record<string, string>>

/**
 * Grade a submission against the full (key-bearing) questions.
 *
 * Scoring rules:
 *  - multiple_choice: the chosen choice id must be the one flagged isCorrect
 *  - drag_drop: every pair must be matched to its own `right` text (all-or-nothing)
 *  - open_ended: NOT auto-graded, and NOT counted in the denominator either
 *
 * On that last rule: open-ended answers used to earn 0 while still inflating
 * `pointsPossible`, which made any quiz with a meaningful share of written
 * questions mathematically unpassable — a learner could answer every gradeable
 * question perfectly and still land under the pass mark. The result screen even
 * tells the learner "รอผู้สอนตรวจ", but no marking UI exists, so the score was
 * final the moment it was shown. The percentage is therefore now computed over
 * auto-gradeable questions only; written answers are still stored verbatim on
 * the attempt for a human to read.
 *
 * Historical scores were left untouched, so attempts graded before this change
 * may read lower than an identical attempt graded today.
 */
export function gradeSubmission(questions: Question[], given: GivenAnswers): GradeResult {
  let pointsEarned = 0
  let pointsPossible = 0
  const answers: AttemptAnswer[] = []

  for (const q of questions) {
    const pts = q.points ?? 0
    const ans = given[q.id]
    const autoGradeable = q.type !== 'open_ended'

    // Only auto-gradeable questions can move the percentage, so only they
    // contribute to the denominator.
    if (autoGradeable) pointsPossible += pts

    let correct: boolean | null = null
    let earned = 0

    if (q.type === 'multiple_choice') {
      const key = q.choices?.find((c) => c.isCorrect)
      correct = typeof ans === 'string' && !!key && ans === key.id
      if (correct) earned = pts
    } else if (q.type === 'drag_drop') {
      const map = typeof ans === 'object' && ans !== null ? (ans as Record<string, string>) : null
      correct = !!map && !!q.dragPairs?.length && q.dragPairs.every((p) => map[p.id] === p.right)
      if (correct) earned = pts
    }
    // open_ended → correct stays null, earned stays 0

    pointsEarned += earned
    answers.push({
      questionId: q.id,
      given: ans ?? '',
      correct,
      // Reported as 0 so a written question doesn't read as "0 out of 20" on the
      // review screen when it was never gradeable in the first place.
      pointsEarned: earned,
      pointsPossible: autoGradeable ? pts : 0,
    })
  }

  return {
    score: pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : 0,
    pointsEarned,
    pointsPossible,
    answers,
  }
}

/**
 * Strip the answer key out of a question so it can be sent to the browser.
 *
 * - multiple_choice: drop `isCorrect` from every choice.
 * - drag_drop: the pairing IS the answer, so the `right` values are rotated
 *   across the pairs. The learner still sees the same set of left labels and the
 *   same pool of right options (the UI builds the pool from `pairs[].right`),
 *   but the array no longer reveals which belongs to which. Rotation is used
 *   rather than a random shuffle so the output is deterministic — a shuffle could
 *   leave a pair on its own answer by chance.
 */
export function sanitizeQuestion(q: Question): Question {
  const out: Question = { ...q }

  if (out.choices) {
    out.choices = out.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: false }))
  }

  if (out.dragPairs && out.dragPairs.length > 1) {
    const rights = out.dragPairs.map((p) => p.right)
    out.dragPairs = out.dragPairs.map((p, i) => ({
      ...p,
      right: rights[(i + 1) % rights.length],
    }))
  }

  // A single-pair drag question can't be obscured by rotation (there is only one
  // possible mapping), and `sampleAnswer` is guidance text for open-ended
  // questions, not a key — both are left alone.
  return out
}
