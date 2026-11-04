import { describe, it, expect } from 'vitest'
import { managedMembers } from '@/lib/users/managedMembers'
import type { Team, UserProfile } from '@/types/user'

const person = (uid: string, over: Partial<UserProfile> = {}) =>
  ({ uid, displayName: uid, email: `${uid}@freshket.co`, role: 'sale', employmentStatus: 'Active', ...over }) as unknown as UserProfile

describe('managedMembers for a super_admin', () => {
  const trainer = person('kanok', { role: 'super_admin', department: 'People Experience' })
  const everyone = [
    trainer,
    person('s1', { teamId: 't1', department: 'Sales Management' }),
    person('s2', { department: 'Sales Management' }),            // no team
    person('gone', { employmentStatus: 'Resigned', department: 'Sales Management' }),
  ]
  const teams = [{ id: 't1', name: 'Team A', teamLeadIds: ['someone'] }] as unknown as Team[]

  it('sees every active member, in a team or not, but not themselves or people who have left', () => {
    expect(managedMembers(trainer, everyone, teams).map((u) => u.uid).sort()).toEqual(['s1', 's2'])
  })

  it('a manager of one team still sees only their own team', () => {
    const manager = person('m1', { role: 'manager', teamId: 't1' })
    const r = managedMembers(manager, [manager, ...everyone.slice(1)], teams)
    expect(r.map((u) => u.uid)).toEqual(['s1'])
  })
})
