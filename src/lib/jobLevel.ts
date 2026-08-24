import { ROLE_HIERARCHY, type UserProfile, type UserRole } from '@/types/user'

// Freshket Job-Grade ladder (JG0 = Daily staff … JG14 = CEO), from the official
// Job Level table. Used to order employees so a lower-level person cannot see a
// higher-level person's profile/history.
export interface JobLevelDef {
  grade: number      // comparable rank; higher = more senior
  jg: string         // 'JG14' … 'JG0'
  level: string      // canonical English level name
  th: string         // Thai definition
}

export const JOB_LEVELS: JobLevelDef[] = [
  { grade: 14, jg: 'JG14', level: 'CEO',                th: 'ประธานเจ้าหน้าที่บริหาร' },
  { grade: 13, jg: 'JG13', level: 'C-Level',            th: 'ประธานเจ้าหน้าที่สายงาน' },
  { grade: 12, jg: 'JG12', level: 'Vice President',     th: 'รองประธานเจ้าหน้าที่' },
  { grade: 11, jg: 'JG11', level: 'Head of Department', th: 'ผู้จัดการฝ่าย' },
  { grade: 10, jg: 'JG10', level: 'Senior Manager',     th: 'ผู้จัดการแผนกอาวุโส' },
  { grade: 9,  jg: 'JG9',  level: 'Manager / Lead',     th: 'ผู้จัดการแผนก' },
  { grade: 8,  jg: 'JG8',  level: 'Assistant Manager',  th: 'ผู้ช่วยผู้จัดการแผนก' },
  { grade: 7,  jg: 'JG7',  level: 'Senior Supervisor',  th: 'หัวหน้างานอาวุโส' },
  { grade: 6,  jg: 'JG6',  level: 'Supervisor II',      th: 'หัวหน้างาน II' },
  { grade: 5,  jg: 'JG5',  level: 'Supervisor I',       th: 'หัวหน้างาน I' },
  { grade: 4,  jg: 'JG4',  level: 'Leader',             th: 'หัวหน้ากลุ่มงาน' },
  { grade: 3,  jg: 'JG3',  level: 'Senior Master',      th: 'เจ้าหน้าที่อาวุโส' },
  { grade: 2,  jg: 'JG2',  level: 'Master',             th: 'เจ้าหน้าที่ / พนักงานคลังสินค้า' },
  { grade: 1,  jg: 'JG1',  level: 'Staff (Monthly)',    th: 'พนักงานคลังสินค้า (รายเดือน)' },
  { grade: 0,  jg: 'JG0',  level: 'Staff (Daily)',      th: 'พนักงานคลังสินค้า (รายวัน)' },
  { grade: -1, jg: '-',    level: 'Internship',         th: 'นักศึกษาฝึกงาน' },
]

// Coarse fallback grade per role — used when rank/position can't be mapped, so
// the ladder still works from the reliable `role` field alone.
const ROLE_FALLBACK_GRADE: Record<UserRole, number> = {
  super_admin: 14,
  manager: 9,
  team_lead: 8,
  sale: 1,
}

// Keyword → grade, ordered most-specific first (so "senior manager" beats
// "manager", "assistant manager" beats "manager", etc.).
const KEYWORD_GRADES: { match: RegExp; grade: number }[] = [
  { match: /internship|intern|ฝึกงาน/, grade: -1 },
  { match: /\bceo\b|ประธานเจ้าหน้าที่บริหาร/, grade: 14 },
  { match: /c-?level/, grade: 13 },
  { match: /vice president|\bvp\b|รองประธาน/, grade: 12 },
  { match: /head of|หัวหน้าฝ่าย|ผู้จัดการฝ่าย/, grade: 11 },
  { match: /senior manager|ผู้จัดการ.*อาวุโส/, grade: 10 },
  { match: /assistant.*manager|ผู้ช่วยผู้จัดการ/, grade: 8 },
  { match: /manager|ผู้จัดการ/, grade: 9 },
  { match: /senior supervisor|หัวหน้างานอาวุโส/, grade: 7 },
  { match: /supervisor\s*(ii|2)|หัวหน้างาน\s*2/, grade: 6 },
  { match: /supervisor|หัวหน้างาน/, grade: 5 },
  { match: /leader|lead|หัวหน้ากลุ่ม/, grade: 4 },
  { match: /senior master|senior|อาวุโส/, grade: 3 },
  { match: /master|เจ้าหน้าที่/, grade: 2 },
  { match: /staff.*month|รายเดือน/, grade: 1 },
  { match: /staff|daily|รายวัน/, grade: 0 },
]

function gradeFromText(text?: string): number | null {
  if (!text) return null
  const t = text.toLowerCase()
  for (const { match, grade } of KEYWORD_GRADES) if (match.test(t)) return grade
  return null
}

// A single comparable seniority number for a user. `rank` (from the HR export)
// is the most direct signal; `position` refines it; role is the safety net.
// The role floor guarantees a manager never ranks below a team_lead even if
// their free-text rank/position is missing or messy.
export function jobGrade(u: Pick<UserProfile, 'role' | 'rank' | 'position'>): number {
  const fromRank = gradeFromText(u.rank)
  const fromPos = gradeFromText(u.position)
  const roleFloorByRank: Partial<Record<UserRole, number>> = { manager: 9, team_lead: 8 }
  const floor = roleFloorByRank[u.role]
  const resolved = fromRank ?? fromPos
  if (resolved != null) return floor != null ? Math.max(resolved, floor) : resolved
  return ROLE_FALLBACK_GRADE[u.role]
}

// Whether `viewer` may see `member`: only members at or below the viewer's
// seniority. Role hierarchy is the hard gate (a team_lead never sees a manager),
// and job-grade refines ordering within the same role band.
export function canViewByLevel(
  viewer: Pick<UserProfile, 'role' | 'rank' | 'position'>,
  member: Pick<UserProfile, 'role' | 'rank' | 'position'>,
): boolean {
  if (ROLE_HIERARCHY[member.role] > ROLE_HIERARCHY[viewer.role]) return false
  return jobGrade(member) <= jobGrade(viewer)
}
