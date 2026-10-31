import { describe, it, expect } from 'vitest'
import { teamsOfDepartment } from '@/lib/users/teamsOfDepartment'
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
