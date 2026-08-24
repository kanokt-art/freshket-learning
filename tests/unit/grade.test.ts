import { describe, it, expect } from 'vitest'
import { gradeSubmission, sanitizeQuestion } from '@/lib/assessment/grade'
import type { Question } from '@/types/assessment'

// gradeSubmission is now the single source of every quiz score in the system, and
// sanitizeQuestion is the thing standing between the answer key and the browser.
// Both are pure, so both get pinned down hard here.

const mc = (id: string, correctId: string, points = 1): Question => ({
  id,
  order: 1,
  type: 'multiple_choice',
  text: `Q ${id}`,
  points,
  choices: [
    { id: 'a', text: 'Alpha', isCorrect: correctId === 'a' },
    { id: 'b', text: 'Beta', isCorrect: correctId === 'b' },
    { id: 'c', text: 'Gamma', isCorrect: correctId === 'c' },
  ],
})

const drag = (id: string, points = 2): Question => ({
  id,
  order: 1,
  type: 'drag_drop',
  text: `Match ${id}`,
  points,
  dragPairs: [
    { id: 'p1', left: 'One', right: 'หนึ่ง' },
    { id: 'p2', left: 'Two', right: 'สอง' },
    { id: 'p3', left: 'Three', right: 'สาม' },
  ],
})

const open = (id: string, points = 5): Question => ({
  id, order: 1, type: 'open_ended', text: `Explain ${id}`, points,
})

describe('gradeSubmission — multiple choice', () => {
  it('awards points for the correct choice', () => {
    const r = gradeSubmission([mc('q1', 'b')], { q1: 'b' })
    expect(r.score).toBe(100)
    expect(r.pointsEarned).toBe(1)
    expect(r.answers[0].correct).toBe(true)
  })

  it('awards nothing for a wrong choice', () => {
    const r = gradeSubmission([mc('q1', 'b')], { q1: 'a' })
    expect(r.score).toBe(0)
    expect(r.answers[0].correct).toBe(false)
  })

  it('treats an unanswered question as wrong, not as an error', () => {
    const r = gradeSubmission([mc('q1', 'b')], {})
    expect(r.score).toBe(0)
    expect(r.answers[0].correct).toBe(false)
    expect(r.answers[0].given).toBe('')
  })

  it('rounds the percentage', () => {
    // 2 of 3 correct → 66.67 → 67
    const r = gradeSubmission([mc('q1', 'a'), mc('q2', 'a'), mc('q3', 'a')], { q1: 'a', q2: 'a', q3: 'b' })
    expect(r.score).toBe(67)
  })

  it('weights by points, not by question count', () => {
    const r = gradeSubmission([mc('q1', 'a', 9), mc('q2', 'a', 1)], { q1: 'a', q2: 'b' })
    expect(r.score).toBe(90)
  })
})

describe('gradeSubmission — drag and drop', () => {
  it('awards points only when every pair matches', () => {
    const r = gradeSubmission([drag('q1')], { q1: { p1: 'หนึ่ง', p2: 'สอง', p3: 'สาม' } })
    expect(r.answers[0].correct).toBe(true)
    expect(r.score).toBe(100)
  })

  it('is all-or-nothing — two of three pairs earns zero', () => {
    const r = gradeSubmission([drag('q1')], { q1: { p1: 'หนึ่ง', p2: 'สอง', p3: 'หนึ่ง' } })
    expect(r.answers[0].correct).toBe(false)
    expect(r.score).toBe(0)
  })

  it('counts a partially-filled answer as wrong', () => {
    const r = gradeSubmission([drag('q1')], { q1: { p1: 'หนึ่ง' } })
    expect(r.answers[0].correct).toBe(false)
  })

  it('does not accept a string where a mapping is expected', () => {
    const r = gradeSubmission([drag('q1')], { q1: 'หนึ่ง' })
    expect(r.answers[0].correct).toBe(false)
  })
})

describe('gradeSubmission — open ended', () => {
  it('is not auto-graded but still counts in the denominator', () => {
    // Documents the known wart (test plan L-08): an open-ended question can never
    // earn points, so it drags the achievable maximum down.
    const r = gradeSubmission([mc('q1', 'a', 5), open('q2', 5)], { q1: 'a', q2: 'my answer' })
    expect(r.answers[1].correct).toBeNull()
    expect(r.answers[1].pointsEarned).toBe(0)
    expect(r.pointsPossible).toBe(10)
    expect(r.score).toBe(50)
  })

  it('preserves the submitted text for later review', () => {
    const r = gradeSubmission([open('q1')], { q1: 'because of X' })
    expect(r.answers[0].given).toBe('because of X')
  })
})

describe('gradeSubmission — edge cases', () => {
  it('returns 0 rather than dividing by zero when nothing is worth points', () => {
    const r = gradeSubmission([mc('q1', 'a', 0)], { q1: 'a' })
    expect(r.score).toBe(0)
    expect(r.pointsPossible).toBe(0)
  })

  it('handles an empty quiz', () => {
    const r = gradeSubmission([], {})
    expect(r).toEqual({ score: 0, pointsEarned: 0, pointsPossible: 0, answers: [] })
  })

  it('ignores answers for questions that are not in the quiz', () => {
    const r = gradeSubmission([mc('q1', 'a')], { q1: 'a', qZ: 'junk' })
    expect(r.answers).toHaveLength(1)
    expect(r.score).toBe(100)
  })
})

// The security-critical half: whatever reaches the browser must not reveal the key.
describe('sanitizeQuestion', () => {
  it('clears every isCorrect flag while keeping the choices intact', () => {
    const clean = sanitizeQuestion(mc('q1', 'b'))
    expect(clean.choices).toHaveLength(3)
    expect(clean.choices!.every((c) => c.isCorrect === false)).toBe(true)
    expect(clean.choices!.map((c) => c.text)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('keeps the question text and points so the UI still renders', () => {
    const clean = sanitizeQuestion(mc('q1', 'b', 4))
    expect(clean.text).toBe('Q q1')
    expect(clean.points).toBe(4)
  })

  it('breaks every drag_drop pairing', () => {
    const original = drag('q1')
    const clean = sanitizeQuestion(original)
    for (const pair of clean.dragPairs!) {
      const truth = original.dragPairs!.find((p) => p.id === pair.id)!
      expect(pair.right).not.toBe(truth.right)
    }
  })

  it('keeps the same pool of drag options and the same left labels', () => {
    const original = drag('q1')
    const clean = sanitizeQuestion(original)
    expect([...clean.dragPairs!.map((p) => p.right)].sort())
      .toEqual([...original.dragPairs!.map((p) => p.right)].sort())
    expect(clean.dragPairs!.map((p) => p.left)).toEqual(original.dragPairs!.map((p) => p.left))
  })

  it('does not mutate the question it was given', () => {
    const original = mc('q1', 'b')
    sanitizeQuestion(original)
    expect(original.choices!.find((c) => c.id === 'b')!.isCorrect).toBe(true)
  })

  // The whole point: a client holding only the sanitized question cannot
  // reconstruct a passing answer set.
  it('a sanitized drag question does not grade as correct against the real key', () => {
    const original = drag('q1')
    const clean = sanitizeQuestion(original)
    const guessFromSanitized = Object.fromEntries(clean.dragPairs!.map((p) => [p.id, p.right]))
    const r = gradeSubmission([original], { q1: guessFromSanitized })
    expect(r.answers[0].correct).toBe(false)
  })
})
