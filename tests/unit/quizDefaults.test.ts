import { describe, it, expect } from 'vitest'
import { clampMinutes, readQuizDefaults, startingSettings, FACTORY_SETTINGS } from '@/lib/assessment/quizDefaults'

describe('quiz defaults', () => {
  it('a new quiz starts at 15 minutes, 70%, retake on, reveal all', () => {
    expect(startingSettings(null, null)).toEqual({ passingScore: 70, timeLimitMinutes: 15, allowRetakeOnFail: true, revealMode: 'all' })
  })

  it('a new quiz starts from what was used last time', () => {
    const last = { passingScore: 80, timeLimitMinutes: 30, allowRetakeOnFail: false, revealMode: 'wrong' as const }
    expect(startingSettings(null, last)).toEqual(last)
  })

  it('an existing quiz keeps its own values, and stays untimed if it had no limit', () => {
    const s = startingSettings({ passingScore: 90, timeLimitMinutes: undefined, allowRetakeOnFail: false, revealMode: 'none' }, { ...FACTORY_SETTINGS, passingScore: 50 })
    expect(s).toEqual({ passingScore: 90, timeLimitMinutes: 0, allowRetakeOnFail: false, revealMode: 'none' })
  })

  it('clamps minutes to 0..600 whole numbers', () => {
    expect(clampMinutes(-5)).toBe(0)
    expect(clampMinutes(7.6)).toBe(8)
    expect(clampMinutes(9999)).toBe(600)
    expect(clampMinutes(NaN)).toBe(0)
  })

  it('reads a damaged remembered value as the factory one', () => {
    expect(readQuizDefaults(null)).toEqual(FACTORY_SETTINGS)
    expect(readQuizDefaults({ passingScore: 'abc', revealMode: 'x', timeLimitMinutes: 0 })).toEqual({ ...FACTORY_SETTINGS, timeLimitMinutes: 0 })
  })
})
