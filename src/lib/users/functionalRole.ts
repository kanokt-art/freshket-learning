import { isDepartmentHead } from '@/lib/users/departmentHead'
import { getTeamLeadIds, getTeamManagerIds, type Team, type UserProfile } from '@/types/user'

// What someone IS in the team structure, as opposed to the app role stored on their record. The stored
// role can be left over from an old import or a manual grant (a Staff-level person given team_lead), so
// a badge that says "Team Lead" has to come from team management: they are set as a team's Team Lead or
// Manager, or they are a department head. Anyone else is a member.

export type FunctionalRole = 'super_admin' | 'head' | 'manager' | 'team_lead' | 'member'

export const FUNCTIONAL_ROLE_LABELS: Record<FunctionalRole, string> = {
  super_admin: 'Super Admin',
  head: 'Head of Department',
  manager: 'Manager',
  team_lead: 'Team Lead',
  member: 'Member',
}

export function functionalRole(
  person: Pick<UserProfile, 'uid' | 'role' | 'rank' | 'position' | 'department' | 'employmentStatus'>,
  teams: readonly Team[],
): FunctionalRole {
  if (person.role === 'super_admin') return 'super_admin'
  if (isDepartmentHead(person)) return 'head'
  if (teams.some((t) => getTeamManagerIds(t).includes(person.uid))) return 'manager'
  if (teams.some((t) => getTeamLeadIds(t).includes(person.uid))) return 'team_lead'
  return 'member'
}
