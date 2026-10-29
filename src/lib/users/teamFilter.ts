// The "team" filter on the employee list.
//
// A value is 'all', a team id, or NO_TEAM for people not placed in any team. The
// choices offered are only teams that would show someone within the department chosen,
// and a team picked earlier that does not exist in the department chosen now is read as
// "all" — otherwise changing the department could leave an empty list behind a filter
// the person can no longer see.

export const NO_TEAM = '__none__'
export const ALL_TEAMS = 'all'

interface Person { teamId?: string; department?: string }

/** Has this person a team that exists (an id left over from a deleted team counts as none)? */
const placed = (u: Person, teamNames: Record<string, string>) => !!(u.teamId && teamNames[u.teamId])

export interface TeamChoices {
  /** Teams with at least one listed person, by name. */
  teams: Array<{ id: string; name: string }>
  /** Whether some listed person has no team (so "no team" is worth offering). */
  hasUnplaced: boolean
}

export function teamChoices(
  people: readonly Person[],
  department: string,
  teamNames: Record<string, string>,
): TeamChoices {
  const ids = new Set<string>()
  let hasUnplaced = false
  for (const u of people) {
    if (department !== 'all' && u.department !== department) continue
    if (placed(u, teamNames)) ids.add(u.teamId as string)
    else hasUnplaced = true
  }
  const teams = Array.from(ids)
    .map((id) => ({ id, name: teamNames[id] }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { teams, hasUnplaced }
}

/** The choice to apply: the one picked, unless it is not among the choices now. */
export function effectiveTeamChoice(picked: string, choices: TeamChoices): string {
  if (picked === ALL_TEAMS) return ALL_TEAMS
  if (picked === NO_TEAM) return choices.hasUnplaced ? NO_TEAM : ALL_TEAMS
  return choices.teams.some((t) => t.id === picked) ? picked : ALL_TEAMS
}

export function matchesTeam(u: Person, choice: string, teamNames: Record<string, string>): boolean {
  if (choice === ALL_TEAMS) return true
  if (choice === NO_TEAM) return !placed(u, teamNames)
  return u.teamId === choice
}
