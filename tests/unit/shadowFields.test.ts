import { describe, it, expect } from 'vitest'
import { answeredQuestions, SHADOW_ANSWERS } from '@/lib/shadow/fields'

describe('answeredQuestions', () => {
  it('lists the answers in reading order: open, hook, close', () => {
    const out = answeredQuestions({
      closingNextStep: 'next', opening: 'hi', customerPain: 'pain', interestPoint: 'ip', diagnosticApproach: 'dx',
    })
    expect(out.map((a) => a.value)).toEqual(['hi', 'ip', 'dx', 'pain', 'next'])
  })

  it('leaves out blank and missing answers, so a sheet without best practice shows five blocks', () => {
    const out = answeredQuestions({ opening: 'hi', interestPoint: '', customerPain: '   ', bestPractice: '', beyondClassroom: undefined })
    expect(out).toEqual([{ label: expect.stringContaining('Opening'), value: 'hi' }])
  })

  it('keeps line breaks, which the form answers rely on', () => {
    expect(answeredQuestions({ opening: '- a\n- b' })[0].value).toBe('- a\n- b')
  })

  it('ignores a value that is not text', () => {
    expect(answeredQuestions({ opening: 42 as unknown as string })).toEqual([])
  })

  it('has a label for every question the record holds', () => {
    expect(SHADOW_ANSWERS.map((a) => a.key)).toEqual([
      'opening', 'interestPoint', 'diagnosticApproach', 'customerPain', 'closingNextStep', 'bestPractice', 'beyondClassroom',
    ])
  })
})
