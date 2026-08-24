import { describe, it, expect } from 'vitest'
import { canAccess, getTeamManagerIds, getTeamLeadIds } from '@/types/user'
import { canViewByLevel } from '@/lib/jobLevel'

// canAccess is the predicate behind every route guard in the app, and
// canViewByLevel decides which team members a lead/manager may see. Both are
// pure, so they get cheap exhaustive coverage here rather than only being
// exercised indirectly through the browser suite.

describe('canAccess', () => {
  it('is inclusive at the same level', () => {
    expect(canAccess('team_lead', 'team_lead')).toBe(true)
    expect(canAccess('super_admin', 'super_admin')).toBe(true)
  })

  it('lets higher roles through lower gates', () => {
    expect(canAccess('super_admin', 'sale')).toBe(true)
    expect(canAccess('manager', 'team_lead')).toBe(true)
  })

  it('blocks lower roles at higher gates', () => {
    expect(canAccess('sale', 'team_lead')).toBe(false)
    expect(canAccess('team_lead', 'manager')).toBe(false)
    expect(canAccess('manager', 'super_admin')).toBe(false)
  })

  it('never lets a learner reach an admin gate', () => {
    for (const gate of ['team_lead', 'manager', 'super_admin'] as const) {
      expect(canAccess('sale', gate)).toBe(false)
    }
  })
})

describe('canViewByLevel', () => {
  const manager  = { role: 'manager' as const,   rank: 'Manager',      position: 'Sales Manager' }
  const lead     = { role: 'team_lead' as const,  rank: 'Supervisor I', position: 'Team Lead' }
  const rep      = { role: 'sale' as const,       rank: 'JG5',          position: 'Sale Executive' }

  it('lets a manager see their leads and reps', () => {
    expect(canViewByLevel(manager, lead)).toBe(true)
    expect(canViewByLevel(manager, rep)).toBe(true)
  })

  it('never lets a lead see their manager', () => {
    expect(canViewByLevel(lead, manager)).toBe(false)
  })

  it('never lets a rep see up the chain', () => {
    expect(canViewByLevel(rep, lead)).toBe(false)
    expect(canViewByLevel(rep, manager)).toBe(false)
  })

  it('lets someone see a peer at their own level', () => {
    expect(canViewByLevel(lead, lead)).toBe(true)
  })
})

// Multi-manager / multi-team-lead support reads through these two helpers, which
// have to keep understanding docs written before the plural fields existed.
describe('team leadership accessors', () => {
  it('reads the plural fields', () => {
    expect(getTeamManagerIds({ managerIds: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(getTeamLeadIds({ teamLeadIds: ['c'] })).toEqual(['c'])
  })

  it('falls back to the legacy singular field', () => {
    expect(getTeamManagerIds({ managerId: 'legacy' })).toEqual(['legacy'])
    expect(getTeamLeadIds({ teamLeadId: 'legacy' })).toEqual(['legacy'])
  })

  it('prefers the plural field when both are present', () => {
    expect(getTeamManagerIds({ managerId: 'old', managerIds: ['new'] })).toEqual(['new'])
  })

  it('returns an empty array when a team has neither', () => {
    expect(getTeamManagerIds({})).toEqual([])
    expect(getTeamLeadIds({})).toEqual([])
  })

  // An explicitly-emptied team must stay empty, not resurrect the legacy value.
  it('respects an empty plural array over a stale singular field', () => {
    expect(getTeamManagerIds({ managerId: 'old', managerIds: [] })).toEqual([])
  })
})
