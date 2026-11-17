import { describe, it, expect } from 'vitest'
import { allowedMemberDepartments, teamHomeDepartment, teamsOfDepartment, COMMERCIAL_FAMILY } from '@/lib/users/teamsOfDepartment'
import type { Team, UserProfile } from '@/types/user'

// Key Account and Portfolio used to share one card, so the teams made then all carry Key
// Account's department id. Each tab must still show only its own teams.
const team = (id: string, departmentId?: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, departmentId, ...extra }) as unknown as Team
const person = (uid: string, department: string, teamId?: string) =>
  ({ uid, department, teamId, role: 'sale' }) as unknown as UserProfile

const KAM = 'dept-key-account-management'
const PM = 'dept-portfolio-management'

describe('teams under a department tab', () => {
  const teams = [team('t-kam', KAM), team('t-pm', KAM), team('t-new-pm', PM), team('t-empty', KAM), team('t-mixed', KAM)]
  const users = [
    person('a', 'Key Account Management', 't-kam'),
    person('b', 'Portfolio Management', 't-pm'),
    person('c', 'Portfolio Management', 't-pm'),
    person('d', 'Key Account Management', 't-mixed'),
    person('e', 'Portfolio Management', 't-mixed'),
  ]
  const ids = (list: Team[]) => list.map(t => t.id).sort()

  it('puts a legacy team under the department most of its people belong to', () => {
    expect(ids(teamsOfDepartment(teams, users, ['Key Account Management']))).toContain('t-kam')
    expect(ids(teamsOfDepartment(teams, users, ['Key Account Management']))).not.toContain('t-pm')
    expect(ids(teamsOfDepartment(teams, users, ['Portfolio Management']))).toContain('t-pm')
    expect(ids(teamsOfDepartment(teams, users, ['Portfolio Management']))).not.toContain('t-kam')
  })

  it('keeps a team made on the Portfolio tab there, and an empty or evenly split legacy team on its stored department', () => {
    const pm = ids(teamsOfDepartment(teams, users, ['Portfolio Management']))
    expect(pm).toContain('t-new-pm')
    expect(pm).not.toContain('t-empty')
    const kam = ids(teamsOfDepartment(teams, users, ['Key Account Management']))
    expect(kam).toContain('t-empty')
    expect(kam).toContain('t-mixed')
  })

  it('counts a team lead or manager as one of the people, not only the members', () => {
    const t = team('t-led', KAM, { teamLeadIds: ['lead'] })
    const lead = person('lead', 'Portfolio Management')
    expect(ids(teamsOfDepartment([t], [lead], ['Portfolio Management']))).toEqual(['t-led'])
    expect(ids(teamsOfDepartment([t], [lead], ['Key Account Management']))).toEqual([])
  })
})

describe('who can be added to a team', () => {
  it('a Sales team takes Sales and Commercial people only', () => {
    const a = allowedMemberDepartments('Sales Management')
    expect(a.has('Sales Management')).toBe(true)
    expect(a.has('Commercial')).toBe(true)
    expect(a.has('People Experience')).toBe(false)
    expect(a.has('Key Account Management')).toBe(false)
  })

  it('Key Account and Portfolio teams see each other, plus Commercial', () => {
    for (const home of ['Key Account Management', 'Portfolio Management']) {
      const a = allowedMemberDepartments(home)
      expect(Array.from(a).sort()).toEqual(['Commercial', 'Key Account Management', 'Portfolio Management'])
    }
  })

  it('a Commercial team takes the whole Commercial org chart; People Experience only itself', () => {
    expect(Array.from(allowedMemberDepartments('Commercial')).sort()).toEqual([...COMMERCIAL_FAMILY].sort())
    expect(Array.from(allowedMemberDepartments('People Experience'))).toEqual(['People Experience'])
  })

  it('finds a team\'s own department, sorting the former merge by its people', () => {
    const t = (id: string, departmentId?: string) => ({ id, name: id, departmentId }) as unknown as Team
    const u = (uid: string, department: string, teamId: string) => ({ uid, department, teamId, role: 'sale' }) as unknown as UserProfile
    expect(teamHomeDepartment(t('x', 'dept-sales-management'), [], 'fallback')).toBe('Sales Management')
    expect(teamHomeDepartment(t('x', 'dept-commercial'), [], 'fallback')).toBe('Commercial')
    expect(teamHomeDepartment(t('p', 'dept-key-account-management'), [u('1', 'Portfolio Management', 'p')], 'fallback')).toBe('Portfolio Management')
    expect(teamHomeDepartment(t('x'), [], 'fallback')).toBe('fallback')
  })
})

describe('the Commercial tab', () => {
  it('lists the teams of Sales, Key Account, Portfolio and Commercial together', () => {
    const t = (id: string, departmentId: string) => ({ id, name: id, departmentId }) as unknown as Team
    const teams = [t('s', 'dept-sales-management'), t('k', 'dept-key-account-management'), t('c', 'dept-commercial'), t('p', 'dept-people-experience')]
    const ids = teamsOfDepartment(teams, [], COMMERCIAL_FAMILY).map(x => x.id).sort()
    expect(ids).toEqual(['c', 'k', 's'])
  })
})
