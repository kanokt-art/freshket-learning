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
 * Scoring rules, preserved from the previous client-side implementation so
 * existing scores stay comparable:
 *  - multiple_choice: the chosen choice id must be the one flagged isCorrect
 *  - drag_drop: every pair must be matched to its own `right` text (all-or-nothing)
 *  - open_ended: NOT auto-graded — earns 0 but still counts in the denominator
 *
 * That last rule is a known wart (a quiz with many open-ended questions is
 * unpassable). It is deliberately kept as-is here: changing the maths would move
 * every historical score. Tracked separately as L-08 in the test plan.
 */
export function gradeSubmission(questions: Question[], given: GivenAnswers): GradeResult {
  let pointsEarned = 0
  let pointsPossible = 0
  const answers: AttemptAnswer[] = []

  for (const q of questions) {
    const pts = q.points ?? 0
    pointsPossible += pts
    const ans = given[q.id]

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
      pointsEarned: earned,
      pointsPossible: pts,
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
