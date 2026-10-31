import { describe, it, expect } from 'vitest'
import { isDepartmentHead, levelOf, departmentScope, roleWithHeadFloor } from '@/lib/users/departmentHead'
import { managedMembers, managedTeamIds } from '@/lib/users/managedMembers'
import type { Team, UserProfile } from '@/types/user'

const user = (over: Record<string, unknown>) =>
  ({ uid: 'u', role: 'sale', department: 'People Experience', ...over }) as unknown as UserProfile
const team = (id: string, departmentId: string) => ({ id, name: id, departmentId }) as unknown as Team

describe('department head', () => {
  it('is anyone active at Head of Department level or above in a rollout department', () => {
    expect(isDepartmentHead(user({ rank: 'Head of', position: 'Head of People Experience' }))).toBe(true)
    expect(isDepartmentHead(user({ rank: 'JG11' }))).toBe(true)
    expect(isDepartmentHead(user({ department: 'Commercial', rank: 'Vice President' }))).toBe(true)
  })

  it('is not a Manager, not someone who has left, not outside the rollout', () => {
    expect(isDepartmentHead(user({ rank: 'JG10' }))).toBe(false)
    expect(isDepartmentHead(user({ rank: 'Manager' }))).toBe(false)
    expect(isDepartmentHead(user({ rank: 'Head of', employmentStatus: 'Resigned' }))).toBe(false)
    expect(isDepartmentHead(user({ rank: 'Head of', department: 'Marketing' }))).toBe(false)
  })

  it('does not take the app role for a level: a super_admin with no rank is not a head', () => {
    expect(levelOf({ rank: undefined, position: undefined })).toBe(3)
    expect(isDepartmentHead(user({ role: 'super_admin', rank: undefined, position: undefined }))).toBe(false)
  })

  it('covers its own department; Commercial covers the whole Commercial org chart', () => {
    expect(departmentScope('People Experience')).toEqual(['People Experience'])
    expect(departmentScope('Commercial')).toContain('Key Account Management')
  })
})

describe('what a department head sees', () => {
  const teams = [team('t-od', 'dept-people-experience'), team('t-tr', 'dept-people-experience'), team('t-sales', 'dept-sales-management')]
  const head = user({ uid: 'head', role: 'manager', rank: 'Head of', position: 'Head of People Experience' })
  const people = [
    head,
    user({ uid: 'a', teamId: 't-od', rank: 'Staff' }),
    user({ uid: 'b', teamId: 't-tr', rank: 'Senior Staff I' }),
    user({ uid: 'c', department: 'Sales Management', teamId: 't-sales', rank: 'Staff' }),
  ]

  it('is every team of their own department and nothing else', () => {
    const ids = Array.from(managedTeamIds(head, people, teams)).sort()
    expect(ids).toEqual(['t-od', 't-tr'])
  })

  it('lists the people in those teams, at or below their level', () => {
    expect(managedMembers(head, people, teams).map(u => u.uid).sort()).toEqual(['a', 'b'])
  })

  it('lists everyone in the department, with or without a team, super_admin included', () => {
    const everyone = [
      ...people,
      user({ uid: 'noteam', rank: 'Staff' }),                                         // in the department, on no team
      user({ uid: 'admin', role: 'super_admin', rank: 'Senior Staff' }),              // a super_admin who works in People
      user({ uid: 'boss', rank: 'Vice President' }),                                  // more senior than the head
      user({ uid: 'other', department: 'Sales Management', rank: 'Staff' }),          // another department, no team
    ]
    const uids = managedMembers(head, everyone, teams).map(u => u.uid).sort()
    expect(uids).toEqual(['a', 'admin', 'b', 'noteam'])
  })

  it('gives a plain Manager nothing they were not assigned', () => {
    const manager = user({ uid: 'm', role: 'manager', rank: 'Manager' })
    expect(Array.from(managedTeamIds(manager, [manager, ...people], teams))).toEqual([])
  })
})

describe('the role a department head acts under', () => {
  const headFields = { rank: 'Head of', position: 'Head of People Experience', department: 'People Experience' }

  it('is at least manager, set automatically', () => {
    expect(roleWithHeadFloor('sale', headFields)).toBe('manager')
    expect(roleWithHeadFloor('team_lead', headFields)).toBe('manager')
    expect(roleWithHeadFloor('manager', headFields)).toBe('manager')
  })

  it('never lifts anyone to super_admin, and leaves a super_admin alone', () => {
    expect(roleWithHeadFloor('super_admin', headFields)).toBe('super_admin')
    expect(roleWithHeadFloor('sale', headFields)).not.toBe('super_admin')
  })

  it('leaves everyone who is not a head as they are', () => {
    expect(roleWithHeadFloor('sale', { ...headFields, rank: 'Manager', position: 'People Manager' })).toBe('sale')
    expect(roleWithHeadFloor('sale', { ...headFields, employmentStatus: 'Resigned' })).toBe('sale')
    expect(roleWithHeadFloor('sale', { ...headFields, department: 'Marketing' })).toBe('sale')
  })
})

describe('who a team view leaves out', () => {
  const teams = [team('t1', 'dept-people-experience')]
  const lead = user({ uid: 'lead', role: 'manager', rank: 'Head of' })
  const roster = [
    lead,
    user({ uid: 'ok', teamId: 't1', rank: 'Staff' }),
    user({ uid: 'gone', teamId: 't1', rank: 'Staff', employmentStatus: 'Resigned' }),
    user({ uid: 'later', teamId: 't1', rank: 'Staff', employmentStatus: 'Pending' }),
    user({ uid: 'maid', teamId: 't1', rank: 'Staff', position: 'Maid' }),
    user({ uid: 'spa', teamId: 't1', rank: 'Staff', position: 'Masseuse' }),
  ]

  it('shows only people who are Active now, and not maids or masseuses', () => {
    expect(managedMembers(lead, roster, teams).map(u => u.uid)).toEqual(['ok'])
  })
})
