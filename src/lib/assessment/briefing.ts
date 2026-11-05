import type { Question } from '@/types/assessment'

// What a learner is told before the clock starts on a quiz: how long they have, how many questions,
// and what it takes to pass. Pure, so the card and its numbers can be tested without a page.

export interface QuizBriefing {
  /** Every question in the quiz. */
  questionCount: number
  /** The questions that move the score. A written (open-ended) question is read by a person, so it is not counted. */
  gradedCount: number
  /** null when the quiz is untimed. */
  timeLimitMinutes: number | null
  passingScore: number
  /** How many graded questions must be right to pass; null when that cannot be said (no graded questions, or unequal points). */
  passItems: number | null
}

export function quizBriefing(
  questions: readonly Pick<Question, 'type' | 'points'>[],
  passingScore: number,
  timeLimitMinutes?: number,
): QuizBriefing {
  const graded = questions.filter((q) => q.type !== 'open_ended')
  const limit = Number(timeLimitMinutes ?? 0)

  // With equal points the pass mark is a whole number of questions. The score is rounded to a whole
  // percent (lib/assessment/grade.ts), so the same rounding decides how many are enough.
  const pts = new Set(graded.map((q) => q.points ?? 0))
  let passItems: number | null = null
  if (graded.length > 0 && pts.size === 1 && (pts.values().next().value ?? 0) > 0) {
    for (let n = 0; n <= graded.length; n++) {
      if (Math.round((n / graded.length) * 100) >= passingScore) { passItems = n; break }
    }
  }

  return {
    questionCount: questions.length,
    gradedCount: graded.length,
    timeLimitMinutes: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    passingScore,
    passItems,
  }
}

/** "1 ชม. 30 นาที", "45 นาที". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} นาที`
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`
}

/** "12:05" or "1:02:03" from milliseconds, for how long an attempt took. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}
