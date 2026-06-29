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
  managerId?: string
  teamLeadId?: string
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

export interface UserProfile extends AppUser {
  employeeId?: string
  department?: string
  position?: string
  rank?: string         // Rank/Level from CSV e.g. "Manager", "Supervisor"
  nickname?: string
  startDate?: Date      // วันเข้างาน (hire date)
  lineManager?: string  // Line Manager name from CSV
  visibleTeamIds?: string[]  // undefined = see all; string[] = only these teams
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
