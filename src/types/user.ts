export type UserRole = 'sale' | 'team_lead' | 'manager' | 'super_admin'

export interface Department {
  id: string
  name: string
  managerId?: string
}

export interface Team {
  id: string
  name: string
  departmentId?: string
  /** @deprecated superseded by managerIds — still read as a fallback for docs saved before multi-manager support */
  managerId?: string
  /** @deprecated superseded by teamLeadIds — still read as a fallback for docs saved before multi-team-lead support */
  teamLeadId?: string
  managerIds?: string[]
  teamLeadIds?: string[]
}

// A team can have any number of managers/team leads (or none). Reads fall back
// to the old singular field so docs saved before multi-manager support still
// resolve correctly; every write goes through the plural field from here on.
export function getTeamManagerIds(team: Pick<Team, 'managerId' | 'managerIds'>): string[] {
  return team.managerIds ?? (team.managerId ? [team.managerId] : [])
}
export function getTeamLeadIds(team: Pick<Team, 'teamLeadId' | 'teamLeadIds'>): string[] {
  return team.teamLeadIds ?? (team.teamLeadId ? [team.teamLeadId] : [])
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  role: UserRole
  teamId?: string       // team_lead / sale: which team they belong to
  managerId?: string    // sale / team_lead: who manages them
  createdAt: Date
  updatedAt: Date
}

// HR CSV "Status" column value, verbatim — kept as a raw string rather than a
// fixed union because the source export isn't a closed set (seen so far:
// Active, Resigned, "No show", "Exit This Month", and it has grown before).
// Only the literal value "Active" is treated as active; everything else,
// known or not, is not. Absent (undefined) means the record predates this
// field or wasn't sourced from the HR CSV — treated as active.
export type EmploymentStatus = string

export interface UserProfile extends AppUser {
  employeeId?: string
  displayNameEN?: string  // Full name in English from CSV col 5
  department?: string
  position?: string
  rank?: string           // Rank/Level from CSV e.g. "Manager", "Supervisor"
  nickname?: string
  startDate?: Date        // วันเข้างาน (hire date)
  lineManager?: string    // Line Manager name from CSV
  visibleTeamIds?: string[]  // undefined = see all; string[] = only these teams
  employmentStatus?: EmploymentStatus  // HR CSV col 1 — drives the Employees list filter
}

export const ROLE_LABELS: Record<UserRole, string> = {
  sale: 'User',
  team_lead: 'Team Lead',
  manager: 'Manager',
  super_admin: 'Super Admin',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  sale: 1,
  team_lead: 2,
  manager: 3,
  super_admin: 4,
}

export function canAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
