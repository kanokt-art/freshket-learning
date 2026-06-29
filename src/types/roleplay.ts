import type { UserRole } from './user'

// ── Topic definitions ─────────────────────────────────────────────────────────

export const ROLEPLAY_TOPICS = [
  { key: 'prep_research',      label: 'เตรียมข้อมูลลูกค้า / ธุรกิจ',       group: 'Preparation' },
  { key: 'prep_key_to_win',    label: 'วาง Key to Win และเป้าหมาย',         group: 'Preparation' },
  { key: 'greet_rapport',      label: 'ทักทายสุภาพ / ปกป้องแบรนด์',        group: 'Greeting' },
  { key: 'greet_intro',        label: 'แนะนำตัว / บริษัท',                 group: 'Greeting' },
  { key: 'greet_freshket',     label: 'ลูกค้าเข้าใจ Freshket',             group: 'Greeting' },
  { key: 'disc_check',         label: 'Check',                               group: 'Discovery Flow' },
  { key: 'disc_order',         label: 'Order',                               group: 'Discovery Flow' },
  { key: 'disc_receive',       label: 'Receive',                             group: 'Discovery Flow' },
  { key: 'disc_pay',           label: 'Pay',                                 group: 'Discovery Flow' },
  { key: 'disc_billing',       label: 'Billing',                             group: 'Discovery Flow' },
  { key: 'disc_product_pain',  label: 'เจาะข้อมูลสินค้า / ต้องการค้าขายเพิ่ม',                              group: 'Discovery Flow' },
  { key: 'disc_active',        label: 'Active Listening: สรุปสิ่งที่เข้าใจ, follow-up ตามที่ผู้สอบตอบ',    group: 'Active Listening' },
  { key: 'pain_insight',       label: 'Pain Point: ถามต่อเพื่อ insight ลึก (incomplete case, yield, billing)', group: 'Active Listening' },
  { key: 'insight_capture',    label: 'Insight Capture: สรุป painpoint และแสดงว่าเข้าใจ process ของร้าน',  group: 'Active Listening' },
  { key: 'sol_pitch',          label: 'เสนอสินค้าตรง Pain',                 group: 'Solution' },
  { key: 'sol_customize',      label: 'ปรับให้เหมาะสมบริบท',               group: 'Solution' },
  { key: 'sol_knowledge',      label: 'ใช้ความรู้สึกลูกค้า',               group: 'Solution' },
  { key: 'close_next',         label: 'เดินหน้าวันนี้',                     group: 'Closing' },
  { key: 'close_commit',       label: 'ขอ Commitment ตรงๆ',                 group: 'Closing' },
  { key: 'close_pro',          label: 'ติดการขายมืออาชีพ',                 group: 'Closing' },
  { key: 'tools_explain',      label: 'อธิบายการใช้งานระบบ / ลงทะเบียน',   group: 'Tools' },
  { key: 'tools_line_oa',      label: 'สื่อสารผ่าน LINE OA',               group: 'Tools' },
  { key: 'fu_results',         label: 'มีผลติดตาม',                         group: 'Follow Up' },
  { key: 'fu_pain',            label: 'ใช้ Pain หลังขาย',                   group: 'Follow Up' },
  { key: 'fu_remember',        label: 'ลูกค้าจำได้',                        group: 'Follow Up' },
] as const

export type RoleplayTopicKey = (typeof ROLEPLAY_TOPICS)[number]['key']

// 8 radar chart axes
export const RADAR_GROUPS = [
  { label: 'Preparation',    shortLabel: 'Preparation',  keys: ['prep_research', 'prep_key_to_win'] },
  { label: 'Greeting',       shortLabel: 'Greeting',     keys: ['greet_rapport', 'greet_intro', 'greet_freshket'] },
  { label: 'Discovery Flow', shortLabel: 'Discovery',    keys: ['disc_check', 'disc_order', 'disc_receive', 'disc_pay', 'disc_billing', 'disc_product_pain'] },
  { label: 'Active Listening', shortLabel: 'Active Listening', keys: ['disc_active', 'pain_insight', 'insight_capture'] },
  { label: 'Solution',       shortLabel: 'Solution',     keys: ['sol_pitch', 'sol_customize', 'sol_knowledge'] },
  { label: 'Closing',        shortLabel: 'Closing',      keys: ['close_next', 'close_commit', 'close_pro'] },
  { label: 'Tools',          shortLabel: 'Tools',        keys: ['tools_explain', 'tools_line_oa'] },
  { label: 'Follow Up',      shortLabel: 'Follow Up',    keys: ['fu_results', 'fu_pain', 'fu_remember'] },
] as const

// ── Data interfaces ───────────────────────────────────────────────────────────

export interface RoleplayTopicScore {
  key: string
  rating: number   // 1–10
  comment: string
}

export interface RoleplayAssessment {
  id: string
  createdAt: Date
  assessorUid: string
  assessorName: string
  assessorRole: UserRole
  subjectUid: string
  subjectName: string
  subjectTeam: string
  round: number
  type: 'pre' | 'post'
  overallNote: string
  topics: RoleplayTopicScore[]
}
