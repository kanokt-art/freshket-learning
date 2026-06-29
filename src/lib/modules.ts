// Module registry — single source of truth for all controllable feature modules.
// super_admin always has access to everything; this config applies to sale/team_lead/manager.

export type ModuleId =
  | 'lms'
  | 'shadow'
  | 'roleplay'
  | 'points'
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
  { id: 'points',     label: 'Points',          description: 'คะแนนสะสม Tier และ Leaderboard' },
  { id: 'sale_tools', label: 'Sale Tools',      description: 'เครื่องมือ ทรัพยากร และ New Joiner Hub' },
]

export const ALL_MODULE_IDS = MODULE_REGISTRY.map(m => m.id) as ModuleId[]

// Modules enabled by default when a department has no explicit config
export const DEFAULT_MODULES: ModuleId[] = ['lms', 'points']

export type ModuleAccessConfig = {
  departments: Record<string, ModuleId[]>
}
