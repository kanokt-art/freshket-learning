import { describe, it, expect } from 'vitest'
import { analyzeAttempts, type AttemptRow, type AssessmentDef } from '@/lib/assessment/analytics'

const def: AssessmentDef = {
  title: 'Product Knowledge',
  questions: [
    { id: 'q1', order: 1, type: 'multiple_choice', text: 'ข้อหนึ่ง', choices: [{ id: 'a', text: 'ตัวเลือก ก', isCorrect: false }, { id: 'b', text: 'ตัวเลือก ข', isCorrect: true }, { id: 'c', text: 'ตัวเลือก ค', isCorrect: false }] },
    { id: 'q2', order: 2, type: 'multiple_choice', text: 'ข้อสอง', choices: [{ id: 'a', text: 'ก', isCorrect: true }, { id: 'b', text: 'ข', isCorrect: false }] },
    { id: 'q3', order: 3, type: 'drag_drop', text: 'ข้อสาม' },
  ],
}
const assessments = new Map([['a1', def]])

const ans = (q1: string, q2: string, q3: boolean | null = true) => [
  { questionId: 'q1', correct: q1 === 'b', given: q1 },
  { questionId: 'q2', correct: q2 === 'a', given: q2 },
  { questionId: 'q3', correct: q3, given: {} },
]

const attempts: AttemptRow[] = [
  { uid: 'u1', assessmentId: 'a1', step: 'pre', score: 40, passed: false, elapsedMs: 300_000, answers: ans('a', 'b') },
  { uid: 'u1', assessmentId: 'a1', step: 'post', score: 60, passed: false, elapsedMs: 600_000, answers: ans('b', 'b') },
  { uid: 'u1', assessmentId: 'a1', step: 'post', score: 90, passed: true, elapsedMs: 900_000, answers: ans('b', 'a') },
  { uid: 'u2', assessmentId: 'a1', step: 'post', score: 80, passed: true, elapsedMs: 300_000, answers: ans('c', 'a') },
  { uid: 'u3', assessmentId: 'a1', step: 'post', timedOut: true, passed: false, elapsedMs: 1_200_000, answers: [] },
]

describe('analyzeAttempts', () => {
  const out = analyzeAttempts(attempts, assessments)

  it('counts tries, people and tries per person', () => {
    expect(out.attempts).toBe(5)
    expect(out.learners).toBe(3)
    expect(out.avgAttemptsPerLearner).toBe(1.7)
  })

  it('averages the time of tries that finished, not the one that ran out', () => {
    expect(out.avgElapsedMs).toBe(525_000)
    expect(out.timedOut).toBe(1)
  })

  it('averages before and after scores separately', () => {
    expect(out.avgScore).toEqual({ pre: 40, post: 76.7 })
  })

  it('counts passes and fails of finished tries', () => {
    expect(out.passed).toBe(2)
    expect(out.failed).toBe(2)
  })

  it('lists the questions in quiz order, from after-the-course tries only', () => {
    expect(out.questionBasis).toBe('post')
    expect(out.questions.map((q) => [q.number, q.questionId, q.answered, q.correctRate, q.wrongRate])).toEqual([
      [1, 'q1', 3, 67, 33],
      [2, 'q2', 3, 67, 33],
      [3, 'q3', 3, 100, 0],
    ])
  })

  it('says which choice people picked, as letters with a share each', () => {
    const q1 = out.questions[0]
    expect(q1.options.map((o) => [o.letter, o.text, o.isCorrect, o.count, o.pct])).toEqual([
      ['A', 'ตัวเลือก ก', false, 0, 0],
      ['B', 'ตัวเลือก ข', true, 2, 67],
      ['C', 'ตัวเลือก ค', false, 1, 33],
    ])
    expect(out.questions[1].options.map((o) => [o.letter, o.count])).toEqual([['A', 2], ['B', 1]])
    expect(q1.noAnswer).toBe(0)
  })

  it('gives a matching question a right/wrong share but no per-choice picks', () => {
    expect(out.questions[2].options).toEqual([])
  })

  it('falls back to every try when there is no after-the-course one, and skips written questions', () => {
    const only = analyzeAttempts([
      { uid: 'u', assessmentId: 'a1', step: 'pre', score: 0, passed: false, answers: [{ questionId: 'q1', correct: false, given: 'a' }, { questionId: 'q2', correct: null }] },
    ], assessments)
    expect(only.questionBasis).toBe('all')
    expect(only.questions.map((q) => q.questionId)).toEqual(['q1'])
  })

  it('counts a blank answer, and keeps a question that was deleted from its quiz', () => {
    const odd = analyzeAttempts([
      { uid: 'u', assessmentId: 'a1', step: 'post', score: 0, passed: false, answers: [{ questionId: 'q1', correct: false, given: '' }, { questionId: 'gone', correct: false, given: 'a' }] },
    ], assessments)
    expect(odd.questions[0]).toMatchObject({ questionId: 'q1', noAnswer: 1 })
    expect(odd.questions[1]).toMatchObject({ questionId: 'gone', text: '(ไม่พบคำถามนี้แล้ว)' })
  })

  it('is empty without attempts', () => {
    expect(analyzeAttempts([], assessments)).toMatchObject({ attempts: 0, learners: 0, avgElapsedMs: null, avgAttemptsPerLearner: null, questions: [] })
  })
})

describe('demo analytics', () => {
  it('is built from the sample picks exactly, question by question', async () => {
    const { buildDemoAnalytics } = await import('@/lib/assessment/demoAnalytics')
    const out = buildDemoAnalytics()
    expect(out.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.questions.every((q) => q.answered === 40)).toBe(true)
    // q1: 34 of 40 picked B, the right one
    expect(out.questions[0].options.map((o) => o.count)).toEqual([2, 34, 1, 3])
    expect(out.questions[0].correctRate).toBe(85)
    // q6 is the hardest: only 13 of 40 right
    expect(out.questions[5].correctRate).toBe(33)
    expect(out.timedOut).toBe(2)
    expect(out.avgElapsedMs).not.toBeNull()
  })
})
