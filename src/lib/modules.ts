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
// added here. Sales/Key Account/Portfolio are the commercial teams the content
// is written for; People Experience is HR, who administer the platform.
//
// This is the single source of truth: the Employees filter, the org board and
// the course learner picker all read it, so adding a department here is the one
// edit needed to onboard it.
export const PHASE1_DEPARTMENTS = new Set([
  'Sales Management',
  'Key Account Management',
  'Portfolio Management',
  'People Experience',
])

// Modules enabled by default when a department has no explicit config.
// Empty on purpose: a department outside PHASE1_DEPARTMENTS gets nothing until
// it is rolled out. super_admin bypasses this entirely (see useModuleAccess).
export const DEFAULT_MODULES: ModuleId[] = []

export type ModuleAccessConfig = {
  departments: Record<string, ModuleId[]>
}
