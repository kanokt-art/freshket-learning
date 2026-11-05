// What a course's quiz attempts say, for the course dashboard: how long people take, how they score before and
// after, who passes, and which questions are missed most. Pure, so it is testable without a database; the route
// (api/assessment/analytics) feeds it the attempts and the question texts.
//
// Only quizzes built inside the app leave answers to read. A Google Form grades itself elsewhere, so a course
// that uses one has no attempts here and these numbers are simply empty.

export interface AttemptRow {
  uid: string
  assessmentId: string
  step?: string
  score?: number
  passed?: boolean
  timedOut?: boolean
  elapsedMs?: number
  answers?: Array<{ questionId: string; correct: boolean | null }>
}

export interface QuestionStat {
  assessmentId: string
  questionId: string
  text: string
  /** How many times it was answered (written questions are not auto-graded and are left out). */
  answered: number
  wrong: number
  /** 0–100, rounded. */
  wrongRate: number
}

export interface AttemptAnalytics {
  /** Every try, including those that ran out of time. */
  attempts: number
  /** People who made at least one try. */
  learners: number
  avgAttemptsPerLearner: number | null
  /** Mean of the tries that finished (a try that timed out has no time worth averaging). */
  avgElapsedMs: number | null
  avgScore: { pre: number | null; post: number | null }
  passed: number
  failed: number
  timedOut: number
  /** The most-missed questions come from after-the-course tries (a pre-test is meant to be missed); all tries when there are none. */
  questionBasis: 'post' | 'all'
  mostMissed: QuestionStat[]
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10)

export function analyzeAttempts(
  attempts: readonly AttemptRow[],
  questionText: ReadonlyMap<string, string>,
  topN = 8,
): AttemptAnalytics {
  const finished = attempts.filter((a) => !a.timedOut)
  const people = new Set(attempts.map((a) => a.uid))

  const scoreOf = (step: 'pre' | 'post') =>
    round1(mean(finished.filter((a) => a.step === step && typeof a.score === 'number').map((a) => a.score as number)))

  const times = finished.map((a) => a.elapsedMs).filter((v): v is number => typeof v === 'number' && v >= 0)

  const afterCourse = finished.filter((a) => a.step !== 'pre')
  const basis: 'post' | 'all' = afterCourse.length > 0 ? 'post' : 'all'
  const counted = basis === 'post' ? afterCourse : finished

  const perQuestion = new Map<string, { assessmentId: string; questionId: string; answered: number; wrong: number }>()
  for (const a of counted) {
    for (const ans of a.answers ?? []) {
      if (ans.correct === null || ans.correct === undefined) continue
      const key = `${a.assessmentId}:${ans.questionId}`
      const row = perQuestion.get(key) ?? { assessmentId: a.assessmentId, questionId: ans.questionId, answered: 0, wrong: 0 }
      row.answered++
      if (ans.correct === false) row.wrong++
      perQuestion.set(key, row)
    }
  }

  const mostMissed = Array.from(perQuestion.entries())
    .filter(([, r]) => r.wrong > 0)
    .map(([key, r]): QuestionStat => ({
      ...r,
      text: questionText.get(key) ?? '(ไม่พบคำถามนี้แล้ว)',
      wrongRate: Math.round((r.wrong / r.answered) * 100),
    }))
    .sort((x, y) => y.wrongRate - x.wrongRate || y.wrong - x.wrong)
    .slice(0, topN)

  const avgMs = mean(times)
  return {
    attempts: attempts.length,
    learners: people.size,
    avgAttemptsPerLearner: people.size ? round1(attempts.length / people.size) : null,
    avgElapsedMs: avgMs === null ? null : Math.round(avgMs),
    avgScore: { pre: scoreOf('pre'), post: scoreOf('post') },
    passed: finished.filter((a) => a.passed === true).length,
    failed: finished.filter((a) => a.passed === false).length,
    timedOut: attempts.length - finished.length,
    questionBasis: basis,
    mostMissed,
  }
}
