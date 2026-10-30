import { describe, it, expect } from 'vitest'
import { canLeadAnyTeam } from '@/lib/users/teamManager'
import { levelGrade } from '@/lib/jobLevel'

const u = (over: Record<string, unknown>) =>
  ({ role: 'sale', department: 'Sales Management', ...over }) as Parameters<typeof canLeadAnyTeam>[0]

describe('levelGrade', () => {
  it.each([
    [{ rank: 'JG5' }, 5], [{ rank: 'JG10' }, 10], [{ rank: 'jg 9' }, 9], [{ rank: 'JG0' }, 0],
    [{ rank: 'Supervisor I' }, 5], [{ rank: 'Supervisor II' }, 6], [{ rank: 'Supervisor III' }, 6],
    [{ rank: 'Assistant Manager' }, 8], [{ rank: 'Manager' }, 9], [{ rank: 'Vice President' }, 12],
    [{ rank: 'Senior Staff I' }, 3], [{ rank: 'Staff - HQ I' }, 0], [{ rank: 'Staff' }, 0], [{ rank: 'Internship' }, -1],
  ])('reads %j as grade %i', (over, grade) => {
    expect(levelGrade({ role: 'sale', ...over } as Parameters<typeof levelGrade>[0])).toBe(grade)
  })

  it('does not lift a Staff-level team_lead: the role is not the level', () => {
    expect(levelGrade({ role: 'team_lead', rank: 'Staff', position: 'Acquisition Team' })).toBe(0)
  })

  it('falls back to the position, then the role, only when the rank says nothing', () => {
    expect(levelGrade({ role: 'sale', rank: undefined, position: 'Account Management Manager' })).toBe(9)
    expect(levelGrade({ role: 'manager', rank: undefined, position: undefined })).toBe(9)
    expect(levelGrade({ role: 'sale', rank: undefined, position: undefined })).toBe(1)
  })
})

describe('canLeadAnyTeam', () => {
  it('offers Supervisor, Assistant Manager and Manager level in a rollout department', () => {
    expect(canLeadAnyTeam(u({ rank: 'Supervisor I' }))).toBe(true)
    expect(canLeadAnyTeam(u({ role: 'team_lead', rank: 'Assistant Manager', position: 'Assistant Sales Manager' }))).toBe(true)
    // Pavarisa: Manager level, Portfolio Management
    expect(canLeadAnyTeam(u({ role: 'manager', rank: 'Manager', department: 'Portfolio Management' }))).toBe(true)
    // a Manager-level employee whose app role is still sale
    expect(canLeadAnyTeam(u({ role: 'sale', rank: 'Manager', department: 'Key Account Management' }))).toBe(true)
  })

  it('does not offer someone below Supervisor, even with the team_lead role', () => {
    // Supanida (Mook): rank Staff, role team_lead
    expect(canLeadAnyTeam(u({ role: 'team_lead', rank: 'Staff', position: 'Acquisition Team' }))).toBe(false)
    expect(canLeadAnyTeam(u({ rank: 'Senior Staff I' }))).toBe(false)
    expect(canLeadAnyTeam(u({ rank: 'JG4' }))).toBe(false)
  })

  it('offers only departments in the rollout, Commercial included', () => {
    expect(canLeadAnyTeam(u({ department: 'Commercial', rank: 'Vice President' }))).toBe(true)
    expect(canLeadAnyTeam(u({ department: 'Commercial', rank: 'Staff' }))).toBe(false)
    expect(canLeadAnyTeam(u({ role: 'manager', rank: 'Manager', department: 'Tech&Product' }))).toBe(false)
    expect(canLeadAnyTeam(u({ role: 'manager', rank: 'Manager', department: undefined }))).toBe(false)
  })

  it('never offers someone who has left', () => {
    expect(canLeadAnyTeam(u({ role: 'manager', rank: 'Manager', employmentStatus: 'Resigned' }))).toBe(false)
  })
})
