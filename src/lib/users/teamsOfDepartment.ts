import type { Team, UserProfile } from '@/types/user'
import { getTeamLeadIds, getTeamManagerIds } from '@/types/user'

/** The id a department's teams carry in `departmentId`. */
export function deptId(name: string) {
  return `dept-${name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '-')}`
}

/** The Commercial org chart: Sales, Key Account, Portfolio and Commercial itself. */
export const COMMERCIAL_FAMILY = ['Sales Management', 'Key Account Management', 'Portfolio Management', 'Commercial']

/** The two departments that used to share one card; their teams carry the first one's id. */
const FORMER_MERGE = ['Key Account Management', 'Portfolio Management']

/**
 * Which of the former merged departments a team really belongs to, judged by who is in it
 * (members, team leads, managers) — the stored departmentId says Key Account for both. Undefined
 * when the people are split evenly or nobody is in the team yet.
 */
function formerMergeHome(team: Team, users: UserProfile[]): string | undefined {
  const ids = new Set<string>([...getTeamLeadIds(team), ...getTeamManagerIds(team)])
  const tally = new Map<string, number>()
  for (const u of users) {
    if (!u.department || !FORMER_MERGE.includes(u.department)) continue
    if (u.teamId === team.id || ids.has(u.uid)) tally.set(u.department, (tally.get(u.department) ?? 0) + 1)
  }
  const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return undefined
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return undefined
  return ranked[0][0]
}

/** The teams shown under a department (or a merge of several). */
export function teamsOfDepartment(teams: Team[], users: UserProfile[], sourceNames: string[]): Team[] {
  const sourceDeptIds = new Set(sourceNames.map(deptId))
  const legacyIds = new Set(FORMER_MERGE.map(deptId))
  return teams.filter(t => {
    if (t.departmentId) {
      if (!legacyIds.has(t.departmentId)) return sourceDeptIds.has(t.departmentId)
      const home = formerMergeHome(t, users)
      return home ? sourceNames.includes(home) : sourceDeptIds.has(t.departmentId)
    }
    // Orphan team (no departmentId): include if any member belongs to a source department
    return users.some(u => u.teamId === t.id && !!u.department && sourceNames.includes(u.department))
  })
}

/** The department a team belongs to, by its stored id (sorting the former merge by its people). */
export function teamHomeDepartment(team: Team, users: UserProfile[], fallback: string): string {
  if (team.departmentId) {
    const legacy = FORMER_MERGE.find(n => deptId(n) === team.departmentId)
    if (legacy) return formerMergeHome(team, users) ?? legacy
    const known = [...COMMERCIAL_FAMILY, 'People Experience'].find(n => deptId(n) === team.departmentId)
    if (known) return known
  }
  return fallback
}

/**
 * Whose department a person may be in to be added to a team of `home`: their own department,
 * Commercial people into any team under Commercial, and Key Account / Portfolio teams take
 * both of those departments. A People Experience team takes People Experience only.
 */
export function allowedMemberDepartments(home: string): Set<string> {
  if (home === 'Commercial') return new Set(COMMERCIAL_FAMILY)
  if (home === 'Key Account Management' || home === 'Portfolio Management') {
    return new Set(['Key Account Management', 'Portfolio Management', 'Commercial'])
  }
  if (home === 'Sales Management') return new Set(['Sales Management', 'Commercial'])
  return new Set([home])
}
