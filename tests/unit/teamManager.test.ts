import { describe, it, expect } from 'vitest'
import { canManageAnyTeam } from '@/lib/users/teamManager'

const u = (over: Record<string, unknown>) => ({ role: 'sale', department: 'Sales Management', ...over }) as Parameters<typeof canManageAnyTeam>[0]

describe('canManageAnyTeam', () => {
  it('offers everyone in Commercial, whatever their role or level', () => {
    expect(canManageAnyTeam(u({ department: 'Commercial', role: 'sale', rank: 'Staff' }))).toBe(true)
    expect(canManageAnyTeam(u({ department: 'Commercial', role: 'sale', rank: 'Vice President' }))).toBe(true)
  })

  it('offers anyone at manager level or above, in any department', () => {
    expect(canManageAnyTeam(u({ role: 'manager', department: 'Tech&Product' }))).toBe(true)
    expect(canManageAnyTeam(u({ role: 'super_admin', department: 'CEO Office' }))).toBe(true)
  })

  it('counts job grade, so a Vice President whose role is still sale is offered', () => {
    expect(canManageAnyTeam(u({ role: 'sale', rank: 'Vice President', department: 'Merchandising' }))).toBe(true)
    expect(canManageAnyTeam(u({ role: 'sale', position: 'Senior Manager, Supply', department: 'Merchandising' }))).toBe(true)
  })

  it('does not offer ordinary staff or team leads from other departments', () => {
    expect(canManageAnyTeam(u({ role: 'sale', rank: 'Staff' }))).toBe(false)
    expect(canManageAnyTeam(u({ role: 'team_lead', position: 'Sales Supervisor' }))).toBe(false)
    expect(canManageAnyTeam(u({ role: 'sale', department: 'Commercial Operations' }))).toBe(false)
  })

  it('never offers someone who has left, even from Commercial or at manager level', () => {
    expect(canManageAnyTeam(u({ department: 'Commercial', employmentStatus: 'Resigned' }))).toBe(false)
    expect(canManageAnyTeam(u({ role: 'manager', employmentStatus: 'Resigned' }))).toBe(false)
  })
})
