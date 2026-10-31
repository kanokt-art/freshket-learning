import { canViewByLevel } from '@/lib/jobLevel'
import { departmentScope, isDepartmentHead } from '@/lib/users/departmentHead'
import { teamsOfDepartment } from '@/lib/users/teamsOfDepartment'
import { getTeamManagerIds, getTeamLeadIds, type Team, type UserProfile } from '@/types/user'

type Viewer = Pick<UserProfile, 'uid' | 'role' | 'rank' | 'position' | 'department' | 'employmentStatus' | 'teamId' | 'visibleTeamIds'>

/**
 * The teams a team lead / manager is responsible for: the ones they lead or manage, any explicit
 * visibleTeamIds, their own team, and — for a department head (JG11+) — every team of their
 * own department.
 */
export function managedTeamIds(user: Viewer, allUsers: readonly UserProfile[], teams: readonly Team[]): Set<string> {
  const managed = new Set<string>()
  teams.forEach((t) => { if (getTeamManagerIds(t).includes(user.uid) || getTeamLeadIds(t).includes(user.uid)) managed.add(t.id) })
  ;(user.visibleTeamIds ?? []).forEach((id) => managed.add(id))
  if (user.teamId) managed.add(user.teamId)
  if (isDepartmentHead(user) && user.department) {
    teamsOfDepartment([...teams], [...allUsers], departmentScope(user.department)).forEach((t) => managed.add(t.id))
  }
  return managed
}

/**
 * The people a team lead / manager is responsible for: members of the teams they
 * lead or manage (plus any explicit visibleTeamIds and their own team), at or
 * below their own level. Used wherever "my team's report" is shown, so the home
 * dashboard, the roster and a course's results all mean the same set of people.
 */
export function managedMembers(
  user: Viewer | null | undefined,
  allUsers: readonly UserProfile[],
  teams: readonly Team[],
): UserProfile[] {
  if (!user) return []
  const managed = managedTeamIds(user, allUsers, teams)
  // Only members at or below the viewer's level (a team_lead never sees the manager).
  return allUsers.filter((u) => u.uid !== user.uid && u.teamId && managed.has(u.teamId) && canViewByLevel(user, u))
}
