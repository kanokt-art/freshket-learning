import { describe, it, expect } from 'vitest'
import { managedMembers } from '@/lib/users/managedMembers'
import { englishName } from '@/lib/users/displayName'
import type { Team, UserProfile } from '@/types/user'

const u = (over: Partial<UserProfile>): UserProfile => ({ uid: 'x', email: 'x@freshket.co', displayName: 'X', role: 'sale', ...over } as UserProfile)
const team = (over: Partial<Team>): Team => ({ id: 't1', name: 'T1', ...over } as Team)

describe('managedMembers', () => {
  const lead = u({ uid: 'lead', role: 'team_lead', teamId: 't1' })
  const mine = u({ uid: 'a', teamId: 't1' })
  const other = u({ uid: 'b', teamId: 't2' })
  const noTeam = u({ uid: 'c' })
  const manager = u({ uid: 'm', role: 'manager', teamId: 't1' })

  it('is the people in the teams I lead, not me, not other teams', () => {
    const got = managedMembers(lead, [lead, mine, other, noTeam], [team({ id: 't1', teamLeadId: 'lead' }), team({ id: 't2' })])
    expect(got.map((m) => m.uid)).toEqual(['a'])
  })

  it('includes teams I manage or was given as visible', () => {
    const mgr = u({ uid: 'm2', role: 'manager', visibleTeamIds: ['t2'] })
    const got = managedMembers(mgr, [mine, other], [team({ id: 't1', managerId: 'm2' }), team({ id: 't2' })])
    expect(got.map((m) => m.uid).sort()).toEqual(['a', 'b'])
  })

  it('never lists someone above me, e.g. a team lead does not see the manager', () => {
    const got = managedMembers(lead, [mine, manager], [team({ id: 't1', teamLeadId: 'lead' })])
    expect(got.map((m) => m.uid)).toEqual(['a'])
  })

  it('is empty without a user', () => {
    expect(managedMembers(null, [mine], [])).toEqual([])
  })
})

describe('englishName', () => {
  it('is the English full name, without the nickname, falling back to Thai then email', () => {
    expect(englishName({ displayNameEN: 'Pattanut Suyaves', nickname: 'Ko', displayName: 'ภัทรนุช สุยะเวช' })).toBe('Pattanut Suyaves')
    expect(englishName({ displayName: 'ภัทรนุช สุยะเวช' })).toBe('ภัทรนุช สุยะเวช')
    expect(englishName({ email: 'a@freshket.co' })).toBe('a@freshket.co')
  })
})
