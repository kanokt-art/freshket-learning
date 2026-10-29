import { describe, it, expect } from 'vitest'
import { rankToRole } from '@/lib/users/rankToRole'

describe('rankToRole', () => {
  it.each([
    ['JG1', 'sale'], ['JG6', 'sale'],
    ['JG7', 'team_lead'], ['JG8', 'team_lead'],
    ['JG9', 'manager'], ['JG10', 'manager'],
  ])('%s → %s', (rank, role) => {
    expect(rankToRole(rank)).toBe(role)
  })

  it.each(['JG11', 'JG12', 'JG15', 'JG99'])('%s is never super_admin — the top role is set by hand', (rank) => {
    // Head of Dept / VP / C-Level used to be promoted automatically on import.
    expect(rankToRole(rank)).toBe('manager')
    expect(rankToRole(rank)).not.toBe('super_admin')
  })

  it('finds the grade inside longer text, in any case', () => {
    expect(rankToRole('Senior Manager (jg10)')).toBe('manager')
  })

  it('is sale for a missing or unrecognised rank', () => {
    expect(rankToRole(undefined)).toBe('sale')
    expect(rankToRole('')).toBe('sale')
    expect(rankToRole('Director')).toBe('sale')
  })

  it('cannot reach super_admin from any grade', () => {
    for (let n = 0; n <= 200; n++) expect(rankToRole(`JG${n}`)).not.toBe('super_admin')
  })
})
