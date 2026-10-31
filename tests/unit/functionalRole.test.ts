import { describe, it, expect } from 'vitest'
import { functionalRole } from '@/lib/users/functionalRole'
import type { Team } from '@/types/user'

const team = (extra: Record<string, unknown>) => ({ id: 't1', name: 'T', ...extra }) as unknown as Team
const person = (over: Record<string, unknown>) => ({ uid: 'u', role: 'sale', department: 'Sales Management', rank: 'Staff', ...over }) as Parameters<typeof functionalRole>[0]

describe('functionalRole: what someone is in the team structure', () => {
  it('a Staff-level person whose stored role says team_lead but who leads no team is a member', () => {
    expect(functionalRole(person({ role: 'team_lead' }), [team({ teamLeadIds: ['someone-else'] })])).toBe('member')
    expect(functionalRole(person({ role: 'team_lead' }), [])).toBe('member')
  })

  it('is a Team Lead when set as one on a team, a Manager when set as a manager', () => {
    expect(functionalRole(person({}), [team({ teamLeadIds: ['u'] })])).toBe('team_lead')
    expect(functionalRole(person({}), [team({ managerIds: ['u'] })])).toBe('manager')
  })

  it('a manager of one team and lead of another is a manager', () => {
    expect(functionalRole(person({}), [team({ managerIds: ['u'] }), team({ id: 't2', teamLeadIds: ['u'] })])).toBe('manager')
  })

  it('a department head is a head, and a super_admin stays a super_admin', () => {
    expect(functionalRole(person({ rank: 'Head of', department: 'People Experience' }), [])).toBe('head')
    expect(functionalRole(person({ role: 'super_admin', rank: 'Head of', department: 'People Experience' }), [])).toBe('super_admin')
  })
})
