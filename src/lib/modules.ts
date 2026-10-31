// Module registry — single source of truth for all controllable feature modules.
// super_admin always has access to everything; this config applies to sale/team_lead/manager.

export type ModuleId =
  | 'lms'
  | 'shadow'
  | 'roleplay'
  | 'sale_tools'

export interface ModuleDef {
  id: ModuleId
  label: string
  description: string
}

export const MODULE_REGISTRY: ModuleDef[] = [
  { id: 'lms',        label: 'LMS & หลักสูตร',  description: 'เข้าถึงหลักสูตร แบบทดสอบ และประวัติการเรียน' },
  { id: 'shadow',     label: 'Shadow Visit',    description: 'บันทึกการออกเยี่ยมลูกค้ากับ Senior' },
  { id: 'roleplay',   label: 'Role Play',       description: 'ฝึกซ้อมการขายและ Role Play' },
  { id: 'sale_tools', label: 'Tools',           description: 'เครื่องมือ ทรัพยากร และ New Joiner Hub' },
]

export const ALL_MODULE_IDS = MODULE_REGISTRY.map(m => m.id) as ModuleId[]

// ── Phase 1 rollout ──────────────────────────────────────────────────────────
// The platform is live for these departments only. Everyone else can still sign
// in — they keep their profile — but see no modules until their department is
// added here. Sales/Key Account/Portfolio/Commercial are the commercial teams the content
// is written for; People Experience is HR, who administer the platform.
//
// This is the single source of truth: the Employees filter, the org board and
// the course learner picker all read it, so adding a department here is the one
// edit needed to onboard it.
//
// The list is set by a super_admin in Module Settings (stored in appConfig/targetDepartments) and
// loaded into this set on both sides — the browser and every API request — so every check that
// reads it follows the setting. Until a setting exists (and if it cannot be read) these defaults
// stand. A department that is not on the list: its people are not synced in by the HR import, are
// not listed anywhere, and see no modules; they can still sign in.
export const DEFAULT_TARGET_DEPARTMENTS = [
  'Sales Management',
  'Key Account Management',
  'Portfolio Management',
  'Commercial',
  'People Experience',
]
export const PHASE1_DEPARTMENTS = new Set<string>(DEFAULT_TARGET_DEPARTMENTS)

/** The appConfig document that holds the switched-on departments: { departments: string[] }. */
export const TARGET_DEPARTMENTS_DOC = 'targetDepartments'

/** The departments a stored setting names; the defaults when there is no usable setting. */
export function parseTargetDepartments(doc: unknown): string[] {
  const list = (doc as { departments?: unknown } | null | undefined)?.departments
  if (!Array.isArray(list)) return [...DEFAULT_TARGET_DEPARTMENTS]
  return Array.from(new Set(list.filter((d): d is string => typeof d === 'string' && d.trim() !== '').map((d) => d.trim())))
}

/** Replace the live target list in place, so everything holding PHASE1_DEPARTMENTS sees it. */
export function setTargetDepartments(names: readonly string[]): void {
  PHASE1_DEPARTMENTS.clear()
  names.forEach((n) => PHASE1_DEPARTMENTS.add(n))
}

/** Is this department in the current rollout? */
export function isTargetDepartment(department?: string | null): boolean {
  return !!department && PHASE1_DEPARTMENTS.has(department)
}

// Modules enabled by default when a department has no explicit config.
// Empty on purpose: a department outside PHASE1_DEPARTMENTS gets nothing until
// it is rolled out. super_admin bypasses this entirely (see useModuleAccess).
export const DEFAULT_MODULES: ModuleId[] = []

export type ModuleAccessConfig = {
  departments: Record<string, ModuleId[]>
}
