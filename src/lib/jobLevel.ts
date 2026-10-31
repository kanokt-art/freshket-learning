import { ROLE_HIERARCHY, type UserProfile, type UserRole } from '@/types/user'

// Freshket Job-Grade ladder for the Head Office (HQ, non-tech) teams — the official Job Level table
// (JG14 = CEO … JG3 = Staff / Assistant, JG0 = Contract Staff). Used to order employees by seniority:
// who may see whom, and who a team's Manager / Team Lead pickers offer.
//
// Some HR exports carry the JG code in `rank` (JG9) and some a name (Manager, Senior Staff I); both
// resolve to the same grade here. Warehouse and tech ladders are not part of this table.
export interface JobLevelDef {
  grade: number      // comparable rank; higher = more senior
  jg: string         // 'JG14' … 'JG0'
  level: string      // canonical English level name
  th: string         // Thai definition
}

export const JOB_LEVELS: JobLevelDef[] = [
  { grade: 14, jg: 'JG14', level: 'Chief Executive Officer',               th: 'ประธานเจ้าหน้าที่บริหาร' },
  { grade: 13, jg: 'JG13', level: 'C-Level',                               th: 'ประธานเจ้าหน้าที่สายงาน' },
  { grade: 12, jg: 'JG12', level: 'Vice President',                        th: 'รองประธานเจ้าหน้าที่' },
  { grade: 11, jg: 'JG11', level: 'Head of Department',                    th: 'ผู้จัดการฝ่าย' },
  { grade: 10, jg: 'JG10', level: 'Senior Manager',                        th: 'ผู้จัดการแผนกอาวุโส' },
  { grade: 9,  jg: 'JG9',  level: 'Manager / Lead',                        th: 'ผู้จัดการแผนก' },
  { grade: 8,  jg: 'JG8',  level: 'Assistant Manager / Team Lead',         th: 'ผู้ช่วยผู้จัดการแผนก' },
  { grade: 7,  jg: 'JG7',  level: 'Senior Supervisor / Senior Specialist', th: 'หัวหน้างานอาวุโส / ผู้เชี่ยวชาญอาวุโส' },
  { grade: 6,  jg: 'JG6',  level: 'Supervisor / Specialist',               th: 'หัวหน้างาน / ผู้เชี่ยวชาญ' },
  { grade: 5,  jg: 'JG5',  level: 'Senior Officer / Executive',            th: 'เจ้าหน้าที่อาวุโส' },
  { grade: 4,  jg: 'JG4',  level: 'Officer',                               th: 'เจ้าหน้าที่ (ป.ตรี)' },
  { grade: 3,  jg: 'JG3',  level: 'Staff / Assistant',                     th: 'เจ้าหน้าที่ (ปวส.)' },
  { grade: 0,  jg: 'JG0',  level: 'Contract Staff',                        th: 'พนักงานสัญญาจ้าง' },
  { grade: -1, jg: '-',    level: 'Internship',                            th: 'นักศึกษาฝึกงาน' },
]

// Coarse fallback grade per role — used when rank/position can't be mapped, so
// the ladder still works from the reliable `role` field alone.
const ROLE_FALLBACK_GRADE: Record<UserRole, number> = {
  super_admin: 14,
  manager: 9,
  team_lead: 8,
  sale: 3,
}

// Keyword → grade, ordered most-specific first (so "senior manager" beats "manager", "assistant
// manager" beats "manager", "contract staff" beats "staff").
//
// HR's rank names that are not in the table ("Senior Staff I", "Staff - HQ I", "Supervisor III") are
// placed provisionally: Supervisor of any number = Supervisor / Specialist; Senior Staff = Senior
// Officer / Executive; Staff = Staff / Assistant. A JG code in `rank` always wins over these.
const KEYWORD_GRADES: { match: RegExp; grade: number }[] = [
  { match: /internship|intern|ฝึกงาน/, grade: -1 },
  { match: /\bceo\b|chief executive|ประธานเจ้าหน้าที่บริหาร/, grade: 14 },
  { match: /c-?level|ประธานเจ้าหน้าที่สายงาน/, grade: 13 },
  { match: /vice president|\bvp\b|รองประธาน/, grade: 12 },
  { match: /head of|หัวหน้าฝ่าย|ผู้จัดการฝ่าย/, grade: 11 },
  { match: /senior manager|ผู้จัดการ.*อาวุโส/, grade: 10 },
  { match: /assistant.*manager|team lead|ผู้ช่วยผู้จัดการ/, grade: 8 },
  { match: /manager|\blead\b|ผู้จัดการ/, grade: 9 },
  { match: /senior supervisor|senior specialist|หัวหน้างานอาวุโส|ผู้เชี่ยวชาญอาวุโส/, grade: 7 },
  { match: /supervisor|specialist|หัวหน้างาน|ผู้เชี่ยวชาญ/, grade: 6 },
  { match: /senior|executive|อาวุโส/, grade: 5 },
  { match: /officer|เจ้าหน้าที่/, grade: 4 },
  { match: /contract|สัญญาจ้าง|daily|รายวัน/, grade: 0 },
  { match: /staff|assistant|พนักงาน/, grade: 3 },
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

/** Job grade of Supervisor / Specialist (JG6): the lowest level that can lead a team. */
export const SUPERVISOR_GRADE = 6

/**
 * The person's level as HR recorded it — the rank (a "JG5" code or a name such as
 * "Assistant Manager"), else the position — with NO lift from their app role.
 *
 * jobGrade() above raises a team_lead to at least Assistant Manager because the role was
 * given by hand; that is right for who may see whom, and wrong for asking "is this person
 * actually a supervisor or above?" — a Staff-level employee given the team_lead role would
 * pass. The role is only the last resort, for someone whose rank and position say nothing.
 */
export function levelGrade(u: Pick<UserProfile, 'role' | 'rank' | 'position'>): number {
  const jg = /^\s*jg\s*(\d{1,2})\s*$/i.exec(u.rank ?? '')
  const fromRank = jg ? Number(jg[1]) : gradeFromText(u.rank)
  const resolved = fromRank ?? gradeFromText(u.position)
  return resolved ?? ROLE_FALLBACK_GRADE[u.role]
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
