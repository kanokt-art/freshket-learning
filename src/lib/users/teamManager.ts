import { jobGrade } from '@/lib/jobLevel'
import { canAccess, type UserProfile } from '@/types/user'
import { isActiveEmployee } from '@/lib/users/active'

// Who the "Assign Manager" picker offers for a team.
//
// Any team, in any department, with no limit on how many teams one person manages:
//  · anyone at manager level or above — by role, or by job grade (a Vice President
//    whose role is still `sale` counts), whatever department they sit in;
//  · everyone in the Commercial department, whatever their level.
// People who have left are never offered.

/** The department whose people can manage any team. Must match the HR department name exactly. */
export const COMMERCIAL_DEPARTMENT = 'Commercial'

/** Job grade of "Manager / Lead" (JG9) — manager level and above. */
const MANAGER_GRADE = 9

export function canManageAnyTeam(
  u: Pick<UserProfile, 'role' | 'rank' | 'position' | 'department' | 'employmentStatus'>,
): boolean {
  if (!isActiveEmployee(u)) return false
  if (u.department === COMMERCIAL_DEPARTMENT) return true
  return canAccess(u.role, 'manager') || jobGrade(u) >= MANAGER_GRADE
}
