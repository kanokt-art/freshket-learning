import { levelGrade, SUPERVISOR_GRADE } from '@/lib/jobLevel'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { isActiveEmployee } from '@/lib/users/active'
import type { UserProfile } from '@/types/user'

// Who the Manager and Team Lead pickers offer for a team: a current employee of a
// department in the rollout whose LEVEL is Supervisor or above (Supervisor, Assistant
// Manager, Manager, and up).
//
// The same person can be offered for any team, with no limit on how many teams one
// person leads or manages. Level comes from HR's rank/position (see levelGrade), not
// from the app role, so a Staff-level employee who was given the team_lead role is not
// offered.
export function canLeadAnyTeam(
  u: Pick<UserProfile, 'role' | 'rank' | 'position' | 'department' | 'employmentStatus'>,
): boolean {
  if (!isActiveEmployee(u)) return false
  if (!u.department || !PHASE1_DEPARTMENTS.has(u.department)) return false
  return levelGrade(u) >= SUPERVISOR_GRADE
}
