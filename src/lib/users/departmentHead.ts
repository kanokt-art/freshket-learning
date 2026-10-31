import { levelGrade } from '@/lib/jobLevel'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { isActiveEmployee } from '@/lib/users/active'
import { COMMERCIAL_FAMILY } from '@/lib/users/teamsOfDepartment'
import type { UserProfile } from '@/types/user'

// Head of Department / VP and above (JG11+) head their whole department. Nobody assigns them:
// the level and the department decide, and they show on every team card of that department as
// a read-only line. They see every team of their own department (and only that — anything wider
// is granted person by person in Visibility settings).

/** Job grade of Head of Department (JG11): the lowest level that heads a department. */
export const DEPT_HEAD_GRADE = 11

/** Level bands for the team pickers; the Team Lead and Manager slots, then everyone below. */
export const TEAM_LEAD_BAND = { min: 6, max: 8 } as const
export const MANAGER_BAND = { min: 9, max: 10 } as const
export const MEMBER_MAX_GRADE = 5

type LevelFields = Pick<UserProfile, 'rank' | 'position'>

/**
 * The person's level from HR's rank / position only. The app role is left out on purpose:
 * a super_admin with no rank on file is not a department head.
 */
export function levelOf(u: LevelFields): number {
  return levelGrade({ role: 'sale', rank: u.rank, position: u.position })
}

export function isDepartmentHead(
  u: Pick<UserProfile, 'rank' | 'position' | 'department' | 'employmentStatus'>,
): boolean {
  if (!isActiveEmployee(u)) return false
  if (!u.department || !PHASE1_DEPARTMENTS.has(u.department)) return false
  return levelOf(u) >= DEPT_HEAD_GRADE
}

/**
 * The role a person acts under. A department head (JG11+) is always at least a manager: they sit at
 * the top of their department's team structure, so the app gives them manager access without anyone
 * setting it. It is worked out from level and department each time, not written to their record,
 * so it follows them if they move or leave. Never lifts anyone to super_admin.
 */
export function roleWithHeadFloor<R extends string>(
  role: R,
  u: Pick<UserProfile, 'rank' | 'position' | 'department' | 'employmentStatus'>,
): R | 'manager' {
  return (role === 'sale' || role === 'team_lead') && isDepartmentHead(u) ? 'manager' : role
}

/** The departments a head of `department` covers: Commercial covers the whole Commercial org chart. */
export function departmentScope(department: string): string[] {
  return department === 'Commercial' ? COMMERCIAL_FAMILY : [department]
}
