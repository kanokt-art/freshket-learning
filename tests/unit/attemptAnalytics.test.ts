import { describe, it, expect } from 'vitest'
import { analyzeAttempts, type AttemptRow } from '@/lib/assessment/analytics'

const text = new Map([['a1:q1', 'ข้อหนึ่ง'], ['a1:q2', 'ข้อสอง'], ['a1:q3', 'ข้อสาม']])
const ans = (q1: boolean | null, q2: boolean | null, q3: boolean | null = true) => [
  { questionId: 'q1', correct: q1 }, { questionId: 'q2', correct: q2 }, { questionId: 'q3', correct: q3 },
]

const attempts: AttemptRow[] = [
  { uid: 'u1', assessmentId: 'a1', step: 'pre', score: 40, passed: false, elapsedMs: 300_000, answers: ans(false, false) },
  { uid: 'u1', assessmentId: 'a1', step: 'post', score: 60, passed: false, elapsedMs: 600_000, answers: ans(true, false) },
  { uid: 'u1', assessmentId: 'a1', step: 'post', score: 90, passed: true, elapsedMs: 900_000, answers: ans(true, true) },
  { uid: 'u2', assessmentId: 'a1', step: 'post', score: 80, passed: true, elapsedMs: 300_000, answers: ans(false, true) },
  { uid: 'u3', assessmentId: 'a1', step: 'post', timedOut: true, passed: false, elapsedMs: 1_200_000, answers: [] },
]

describe('analyzeAttempts', () => {
  const out = analyzeAttempts(attempts, text)

  it('counts tries, people and tries per person', () => {
    expect(out.attempts).toBe(5)
    expect(out.learners).toBe(3)
    expect(out.avgAttemptsPerLearner).toBe(1.7)
  })

  it('averages the time of tries that finished, not the one that ran out', () => {
    // (300 + 600 + 900 + 300) s / 4
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

  it('ranks the questions missed most from after-the-course tries', () => {
    expect(out.questionBasis).toBe('post')
    // q1: wrong 1 of 3, q2: wrong 1 of 3 (post only; the pre-test's misses are not counted)
    expect(out.mostMissed.map((q) => [q.questionId, q.answered, q.wrong, q.wrongRate])).toEqual([
      ['q1', 3, 1, 33],
      ['q2', 3, 1, 33],
    ])
    expect(out.mostMissed[0].text).toBe('ข้อหนึ่ง')
  })

  it('falls back to every try when there is no after-the-course one, and skips written questions', () => {
    const only = analyzeAttempts([{ uid: 'u', assessmentId: 'a1', step: 'pre', score: 0, passed: false, answers: ans(false, null) }], text)
    expect(only.questionBasis).toBe('all')
    expect(only.mostMissed.map((q) => q.questionId)).toEqual(['q1'])
  })

  it('is empty without attempts', () => {
    expect(analyzeAttempts([], text)).toMatchObject({ attempts: 0, learners: 0, avgElapsedMs: null, avgAttemptsPerLearner: null, mostMissed: [] })
  })
})
