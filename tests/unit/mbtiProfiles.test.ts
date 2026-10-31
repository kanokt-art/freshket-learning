import { describe, it, expect } from 'vitest'
import { MBTI_DEFINITION } from '@/lib/bucketAssessments'
import { MBTI_PROFILES, getMbtiProfile } from '@/lib/bucketAssessments/mbtiProfiles'

// Every result the questionnaire can produce has a card to read, and nothing is half-filled.
describe('MBTI type cards', () => {
  it('has a card for every outcome the questionnaire can give', () => {
    for (const o of MBTI_DEFINITION.outcomes) expect(getMbtiProfile(o.code), o.code).toBeDefined()
    expect(new Set(MBTI_PROFILES.map((p) => p.code)).size).toBe(16)
  })

  it('fills every section of every card', () => {
    for (const p of MBTI_PROFILES) {
      expect(p.summary.length, p.code).toBeGreaterThan(0)
      for (const list of [p.lifestyle, p.work, p.strengths, p.growth]) expect(list.length, p.code).toBeGreaterThanOrEqual(3)
    }
  })

  it('finds a card regardless of case and none for a made-up code', () => {
    expect(getMbtiProfile('intj')?.code).toBe('INTJ')
    expect(getMbtiProfile('XXXX')).toBeUndefined()
    expect(getMbtiProfile(undefined)).toBeUndefined()
  })
})
