import { describe, it, expect } from 'vitest'
import { duplicateKeys, hasDuplicateAnswers, normalizeText } from '@/lib/assessment/authoring'
import { revealResults, normalizeRevealMode, type QuestionVerdict } from '@/lib/assessment/reveal'

describe('duplicate answers', () => {
  it('ignores case, spacing and blanks', () => {
    expect(normalizeText('  Pork   Belly ')).toBe('pork belly')
    const dups = duplicateKeys(['สามชั้น', ' สามชั้น ', 'Pork Belly', 'pork  belly', '', ''])
    expect(Array.from(dups).sort()).toEqual(['pork belly', 'สามชั้น'])
  })

  it('finds a repeated choice or a repeated matching item', () => {
    const mc = (texts: string[]) => ({ type: 'multiple_choice' as const, choices: texts.map((text, i) => ({ id: String(i), text, isCorrect: false })) })
    expect(hasDuplicateAnswers(mc(['A', 'B', 'a']))).toBe(true)
    expect(hasDuplicateAnswers(mc(['A', 'B', 'C']))).toBe(false)
    expect(hasDuplicateAnswers({ type: 'drag_drop', dragPairs: [{ id: '1', left: 'x', right: 'y' }, { id: '2', left: 'z', right: 'Y' }] })).toBe(true)
    expect(hasDuplicateAnswers({ type: 'open_ended' })).toBe(false)
  })
})

describe('revealResults', () => {
  const results: QuestionVerdict[] = [
    { questionId: 'a', correct: true, pointsEarned: 1, pointsPossible: 1, correctLabel: 'A' },
    { questionId: 'b', correct: false, pointsEarned: 0, pointsPossible: 1, correctLabel: 'B' },
    { questionId: 'c', correct: null, pointsEarned: 0, pointsPossible: 0, correctLabel: '' },
  ]

  it('shows everything by default and for "all"', () => {
    expect(normalizeRevealMode(undefined)).toBe('all')
    expect(normalizeRevealMode('nonsense')).toBe('all')
    expect(revealResults(results, 'all')).toHaveLength(3)
  })

  it('"none" sends nothing back', () => {
    expect(revealResults(results, 'none')).toEqual([])
  })

  it('"correct" keeps only the right ones and never the right answer text', () => {
    expect(revealResults(results, 'correct')).toEqual([
      { questionId: 'a', correct: true, pointsEarned: 1, pointsPossible: 1, correctLabel: '' },
    ])
  })

  it('"wrong" keeps only the wrong ones, with the right answer', () => {
    const out = revealResults(results, 'wrong')
    expect(out.map((r) => r.questionId)).toEqual(['b'])
    expect(out[0].correctLabel).toBe('B')
  })
})
