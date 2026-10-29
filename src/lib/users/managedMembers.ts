import { canViewByLevel } from '@/lib/jobLevel'
import { getTeamManagerIds, getTeamLeadIds, type Team, type UserProfile } from '@/types/user'

/**
 * The people a team lead / manager is responsible for: members of the teams they
 * lead or manage (plus any explicit visibleTeamIds and their own team), at or
 * below their own level. Used wherever "my team's report" is shown, so the home
 * dashboard, the roster and a course's results all mean the same set of people.
 */
export function managedMembers(
  user: Pick<UserProfile, 'uid' | 'role' | 'rank' | 'position' | 'teamId' | 'visibleTeamIds'> | null | undefined,
  allUsers: readonly UserProfile[],
  teams: readonly Team[],
): UserProfile[] {
  if (!user) return []
  const managed = new Set<string>()
  teams.forEach((t) => { if (getTeamManagerIds(t).includes(user.uid) || getTeamLeadIds(t).includes(user.uid)) managed.add(t.id) })
  ;(user.visibleTeamIds ?? []).forEach((id) => managed.add(id))
  if (user.teamId) managed.add(user.teamId)
  // Only members at or below the viewer's level (a team_lead never sees the manager).
  return allUsers.filter((u) => u.uid !== user.uid && u.teamId && managed.has(u.teamId) && canViewByLevel(user, u))
}
