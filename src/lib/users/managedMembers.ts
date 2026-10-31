import { canViewByLevel } from '@/lib/jobLevel'
import { isActiveEmployee } from '@/lib/users/active'
import { isExcludedPosition } from '@/lib/users/excludedPositions'
import { departmentScope, isDepartmentHead, levelOf } from '@/lib/users/departmentHead'
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
 * May this viewer open this person's report (profile, training record, role play, shadow)? Only the
 * people above them in team management: the Team Lead or Manager of their team (or someone an admin
 * granted that team), or the head of their department — plus the person themself and a super_admin.
 * Everyone else, including any ordinary employee, is turned away.
 *
 * Unlike the team lists, this does not hide someone who has resigned: their history stays readable by
 * the people who were responsible for them.
 */
export function canViewEmployeeReport(
  viewer: Viewer | null | undefined,
  target: UserProfile,
  _allUsers: readonly UserProfile[],
  teams: readonly Team[],
): boolean {
  if (!viewer) return false
  if (viewer.role === 'super_admin') return true
  if (viewer.uid === target.uid) return true

  // Their Team Lead or Manager as set in team management, or a team an admin granted the viewer.
  // (Not simply "on the same team": a colleague is not responsible for them.)
  const tid = target.teamId
  const inCharge = !!tid && (
    teams.some((t) => t.id === tid && (getTeamManagerIds(t).includes(viewer.uid) || getTeamLeadIds(t).includes(viewer.uid))) ||
    (viewer.visibleTeamIds ?? []).includes(tid)
  )
  // Only people at or below the viewer's level (a super_admin who works in the team counts by HR level).
  const below = target.role === 'super_admin' ? levelOf(target) < levelOf(viewer) : canViewByLevel(viewer, target)
  if (inCharge && below) return true

  // The head of their department sees everyone in it, at or below the head's level.
  if (isDepartmentHead(viewer) && viewer.department && !!target.department) {
    return departmentScope(viewer.department).includes(target.department) && levelOf(target) <= levelOf(viewer)
  }
  return false
}

/**
 * The people a team lead / manager is responsible for: members of the teams they
 * lead or manage (plus any explicit visibleTeamIds and their own team), at or
 * below their own level. Used wherever "my team's report" is shown, so the home
 * dashboard, the roster and a course's results all mean the same set of people.
 *
 * A department head (JG11+) is responsible for the whole department, not only its teams: everyone
 * in it — with or without a team, whatever their app role (a super_admin who works in the
 * department included) — at or below the head's level.
 *
 * Only people who are Active now (not resigned, not yet started), and not maids or masseuses.
 */
export function managedMembers(
  user: Viewer | null | undefined,
  allUsers: readonly UserProfile[],
  teams: readonly Team[],
): UserProfile[] {
  if (!user) return []
  return managedMembersUnfiltered(user, allUsers, teams)
    .filter((u) => isActiveEmployee(u) && !isExcludedPosition(u.position))
}

export function managedMembersUnfiltered(
  user: Viewer,
  allUsers: readonly UserProfile[],
  teams: readonly Team[],
): UserProfile[] {
  const managed = managedTeamIds(user, allUsers, teams)
  // Only members at or below the viewer's level (a team_lead never sees the manager).
  // A super_admin who works in the team (Kanok, in People) is a member like any other to the manager
  // above them: seen by HR level, not turned away because the app role "super_admin" outranks
  // "manager". Only the person, never anything of the admin side — that stays out of these views.
  const canSee = (u: UserProfile) =>
    u.role === 'super_admin' && user.role !== 'super_admin' ? levelOf(u) < levelOf(user) : canViewByLevel(user, u)
  const byTeam = allUsers.filter((u) => u.uid !== user.uid && u.teamId && managed.has(u.teamId) && canSee(u))
  if (!isDepartmentHead(user) || !user.department) return byTeam

  const scope = new Set(departmentScope(user.department))
  const headLevel = levelOf(user)
  const everyone = new Map<string, UserProfile>(byTeam.map((u) => [u.uid, u]))
  for (const u of allUsers) {
    if (u.uid !== user.uid && !!u.department && scope.has(u.department) && levelOf(u) <= headLevel) everyone.set(u.uid, u)
  }
  return Array.from(everyone.values())
}
