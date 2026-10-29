import { describe, it, expect } from 'vitest'
import { teamChoices, effectiveTeamChoice, matchesTeam, NO_TEAM } from '@/lib/users/teamFilter'

const names = { t1: 'P-Tao', t2: 'P-Yun', t3: 'P-Bush' }
const people = [
  { teamId: 't1', department: 'Sales Management' },
  { teamId: 't1', department: 'Sales Management' },
  { teamId: 't2', department: 'Sales Management' },
  { teamId: 't3', department: 'Key Account Management' },
  { department: 'Key Account Management' },                    // no team
  { teamId: 'deleted-team', department: 'Key Account Management' }, // a team that no longer exists
]

describe('teamChoices', () => {
  it('offers every team someone belongs to, by name', () => {
    expect(teamChoices(people, 'all', names).teams.map((t) => t.name)).toEqual(['P-Bush', 'P-Tao', 'P-Yun'])
  })

  it('offers only the teams that exist within the chosen department', () => {
    expect(teamChoices(people, 'Sales Management', names).teams.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(teamChoices(people, 'Key Account Management', names).teams.map((t) => t.id)).toEqual(['t3'])
  })

  it('offers "no team" only when someone in view has none', () => {
    expect(teamChoices(people, 'Sales Management', names).hasUnplaced).toBe(false)
    expect(teamChoices(people, 'Key Account Management', names).hasUnplaced).toBe(true)
  })

  it('counts a team id that no longer exists as having no team', () => {
    const only = [{ teamId: 'deleted-team', department: 'X' }]
    expect(teamChoices(only, 'all', names)).toEqual({ teams: [], hasUnplaced: true })
  })

  it('lists each team once however many people it has', () => {
    expect(teamChoices(people, 'Sales Management', names).teams.filter((t) => t.id === 't1')).toHaveLength(1)
  })
})

describe('effectiveTeamChoice', () => {
  const sales = teamChoices(people, 'Sales Management', names)

  it('keeps a choice that is still on offer', () => {
    expect(effectiveTeamChoice('t1', sales)).toBe('t1')
    expect(effectiveTeamChoice('all', sales)).toBe('all')
  })

  it('reads a team that is not in the chosen department as "all"', () => {
    expect(effectiveTeamChoice('t3', sales)).toBe('all')
  })

  it('reads "no team" as "all" when nobody in view lacks a team', () => {
    expect(effectiveTeamChoice(NO_TEAM, sales)).toBe('all')
    expect(effectiveTeamChoice(NO_TEAM, teamChoices(people, 'Key Account Management', names))).toBe(NO_TEAM)
  })

  it('reads a team id that does not exist at all as "all"', () => {
    expect(effectiveTeamChoice('nope', sales)).toBe('all')
  })
})

describe('matchesTeam', () => {
  it('"all" matches everyone', () => {
    expect(people.every((u) => matchesTeam(u, 'all', names))).toBe(true)
  })

  it('a team matches only its members', () => {
    expect(people.filter((u) => matchesTeam(u, 't1', names))).toHaveLength(2)
    expect(people.filter((u) => matchesTeam(u, 't2', names))).toHaveLength(1)
  })

  it('"no team" matches people with none, and with a team id that no longer exists', () => {
    expect(people.filter((u) => matchesTeam(u, NO_TEAM, names))).toHaveLength(2)
  })

  it('does not match one team for another', () => {
    expect(matchesTeam({ teamId: 't1' }, 't2', names)).toBe(false)
  })
})
