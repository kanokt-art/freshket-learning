// What a course's quiz attempts say, for the course dashboard: how long people take, how they score before and
// after, who passes, and — question by question — how many got it right and which choice the rest picked. Pure, so
// it is testable without a database; the route (api/assessment/analytics) feeds it the attempts and the quizzes.
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
  answers?: Array<{ questionId: string; correct: boolean | null; given?: string | Record<string, string> }>
}

/** The parts of a quiz the breakdown needs. */
export interface AssessmentDef {
  title: string
  questions: Array<{
    id: string
    order?: number
    type: string
    text: string
    choices?: Array<{ id: string; text: string; isCorrect: boolean }>
  }>
}

export interface OptionStat {
  id: string
  /** A, B, C… in the order the choices were written. */
  letter: string
  text: string
  isCorrect: boolean
  count: number
  /** Share of the people who answered the question, 0–100, rounded. */
  pct: number
}

export interface QuestionBreakdown {
  assessmentId: string
  assessmentTitle: string
  questionId: string
  /** The question's place in its quiz, from 1. */
  number: number
  text: string
  type: string
  /** How many times it was answered (blank answers included; written questions are not auto-graded and are left out). */
  answered: number
  correct: number
  wrong: number
  correctRate: number
  wrongRate: number
  /** Per choice, for a multiple-choice question; empty for a matching question, which has no single pick. */
  options: OptionStat[]
  /** Answered with nothing chosen. */
  noAnswer: number
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
  /** The per-question figures come from after-the-course tries (a pre-test is meant to be missed); all tries when there are none. */
  questionBasis: 'post' | 'all'
  /** Every graded question that was answered, in quiz order (the screen can re-sort). */
  questions: QuestionBreakdown[]
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10)
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0)

export function analyzeAttempts(
  attempts: readonly AttemptRow[],
  assessments: ReadonlyMap<string, AssessmentDef>,
): AttemptAnalytics {
  const finished = attempts.filter((a) => !a.timedOut)
  const people = new Set(attempts.map((a) => a.uid))

  const scoreOf = (step: 'pre' | 'post') =>
    round1(mean(finished.filter((a) => a.step === step && typeof a.score === 'number').map((a) => a.score as number)))

  const times = finished.map((a) => a.elapsedMs).filter((v): v is number => typeof v === 'number' && v >= 0)

  const afterCourse = finished.filter((a) => a.step !== 'pre')
  const basis: 'post' | 'all' = afterCourse.length > 0 ? 'post' : 'all'
  const counted = basis === 'post' ? afterCourse : finished

  // Per (quiz, question): how it went, and which choice each answer named.
  const tally = new Map<string, { assessmentId: string; questionId: string; answered: number; correct: number; wrong: number; picks: Map<string, number> }>()
  for (const a of counted) {
    for (const ans of a.answers ?? []) {
      if (ans.correct === null || ans.correct === undefined) continue
      const key = `${a.assessmentId}:${ans.questionId}`
      const row = tally.get(key) ?? { assessmentId: a.assessmentId, questionId: ans.questionId, answered: 0, correct: 0, wrong: 0, picks: new Map() }
      row.answered++
      if (ans.correct) row.correct++
      else row.wrong++
      const pick = typeof ans.given === 'string' ? ans.given : ''
      row.picks.set(pick, (row.picks.get(pick) ?? 0) + 1)
      tally.set(key, row)
    }
  }

  // Walk each quiz's questions in order so the list reads as the quiz does.
  const questions: QuestionBreakdown[] = []
  const seen = new Set<string>()
  for (const [assessmentId, def] of Array.from(assessments.entries())) {
    const ordered = def.questions.map((q, i) => ({ q, i })).sort((x, y) => (x.q.order ?? x.i) - (y.q.order ?? y.i))
    ordered.forEach(({ q }, idx) => {
      const key = `${assessmentId}:${q.id}`
      const t = tally.get(key)
      if (!t) return
      seen.add(key)
      const options: OptionStat[] = (q.choices ?? []).map((c, ci) => {
        const count = t.picks.get(c.id) ?? 0
        return { id: c.id, letter: String.fromCharCode(65 + ci), text: c.text, isCorrect: c.isCorrect, count, pct: pct(count, t.answered) }
      })
      const chosen = options.reduce((n, o) => n + o.count, 0)
      questions.push({
        assessmentId, assessmentTitle: def.title, questionId: q.id, number: idx + 1, text: q.text, type: q.type,
        answered: t.answered, correct: t.correct, wrong: t.wrong,
        correctRate: pct(t.correct, t.answered), wrongRate: pct(t.wrong, t.answered),
        options,
        noAnswer: options.length > 0 ? Math.max(0, t.answered - chosen) : 0,
      })
    })
  }
  // A question that was answered but has since been deleted from its quiz still counts, at the end.
  tally.forEach((t, key) => {
    if (seen.has(key)) return
    questions.push({
      assessmentId: t.assessmentId, assessmentTitle: assessments.get(t.assessmentId)?.title ?? '', questionId: t.questionId,
      number: 0, text: '(ไม่พบคำถามนี้แล้ว)', type: 'unknown',
      answered: t.answered, correct: t.correct, wrong: t.wrong,
      correctRate: pct(t.correct, t.answered), wrongRate: pct(t.wrong, t.answered), options: [], noAnswer: 0,
    })
  })

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
    questions,
  }
}
