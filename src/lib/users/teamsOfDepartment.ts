import type { Team, UserProfile } from '@/types/user'
import { getTeamLeadIds, getTeamManagerIds } from '@/types/user'

/** The id a department's teams carry in `departmentId`. */
export function deptId(name: string) {
  return `dept-${name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '-')}`
}

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
