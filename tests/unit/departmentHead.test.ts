import { describe, it, expect } from 'vitest'
import { isDepartmentHead, levelOf, departmentScope } from '@/lib/users/departmentHead'
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

  it('gives a plain Manager nothing they were not assigned', () => {
    const manager = user({ uid: 'm', role: 'manager', rank: 'Manager' })
    expect(Array.from(managedTeamIds(manager, [manager, ...people], teams))).toEqual([])
  })
})
