import { describe, it, expect } from 'vitest'
import { lineManagerKey, computeAutoTeamMappings } from '@/lib/users/autoMapTeam'
import type { Team, UserProfile } from '@/types/user'

// Modeled on the real data this was built against: Sales Management and Key
// Account Management, four teams (P-Yun, P-Tao, SA MC, PM with no lead),
// three team leads with no teamId of their own, and a handful of members
// whose lineManager crosses department lines.

function user(p: Partial<UserProfile> & { uid: string }): UserProfile {
  return {
    email: `${p.uid}@freshket.co`,
    displayName: p.uid,
    role: 'sale',
    photoURL: null,
    ...p,
  } as UserProfile
}

const yun = user({ uid: 'u-yun', displayNameEN: 'Yunsita Choksrisanguan', nickname: 'Yun' })
const tao = user({ uid: 'u-tao', displayNameEN: 'Pataranuch Suyavech', nickname: 'Tao' })
const ploiiy = user({ uid: 'u-ploiiy', displayNameEN: 'Pavarisa Muangtaeng', nickname: 'Ploiiy' })

const teams: Team[] = [
  { id: 't-pyun', name: 'P-Yun', departmentId: 'dept-sales-management', teamLeadIds: ['u-yun'] },
  { id: 't-ptao', name: 'P-Tao', departmentId: 'dept-sales-management', teamLeadIds: ['u-tao'] },
  { id: 't-samc', name: 'SA MC', departmentId: 'dept-key-account-management', teamLeadIds: ['u-ploiiy'] },
  { id: 't-pm', name: 'PM', departmentId: 'dept-key-account-management' }, // no lead
]

describe('lineManagerKey', () => {
  it('builds "FirstNameEN (Nickname)", matching the HR export format', () => {
    expect(lineManagerKey(tao)).toBe('Pataranuch (Tao)')
  })

  it('returns null when either half is missing', () => {
    expect(lineManagerKey({ displayNameEN: 'Someone' })).toBeNull()
    expect(lineManagerKey({ nickname: 'Nook' })).toBeNull()
  })

  it('takes only the first word of a multi-word English name', () => {
    expect(lineManagerKey({ displayNameEN: 'Kanok Thong Dee', nickname: 'Nok' })).toBe('Kanok (Nok)')
  })
})

describe('computeAutoTeamMappings — team leads onto their own team', () => {
  it('assigns a lead with no teamId to the team they lead', () => {
    const targets = computeAutoTeamMappings([yun, tao, ploiiy], teams)
    expect(targets).toContainEqual({ uid: 'u-yun', teamId: 't-pyun' })
    expect(targets).toContainEqual({ uid: 'u-tao', teamId: 't-ptao' })
    expect(targets).toContainEqual({ uid: 'u-ploiiy', teamId: 't-samc' })
  })

  it('does not touch a lead who already has a teamId', () => {
    const yunPlaced = { ...yun, teamId: 't-pyun' }
    const targets = computeAutoTeamMappings([yunPlaced], teams)
    expect(targets.find(t => t.uid === 'u-yun')).toBeUndefined()
  })
})

describe('computeAutoTeamMappings — members matched by lineManager', () => {
  it('matches across department lines: a "Portfolio Management" person reporting to the "SA MC" lead goes to SA MC', () => {
    const wanmai = user({
      uid: 'u-wanmai', department: 'Portfolio Management', lineManager: 'Pavarisa (Ploiiy)',
    })
    const targets = computeAutoTeamMappings([ploiiy, wanmai], teams)
    expect(targets).toContainEqual({ uid: 'u-wanmai', teamId: 't-samc' })
  })

  it('never reassigns someone who already has a teamId, even if lineManager points elsewhere', () => {
    const alreadyOnPM = user({
      uid: 'u-onpm', teamId: 't-pm', lineManager: 'Pavarisa (Ploiiy)',
    })
    const targets = computeAutoTeamMappings([ploiiy, alreadyOnPM], teams)
    expect(targets.find(t => t.uid === 'u-onpm')).toBeUndefined()
  })

  it('leaves someone unmapped when their lineManager does not match any known team lead', () => {
    const noMatch = user({ uid: 'u-nomatch', lineManager: 'Boonwirat (Bush)' })
    const targets = computeAutoTeamMappings([noMatch], teams)
    expect(targets).toEqual([])
  })

  it('leaves someone unmapped when they have no lineManager at all', () => {
    const noManager = user({ uid: 'u-nomanager' })
    const targets = computeAutoTeamMappings([noManager], teams)
    expect(targets).toEqual([])
  })

  it('ignores a resigned employee even if their lineManager would otherwise match', () => {
    const resigned = user({ uid: 'u-resigned', lineManager: 'Pavarisa (Ploiiy)', employmentStatus: 'Resigned' })
    const targets = computeAutoTeamMappings([ploiiy, resigned], teams)
    expect(targets.find(t => t.uid === 'u-resigned')).toBeUndefined()
  })

  it('produces nothing for a team with no lead at all ("PM")', () => {
    const targets = computeAutoTeamMappings([yun, tao, ploiiy], teams)
    expect(targets.some(t => t.teamId === 't-pm')).toBe(false)
  })
})
