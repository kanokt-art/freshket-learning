import { describe, it, expect } from 'vitest'
import { canAssessRoleplay, roleplayGroups, missingInGroup, firstIncomplete, nextRound, buildRoleplayAssessment, validRating } from '@/lib/roleplay/assessForm'
import { ROLEPLAY_TOPICS } from '@/types/roleplay'

const full = (v = 7) => Object.fromEntries(ROLEPLAY_TOPICS.map((t) => [t.key, v]))
const base = {
  subject: { uid: 's1', name: 'Som', team: 'Team A' },
  assessor: { uid: 'l1', name: 'Lead', role: 'team_lead' as const },
  type: 'pre' as const, round: 1, overallNote: '', groupComments: {},
}

describe('roleplay assessor form', () => {
  it('has the eight categories, each with its topics', () => {
    const g = roleplayGroups()
    expect(g.map((x) => x.name)).toEqual(['Preparation', 'Greeting', 'Discovery Flow', 'Active Listening', 'Solution', 'Closing', 'Tools', 'Follow Up'])
    expect(g.reduce((n, x) => n + x.topics.length, 0)).toBe(ROLEPLAY_TOPICS.length)
  })

  it('every topic says what to look for, so every rating means the same thing', () => {
    for (const g of roleplayGroups()) for (const t of g.topics) expect(t.description.length, t.key).toBeGreaterThan(20)
  })

  it('a rating is required for every topic: missing ones are counted and the first incomplete category is named', () => {
    const groups = roleplayGroups()
    const r = full()
    delete r.greet_intro
    expect(missingInGroup(groups[1], r)).toBe(1)
    expect(firstIncomplete(groups, r)).toBe('Greeting')
    expect(firstIncomplete(groups, full())).toBeNull()
  })

  it('only whole numbers 1 to 10 are ratings', () => {
    expect([0, 11, 5.5, NaN, '7', undefined].some(validRating)).toBe(false)
    expect([1, 10].every(validRating)).toBe(true)
  })

  it('does not build a record while a rating is missing, or when the assessor is the subject', () => {
    const r = full(); delete r.close_pro
    expect(buildRoleplayAssessment({ ...base, ratings: r })).toBeNull()
    expect(buildRoleplayAssessment({ ...base, ratings: full(), assessor: { uid: 's1', name: 'Som', role: 'team_lead' } })).toBeNull()
  })

  it('builds the record: a rating per topic, only the category comments that were written (trimmed)', () => {
    const rec = buildRoleplayAssessment({
      ...base, ratings: full(8), overallNote: '  ok  ',
      groupComments: { Greeting: '  warm  ', Closing: '   ', Tools: 'explain LINE OA slower' },
      now: new Date('2026-11-03T00:00:00Z'),
    })!
    expect(rec.topics).toHaveLength(ROLEPLAY_TOPICS.length)
    expect(rec.topics.every((t) => t.rating === 8 && t.comment === '')).toBe(true)
    expect(rec.groupComments).toEqual({ Greeting: 'warm', Tools: 'explain LINE OA slower' })
    expect(rec.overallNote).toBe('ok')
    expect(rec).toMatchObject({ assessorUid: 'l1', subjectUid: 's1', type: 'pre', round: 1 })
  })

  it('round counts this member\'s earlier sittings of the same kind', () => {
    const ex = [{ type: 'pre', subjectUid: 's1' }, { type: 'pre', subjectUid: 's1' }, { type: 'post', subjectUid: 's1' }, { type: 'pre', subjectUid: 'other' }]
    expect(nextRound(ex, 'pre', 's1')).toBe(3)
    expect(nextRound(ex, 'post', 's1')).toBe(2)
    expect(nextRound([], 'pre', 's1')).toBe(1)
  })
})

describe('who may assess', () => {
  it('team leads, managers and admins may, of someone else; a learner may not; nobody of themselves', () => {
    expect(canAssessRoleplay({ uid: 'm1', role: 'manager' }, 's1')).toBe(true)
    expect(canAssessRoleplay({ uid: 'l1', role: 'team_lead' }, 's1')).toBe(true)
    expect(canAssessRoleplay({ uid: 'a1', role: 'super_admin' }, 's1')).toBe(true)
    expect(canAssessRoleplay({ uid: 'u1', role: 'sale' }, 's1')).toBe(false)
    expect(canAssessRoleplay({ uid: 'm1', role: 'manager' }, 'm1')).toBe(false)
    expect(canAssessRoleplay(null, 's1')).toBe(false)
  })
})
