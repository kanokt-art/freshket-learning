'use client'

import { useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers } from '@/hooks/useFirestore'
import { canAccess } from '@/types/user'
import type { UserProfile } from '@/types/user'
import { Header } from '@/components/layout/Header'
import {
  ROLEPLAY_TOPICS,
  RADAR_GROUPS,
  type RoleplayAssessment,
  type RoleplayTopicScore,
} from '@/types/roleplay'

// ── Demo data ─────────────────────────────────────────────────────────────────

function makeTopic(key: string, rating: number, comment = ''): RoleplayTopicScore {
  return { key, rating, comment }
}

const DEMO_ASSESSMENTS: RoleplayAssessment[] = [
  // ── mock-sale-01 (สมชาย): Pre 1/2/3 + Post 1/2/3 ──────────────────────────
  {
    id: 'rp-001',
    createdAt: new Date('2026-01-23T14:23:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 1,
    type: 'pre',
    overallNote: 'หา decision maker ok แต่ยังขาด structure ในการนำเสนอ ต้องฝึก flow การเชื่อมโยง pain กับ solution',
    topics: [
      makeTopic('prep_research', 8), makeTopic('prep_key_to_win', 7),
      makeTopic('greet_rapport', 8), makeTopic('greet_intro', 7), makeTopic('greet_freshket', 8),
      makeTopic('disc_check', 7), makeTopic('disc_order', 8), makeTopic('disc_receive', 7),
      makeTopic('disc_pay', 7), makeTopic('disc_billing', 6),
      makeTopic('disc_product_pain', 8, 'ถามดี แต่ยังไม่ลึกพอ'),
      makeTopic('disc_active', 8),
      makeTopic('pain_insight', 8), makeTopic('insight_capture', 8, 'สรุปได้แต่ยังไม่ connect กับ solution'),
      makeTopic('sol_pitch', 6, 'crack ไม่เจอ ต้องอธิบาย structure concept'),
      makeTopic('sol_customize', 8), makeTopic('sol_knowledge', 8),
      makeTopic('close_next', 8), makeTopic('close_commit', 7), makeTopic('close_pro', 6),
      makeTopic('tools_explain', 7), makeTopic('tools_line_oa', 7),
      makeTopic('fu_results', 7), makeTopic('fu_pain', 6), makeTopic('fu_remember', 6),
    ],
  },
  {
    id: 'rp-007',
    createdAt: new Date('2026-01-30T10:00:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 1,
    type: 'post',
    overallNote: 'หลังอบรมรอบแรกพัฒนาขึ้นชัดเจน Discovery แม่นขึ้น ต้องต่อยอด Closing ให้มั่นใจกว่านี้',
    topics: [
      makeTopic('prep_research', 8), makeTopic('prep_key_to_win', 8),
      makeTopic('greet_rapport', 8), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 8),
      makeTopic('disc_check', 8), makeTopic('disc_order', 8), makeTopic('disc_receive', 8),
      makeTopic('disc_pay', 8), makeTopic('disc_billing', 7),
      makeTopic('disc_product_pain', 8, 'ถามลึกขึ้น เริ่มเจอ pain จริง'),
      makeTopic('disc_active', 8),
      makeTopic('pain_insight', 8), makeTopic('insight_capture', 8),
      makeTopic('sol_pitch', 7, 'เชื่อมโยง pain ได้บ้าง ยังไม่เด็ด'),
      makeTopic('sol_customize', 8), makeTopic('sol_knowledge', 8),
      makeTopic('close_next', 8), makeTopic('close_commit', 8), makeTopic('close_pro', 7),
      makeTopic('tools_explain', 8), makeTopic('tools_line_oa', 8),
      makeTopic('fu_results', 8), makeTopic('fu_pain', 7), makeTopic('fu_remember', 7),
    ],
  },
  {
    id: 'rp-005',
    createdAt: new Date('2026-02-10T09:30:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 2,
    type: 'pre',
    overallNote: 'เริ่มต้นรอบ 2 ดีขึ้น Greeting ฉะฉาน Discovery มีโครงสร้างแล้ว แต่ Solution ยังขาดความมั่นใจ',
    topics: [
      makeTopic('prep_research', 8), makeTopic('prep_key_to_win', 8),
      makeTopic('greet_rapport', 8), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 8),
      makeTopic('disc_check', 8), makeTopic('disc_order', 8), makeTopic('disc_receive', 8),
      makeTopic('disc_pay', 7), makeTopic('disc_billing', 7),
      makeTopic('disc_product_pain', 8, 'ถามดีขึ้น มี follow-up'),
      makeTopic('disc_active', 8),
      makeTopic('pain_insight', 7), makeTopic('insight_capture', 7),
      makeTopic('sol_pitch', 7, 'เชื่อมโยงได้บ้าง ยังขาด hook'),
      makeTopic('sol_customize', 8), makeTopic('sol_knowledge', 8),
      makeTopic('close_next', 8), makeTopic('close_commit', 7), makeTopic('close_pro', 7),
      makeTopic('tools_explain', 8), makeTopic('tools_line_oa', 8),
      makeTopic('fu_results', 8), makeTopic('fu_pain', 7), makeTopic('fu_remember', 7),
    ],
  },
  {
    id: 'rp-002',
    createdAt: new Date('2026-02-17T14:55:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 2,
    type: 'post',
    overallNote: 'พัฒนาดีขึ้นมาก โดยเฉพาะ Discovery และ Solution Pitch เชื่อมโยง pain ได้แม่นขึ้น',
    topics: [
      makeTopic('prep_research', 8), makeTopic('prep_key_to_win', 7),
      makeTopic('greet_rapport', 8), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 8),
      makeTopic('disc_check', 8), makeTopic('disc_order', 9), makeTopic('disc_receive', 8),
      makeTopic('disc_pay', 8), makeTopic('disc_billing', 7),
      makeTopic('disc_product_pain', 9, 'เจาะลึกได้ดีขึ้นมาก'),
      makeTopic('disc_active', 9, 'Active listening ดีขึ้นชัดเจน'),
      makeTopic('pain_insight', 9), makeTopic('insight_capture', 9),
      makeTopic('sol_pitch', 8, 'เชื่อมโยง pain ได้ดี'),
      makeTopic('sol_customize', 9), makeTopic('sol_knowledge', 9),
      makeTopic('close_next', 9), makeTopic('close_commit', 8), makeTopic('close_pro', 8),
      makeTopic('tools_explain', 9), makeTopic('tools_line_oa', 8),
      makeTopic('fu_results', 9), makeTopic('fu_pain', 8), makeTopic('fu_remember', 8),
    ],
  },
  {
    id: 'rp-006',
    createdAt: new Date('2026-03-03T09:00:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 3,
    type: 'pre',
    overallNote: 'รอบ 3 เข้าสู่ระดับ advance แล้ว ทุก section แม่น ต้องขัดเกลา Closing และ Follow Up ให้สม่ำเสมอ',
    topics: [
      makeTopic('prep_research', 9), makeTopic('prep_key_to_win', 8),
      makeTopic('greet_rapport', 9), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 9),
      makeTopic('disc_check', 8), makeTopic('disc_order', 9), makeTopic('disc_receive', 8),
      makeTopic('disc_pay', 8), makeTopic('disc_billing', 7),
      makeTopic('disc_product_pain', 9, 'เจาะ pain ได้ลึก สม่ำเสมอ'),
      makeTopic('disc_active', 9),
      makeTopic('pain_insight', 8), makeTopic('insight_capture', 8),
      makeTopic('sol_pitch', 8, 'นำเสนอมั่นใจ hook ดี'),
      makeTopic('sol_customize', 9), makeTopic('sol_knowledge', 9),
      makeTopic('close_next', 8), makeTopic('close_commit', 8), makeTopic('close_pro', 8),
      makeTopic('tools_explain', 9), makeTopic('tools_line_oa', 9),
      makeTopic('fu_results', 8), makeTopic('fu_pain', 8), makeTopic('fu_remember', 8),
    ],
  },
  {
    id: 'rp-008',
    createdAt: new Date('2026-03-15T14:00:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-01',
    subjectName: 'สมชาย จันทร์ดี',
    subjectTeam: 'ทีม Sale A',
    round: 3,
    type: 'post',
    overallNote: 'ยอดเยี่ยม! ทุก section สมบูรณ์ระดับ Pro พร้อม Field จริงแล้ว ต้องรักษา Consistency',
    topics: [
      makeTopic('prep_research', 9), makeTopic('prep_key_to_win', 9),
      makeTopic('greet_rapport', 10), makeTopic('greet_intro', 9), makeTopic('greet_freshket', 9),
      makeTopic('disc_check', 9), makeTopic('disc_order', 10), makeTopic('disc_receive', 9),
      makeTopic('disc_pay', 9), makeTopic('disc_billing', 9),
      makeTopic('disc_product_pain', 10, 'Master level — เจาะ pain แล้วปิดในทันที'),
      makeTopic('disc_active', 10, 'Active listening ระดับ Pro'),
      makeTopic('pain_insight', 9), makeTopic('insight_capture', 9),
      makeTopic('sol_pitch', 9, 'Hook แม่น connect pain ทันที'),
      makeTopic('sol_customize', 10), makeTopic('sol_knowledge', 9),
      makeTopic('close_next', 9), makeTopic('close_commit', 9), makeTopic('close_pro', 9),
      makeTopic('tools_explain', 9), makeTopic('tools_line_oa', 9),
      makeTopic('fu_results', 9), makeTopic('fu_pain', 9), makeTopic('fu_remember', 9),
    ],
  },
  {
    id: 'rp-003',
    createdAt: new Date('2026-01-23T14:23:00'),
    assessorUid: 'mock-tl-01',
    assessorName: 'ประสิทธิ์ วงศ์ใหม่',
    assessorRole: 'team_lead',
    subjectUid: 'mock-sale-02',
    subjectName: 'ปริยา อ่อนหวาน',
    subjectTeam: 'ทีม Sale A',
    round: 1,
    type: 'pre',
    overallNote: 'ยังตามทำตามคำมากเกินๆ ไม่รู้ painpoint ลูกค้า เลยไม่ค่อยต่าง ต้องฝึก Discovery ให้มากขึ้น',
    topics: [
      makeTopic('prep_research', 7), makeTopic('prep_key_to_win', 5),
      makeTopic('greet_rapport', 7), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 7),
      makeTopic('disc_check', 7), makeTopic('disc_order', 6), makeTopic('disc_receive', 6),
      makeTopic('disc_pay', 5), makeTopic('disc_billing', 6),
      makeTopic('disc_product_pain', 4, 'ไม่ถามลึกพอ'),
      makeTopic('disc_active', 6, 'ยังไม่ค่อย follow-up'),
      makeTopic('pain_insight', 4), makeTopic('insight_capture', 4),
      makeTopic('sol_pitch', 4, 'ยังไม่ connect กับ pain'),
      makeTopic('sol_customize', 5), makeTopic('sol_knowledge', 7),
      makeTopic('close_next', 5), makeTopic('close_commit', 4), makeTopic('close_pro', 4),
      makeTopic('tools_explain', 7), makeTopic('tools_line_oa', 7),
      makeTopic('fu_results', 7), makeTopic('fu_pain', 4), makeTopic('fu_remember', 6),
    ],
  },
  {
    id: 'rp-004',
    createdAt: new Date('2026-01-14T15:12:00'),
    assessorUid: 'mock-mgr-01',
    assessorName: 'วันชัย สมใจ',
    assessorRole: 'manager',
    subjectUid: 'mock-sale-03',
    subjectName: 'ธนกร เพชรงาม',
    subjectTeam: 'ทีม Sale B',
    round: 1,
    type: 'pre',
    overallNote: 'เริ่มต้นดีแต่ยังขาด hook ใน Solution Pitch ต้องทำงานเรื่อง Closing ให้มากขึ้น',
    topics: [
      makeTopic('prep_research', 7), makeTopic('prep_key_to_win', 7),
      makeTopic('greet_rapport', 6), makeTopic('greet_intro', 8), makeTopic('greet_freshket', 7),
      makeTopic('disc_check', 7), makeTopic('disc_order', 7), makeTopic('disc_receive', 7),
      makeTopic('disc_pay', 7), makeTopic('disc_billing', 5),
      makeTopic('disc_product_pain', 6), makeTopic('disc_active', 6),
      makeTopic('pain_insight', 6), makeTopic('insight_capture', 6),
      makeTopic('sol_pitch', 7), makeTopic('sol_customize', 6), makeTopic('sol_knowledge', 7),
      makeTopic('close_next', 5), makeTopic('close_commit', 6), makeTopic('close_pro', 6),
      makeTopic('tools_explain', 7), makeTopic('tools_line_oa', 7),
      makeTopic('fu_results', 7), makeTopic('fu_pain', 6), makeTopic('fu_remember', 6),
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 8) return 'text-freshket-600'
  if (s >= 6) return 'text-amber-600'
  return 'text-rose-500'
}

function scoreBg(s: number) {
  if (s >= 8) return 'bg-freshket-500'
  if (s >= 6) return 'bg-amber-400'
  return 'bg-rose-400'
}

function avgTopics(topics: RoleplayTopicScore[], keys: readonly string[]) {
  const vals = keys.map(k => topics.find(t => t.key === k)?.rating ?? 0).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function overallAvg(topics: RoleplayTopicScore[]) {
  const vals = topics.map(t => t.rating).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function fmt(d: Date) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function calcTenure(startDate: Date | undefined | null): string {
  if (!startDate) return '—'
  const start = startDate instanceof Date ? startDate : new Date(startDate as unknown as string)
  if (isNaN(start.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days = now.getDate() - start.getDate()
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate() }
  if (months < 0) { years--; months += 12 }
  return `${years}.${String(months).padStart(2, '0')}.${String(days).padStart(2, '0')}`
}

const DEPT_COLORS = [
  'bg-emerald-100 text-emerald-800',
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-cyan-100 text-cyan-800',
  'bg-rose-100 text-rose-800',
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-lime-100 text-lime-800',
  'bg-sky-100 text-sky-800',
]
function deptColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return DEPT_COLORS[h % DEPT_COLORS.length]
}

function SortIcon({ field, current, dir }: { field: string; current: string; dir: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col ml-1 gap-px leading-none">
      <svg className={`size-2 ${current === field && dir === 'asc' ? 'text-freshket-500' : 'text-gray-300'}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L10 6H0z"/></svg>
      <svg className={`size-2 ${current === field && dir === 'desc' ? 'text-freshket-500' : 'text-gray-300'}`} viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0h10z"/></svg>
    </span>
  )
}

// ── Radar Chart (pure SVG) ────────────────────────────────────────────────────

// Pre=blue, Post=freshket-green (for Overall dual-polygon view)
const RADAR_COLORS = ['#3b82f6', '#00ce7c', '#f59e0b']

// Axis text colors — one per radar group (8 groups)
const AXIS_TEXT_COLORS = [
  '#2563eb', // blue    — Preparation
  '#7c3aed', // violet  — Greeting
  '#0369a1', // sky     — Discovery Flow
  '#0891b2', // cyan    — Active Listening
  '#059669', // emerald — Solution
  '#d97706', // amber   — Closing
  '#e11d48', // rose    — Tools
  '#6d28d9', // purple  — Follow Up
]

// ── Radar Chart (octagon, 8 axes) ─────────────────────────────────────────────
function RadarChart({ assessments, colors = RADAR_COLORS }: {
  assessments: RoleplayAssessment[]
  colors?: string[]
}) {
  if (!assessments.length) return null

  const cx = 210, cy = 200, maxR = 90
  const n = RADAR_GROUPS.length  // 8

  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  })
  const poly = (scores: number[]) =>
    scores.map((s, i) => pt(i, (s / 10) * maxR)).map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ') + 'Z'

  const gridPcts = [0.2, 0.4, 0.6, 0.8, 1.0]
  const gridPolys = gridPcts.map(pct =>
    RADAR_GROUPS.map((_, i) => pt(i, maxR * pct)).map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ') + 'Z'
  )

  const showLegend = assessments.length > 1

  return (
    <svg viewBox="20 55 390 300" className="w-full">
      {/* Chart area fill */}
      <path d={gridPolys[4]} fill="#f8fafc" />
      {/* Grid rings */}
      {gridPolys.map((d, i) => (
        <path key={i} d={d} fill="none"
          stroke={i === 4 ? '#d1d5db' : '#e5e7eb'}
          strokeWidth={i === 4 ? '1' : '0.75'} />
      ))}
      {/* Axis spokes */}
      {RADAR_GROUPS.map((_, i) => {
        const outer = pt(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#e5e7eb" strokeWidth="0.75" />
      })}
      {/* Scale value labels along top axis (i=0) */}
      {[2, 4, 6, 8, 10].map((v, idx) => {
        const p = pt(0, maxR * gridPcts[idx])
        return (
          <text key={idx} x={p.x + 4} y={p.y + 1} fontSize="7" fill="#cbd5e1"
            fontFamily="Inter, sans-serif">
            {v}
          </text>
        )
      })}

      {/* Data polygons with vertex dots */}
      {assessments.slice(0, 2).map((a, ai) => {
        const scores = RADAR_GROUPS.map(g => avgTopics(a.topics, g.keys))
        const color = colors[ai] ?? RADAR_COLORS[ai] ?? '#2563eb'
        return (
          <g key={a.id}>
            <path d={poly(scores)} fill={`${color}1a`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
            {scores.map((s, i) => {
              if (s <= 0) return null
              const vp = pt(i, (s / 10) * maxR)
              return <circle key={i} cx={vp.x} cy={vp.y} r="3.5" fill={color} stroke="white" strokeWidth="1.5" />
            })}
          </g>
        )
      })}

      {/* Legend (dual polygon only) */}
      {showLegend && (() => {
        const totalW = assessments.slice(0, 2).reduce((acc) => acc + 75, 0) - 10
        const startX = cx - totalW / 2
        return (
          <g>
            {assessments.slice(0, 2).map((a, ai) => {
              const color = colors[ai] ?? RADAR_COLORS[ai] ?? '#2563eb'
              const x = startX + ai * 80
              const y = cy + maxR + 38
              return (
                <g key={ai}>
                  <rect x={x} y={y} width={24} height={10} rx="2"
                    fill={`${color}1a`} stroke={color} strokeWidth="1.5" />
                  <text x={x + 29} y={y + 8} fontSize="9" fill="#64748b" fontFamily="Inter, sans-serif">
                    {a.type === 'pre' ? 'Pre Avg' : 'Post Avg'}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })()}

      {/* Axis labels */}
      {RADAR_GROUPS.map((g, i) => {
        const p = pt(i, maxR + 24)
        const anchor = Math.abs(p.x - cx) < 10 ? 'middle' : p.x > cx ? 'start' : 'end'
        return (
          <text key={i} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle"
            fontSize="9.5" fill={AXIS_TEXT_COLORS[i]}
            fontFamily="Noto Sans Thai, Inter, sans-serif" fontWeight="700">
            {g.shortLabel}
          </text>
        )
      })}
    </svg>
  )
}

// ── Score dots input ──────────────────────────────────────────────────────────

function ScoreDots({ value, onChange, disabled }: { value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          type="button"
          key={n}
          disabled={disabled}
          onClick={() => onChange?.(n)}
          className={`size-7 rounded-full text-xs font-bold transition-all ${disabled ? 'cursor-default' : 'cursor-pointer'} ${
            n <= value
              ? n <= 3 ? 'bg-rose-400 text-white shadow-sm'
                : n <= 6 ? 'bg-amber-400 text-white shadow-sm'
                : 'bg-freshket-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ── Audit log type ────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string
  timestamp: Date
  actorName: string
  actorRole: string
  action: 'delete' | 'edit'
  assessmentId: string
  subjectName: string
  round: number
  type: 'pre' | 'post'
}

// ── Assessment Form Modal ─────────────────────────────────────────────────────

interface FormState {
  subjectUid: string
  subjectName: string
  subjectTeam: string
  type: 'pre' | 'post'
  overallNote: string
  ratings: Record<string, number>
  comments: Record<string, string>
}

function AssessmentModal({
  members,
  assessments,
  editAssessment,
  onClose,
  onSave,
}: {
  members: UserProfile[]
  assessments: RoleplayAssessment[]
  editAssessment?: RoleplayAssessment
  onClose: () => void
  onSave: (a: RoleplayAssessment) => void
}) {
  const isEdit = !!editAssessment
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState>(() => {
    if (editAssessment) {
      return {
        subjectUid: editAssessment.subjectUid,
        subjectName: editAssessment.subjectName,
        subjectTeam: editAssessment.subjectTeam,
        type: editAssessment.type,
        overallNote: editAssessment.overallNote,
        ratings: Object.fromEntries(editAssessment.topics.map(t => [t.key, t.rating])),
        comments: Object.fromEntries(editAssessment.topics.map(t => [t.key, t.comment])),
      }
    }
    return {
      subjectUid: '',
      subjectName: '',
      subjectTeam: '',
      type: 'pre',
      overallNote: '',
      ratings: Object.fromEntries(ROLEPLAY_TOPICS.map(t => [t.key, 5])),
      comments: Object.fromEntries(ROLEPLAY_TOPICS.map(t => [t.key, ''])),
    }
  })
  const [step, setStep] = useState<'select' | 'score'>(isEdit ? 'score' : 'select')

  // Auto-compute round: count existing assessments of same type for this subject + 1
  const autoRound = useMemo(() => {
    if (isEdit) return editAssessment.round
    if (!form.subjectUid) return 1
    return assessments.filter(a => a.subjectUid === form.subjectUid && a.type === form.type).length + 1
  }, [assessments, form.subjectUid, form.type, isEdit, editAssessment])

  const filtered = members.filter(m =>
    (m.displayName + (m.nickname ?? '')).toLowerCase().includes(search.toLowerCase())
  )

  function selectMember(m: UserProfile) {
    setForm(f => ({ ...f, subjectUid: m.uid, subjectName: m.displayName, subjectTeam: m.teamId ?? '' }))
    setStep('score')
  }

  function setRating(key: string, v: number) {
    setForm(f => ({ ...f, ratings: { ...f.ratings, [key]: v } }))
  }
  function setComment(key: string, v: string) {
    setForm(f => ({ ...f, comments: { ...f.comments, [key]: v } }))
  }

  function handleSave() {
    if (!form.subjectUid) return
    const assessment: RoleplayAssessment = {
      id: editAssessment?.id ?? 'rp-' + Date.now(),
      createdAt: editAssessment?.createdAt ?? new Date(),
      assessorUid: editAssessment?.assessorUid ?? 'current-user',
      assessorName: editAssessment?.assessorName ?? 'คุณ',
      assessorRole: editAssessment?.assessorRole ?? 'team_lead',
      subjectUid: form.subjectUid,
      subjectName: form.subjectName,
      subjectTeam: form.subjectTeam,
      round: autoRound,
      type: form.type,
      overallNote: form.overallNote,
      topics: ROLEPLAY_TOPICS.map(t => ({
        key: t.key,
        rating: form.ratings[t.key] ?? 5,
        comment: form.comments[t.key] ?? '',
      })),
    }
    onSave(assessment)
    onClose()
  }

  const groups = Array.from(new Set(ROLEPLAY_TOPICS.map(t => t.group)))

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl animate-pop-in flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-gray-100 flex items-center justify-between z-10">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isEdit ? 'แก้ไข Roleplay Assessment' : 'สร้าง Roleplay Assessment'}
            </h3>
            {step === 'score' && form.subjectName && (
              <p className="text-xs text-gray-400 mt-0.5">
                ประเมิน: <span className="font-bold text-gray-700">{form.subjectName}</span>
                {' · '}
                <span className={`font-bold ${form.type === 'pre' ? 'text-blue-600' : 'text-freshket-600'}`}>
                  {form.type === 'pre' ? 'Pre Test' : 'Post Test'} รอบที่ {autoRound}
                </span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {step === 'select' ? (
            /* Step 1: Select member */
            <div>
              <p className="text-sm font-bold text-gray-700 mb-3">เลือกสมาชิกที่ต้องการประเมิน</p>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ..."
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 mb-3"
              />
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filtered.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">ไม่พบสมาชิก</p>
                )}
                {filtered.map(m => (
                  <button key={m.uid} type="button" onClick={() => selectMember(m)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:border-freshket-200 hover:bg-freshket-50 transition-all text-left group">
                    <div className="size-9 rounded-full bg-freshket-100 flex items-center justify-center text-sm font-bold text-freshket-700 shrink-0">
                      {(m.nickname ?? m.displayName).charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{m.displayName}</p>
                      <p className="text-xs text-gray-400">{m.position ?? m.teamId ?? 'Sale'}</p>
                    </div>
                    <svg className="size-4 text-gray-300 group-hover:text-freshket-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Step 2: Score topics */
            <>
              {/* Meta: Type toggle (no round picker — computed automatically) */}
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-normal text-gray-500 mb-1.5">ประเภท</p>
                  <div className="flex gap-2">
                    {(['pre', 'post'] as const).map(t => (
                      <button key={t} type="button"
                        disabled={isEdit}
                        onClick={() => !isEdit && setForm(f => ({ ...f, type: t }))}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          isEdit ? 'opacity-70 cursor-not-allowed' : ''
                        } ${
                          form.type === t
                            ? t === 'pre' ? 'bg-blue-500 text-white border-blue-500' : 'bg-freshket-500 text-white border-freshket-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}>
                        {t === 'pre' ? 'Pre Test' : 'Post Test'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100">
                  <p className="text-xs text-gray-500 font-normal">รอบที่</p>
                  <span className="text-sm font-black text-gray-800">{autoRound}</span>
                  <span className="text-xs text-gray-400">(อัตโนมัติ)</span>
                </div>
                {!isEdit && (
                  <button type="button" onClick={() => setStep('select')}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline transition-colors">
                    เปลี่ยนคน
                  </button>
                )}
              </div>

              {/* Topic groups */}
              {groups.map(group => {
                const groupTopics = ROLEPLAY_TOPICS.filter(t => t.group === group)
                const groupAvg = groupTopics.map(t => form.ratings[t.key] ?? 5).reduce((a, b) => a + b, 0) / groupTopics.length
                return (
                  <div key={group} className="rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h4 className="text-sm font-bold text-gray-800">{group}</h4>
                      <span className={`text-sm font-bold ${scoreColor(groupAvg)}`}>{groupAvg.toFixed(1)}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {groupTopics.map(topic => (
                        <div key={topic.key} className="px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-gray-700 leading-snug">{topic.label}</p>
                            <span className={`text-xs font-bold shrink-0 ${scoreColor(form.ratings[topic.key] ?? 5)}`}>
                              {form.ratings[topic.key] ?? 5}/10
                            </span>
                          </div>
                          <ScoreDots value={form.ratings[topic.key] ?? 5} onChange={v => setRating(topic.key, v)} />
                          <input
                            type="text"
                            value={form.comments[topic.key] ?? ''}
                            onChange={e => setComment(topic.key, e.target.value)}
                            placeholder="คำแนะนำ (ไม่บังคับ)..."
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-freshket-400 focus:ring-1 focus:ring-freshket-100 placeholder:text-gray-300"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Overall note */}
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">บันทึกโดยรวม / Feedback สำหรับ {form.subjectName}</p>
                <textarea
                  value={form.overallNote}
                  onChange={e => setForm(f => ({ ...f, overallNote: e.target.value }))}
                  rows={3}
                  placeholder="สรุปภาพรวมการประเมิน..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'score' && (
          <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-gray-100 flex gap-3">
            {!isEdit && (
              <button type="button" onClick={() => setStep('select')}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                ย้อนกลับ
              </button>
            )}
            <button type="button" onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors">
              {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกผลการประเมิน'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Assessment Detail Card (user view) ────────────────────────────────────────

function AssessmentCard({
  a, expanded, onToggle, canEdit, onDelete, onEdit,
}: {
  a: RoleplayAssessment
  expanded: boolean
  onToggle: () => void
  canEdit?: boolean
  onDelete?: () => void
  onEdit?: () => void
}) {
  const avg = overallAvg(a.topics)
  const groups = Array.from(new Set(ROLEPLAY_TOPICS.map(t => t.group)))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="flex items-center">
        <button type="button" onClick={onToggle}
          className="flex-1 flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors min-w-0">
          <div className={`size-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 ${
            a.type === 'pre' ? 'bg-blue-500' : 'bg-freshket-500'
          }`}>
            {a.type === 'pre' ? 'Pre' : 'Post'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-900">รอบที่ {a.round}</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                a.type === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-freshket-100 text-freshket-700'
              }`}>
                {a.type === 'pre' ? 'Pre Test' : 'Post Test'}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmt(a.createdAt)} · ประเมินโดย {a.assessorName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-xl font-black ${scoreColor(avg)}`}>{avg.toFixed(1)}</p>
            <p className="text-xs text-gray-400">/ 10</p>
          </div>
          <svg className={`size-4 text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Edit / Delete actions */}
        {canEdit && (
          <div className="flex items-center gap-1 pr-3 shrink-0">
            <button type="button" onClick={onEdit}
              className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
              title="แก้ไข">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            <button type="button" onClick={onDelete}
              className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"
              title="ลบ">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expanded: group scores + overall note */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50/50">
          {/* Group score bars */}
          <div className="grid sm:grid-cols-2 gap-2">
            {groups.map(group => {
              const topics = ROLEPLAY_TOPICS.filter(t => t.group === group)
              const avg = avgTopics(a.topics, topics.map(t => t.key))
              const pct = (avg / 10) * 100
              return (
                <div key={group}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-gray-600">{group}</p>
                    <p className={`text-xs font-bold ${scoreColor(avg)}`}>{avg.toFixed(1)}</p>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg(avg)} transition-all duration-500`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Feedback comments (non-empty ones) */}
          {a.topics.filter(t => t.comment).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500">คำแนะนำ</p>
              {a.topics.filter(t => t.comment).map(t => {
                const def = ROLEPLAY_TOPICS.find(x => x.key === t.key)
                return (
                  <div key={t.key} className="flex items-start gap-2">
                    <span className={`text-xs font-bold min-w-[26px] text-center px-1 py-0.5 rounded-md ${
                      t.rating >= 8 ? 'bg-freshket-100 text-freshket-700' :
                      t.rating >= 6 ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>{t.rating}</span>
                    <div>
                      <p className="text-xs font-bold text-gray-700">{def?.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t.comment}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Overall note */}
          {a.overallNote && (
            <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
              <p className="text-xs font-bold text-gray-500 mb-1">บันทึกโดยรวม</p>
              <p className="text-sm text-gray-700 leading-relaxed">{a.overallNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Feedback Detail Card (sale user view, per-round) ─────────────────────────

const GROUP_PILL_COLORS = [
  'bg-blue-100 text-blue-800 border border-blue-200',
  'bg-violet-100 text-violet-800 border border-violet-200',
  'bg-sky-100 text-sky-800 border border-sky-200',
  'bg-cyan-100 text-cyan-800 border border-cyan-200',
  'bg-emerald-100 text-emerald-800 border border-emerald-200',
  'bg-amber-100 text-amber-800 border border-amber-200',
  'bg-rose-100 text-rose-800 border border-rose-200',
  'bg-purple-100 text-purple-800 border border-purple-200',
]

function FeedbackDetailCard({ assessment }: { assessment: RoleplayAssessment }) {
  const allGroups = Array.from(new Set(ROLEPLAY_TOPICS.map(t => t.group)))

  // Only keep groups that have at least one topic with a non-empty comment
  const feedbackSections = allGroups
    .map((group, gi) => ({
      group,
      gi,
      items: ROLEPLAY_TOPICS
        .filter(t => t.group === group)
        .map(topic => ({ topic, score: assessment.topics.find(s => s.key === topic.key) }))
        .filter(({ score }) => Boolean(score?.comment)),
    }))
    .filter(s => s.items.length > 0)

  const hasOverallNote = Boolean(assessment.overallNote)

  // Nothing to show → hide the card entirely
  if (feedbackSections.length === 0 && !hasOverallNote) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">Feedback จาก Assessor</h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          assessment.type === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-freshket-100 text-freshket-700'
        }`}>
          {assessment.type === 'pre' ? 'Pre Test' : 'Post Test'} รอบที่ {assessment.round}
        </span>
      </div>

      {/* Overall note */}
      {hasOverallNote && (
        <div className="px-5 py-4 bg-slate-50 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-1.5">บันทึกโดยรวม</p>
          <p className="text-sm text-gray-700 leading-relaxed">{assessment.overallNote}</p>
          <p className="text-xs text-gray-400 mt-2">— {assessment.assessorName} · {fmt(assessment.createdAt)}</p>
        </div>
      )}

      {/* Sections: only groups/topics that actually have feedback comments */}
      {feedbackSections.length > 0 && (
        <div>
          {feedbackSections.map(({ group, gi, items }, sectionIndex) => (
            <div key={group} className={sectionIndex > 0 ? 'border-t border-gray-100' : ''}>
              {/* Section pill */}
              <div className="px-5 py-3 bg-gray-50/50">
                <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full ${GROUP_PILL_COLORS[gi % GROUP_PILL_COLORS.length]}`}>
                  {group}
                </span>
              </div>
              {/* Topic rows */}
              <div className="divide-y divide-gray-50">
                {items.map(({ topic, score }) => (
                  <div key={topic.key} className="flex items-start gap-3 px-5 py-3">
                    <span className={`text-xs font-black min-w-[32px] text-center px-1.5 py-1 rounded-lg shrink-0 ${
                      (score!.rating) >= 8 ? 'bg-freshket-100 text-freshket-700' :
                      (score!.rating) >= 6 ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {score!.rating}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700 leading-snug">{topic.label}</p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{score!.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Member Row (manager view) ─────────────────────────────────────────────────

function MemberAssessmentRow({
  member,
  assessments,
  onViewHistory,
}: {
  member: UserProfile
  assessments: RoleplayAssessment[]
  onViewHistory: () => void
}) {
  const latest = [...assessments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  const startDateFormatted = member.startDate
    ? new Date(member.startDate as unknown as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <tr onClick={onViewHistory} className="hover:bg-freshket-50/40 cursor-pointer transition-colors group">
      {/* สมาชิก */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-freshket-100 group-hover:bg-freshket-200 flex items-center justify-center text-sm font-bold text-freshket-700 shrink-0 transition-colors">
            {(member.nickname ?? member.displayName ?? '?').charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 group-hover:text-freshket-700 transition-colors truncate">{member.displayName}</p>
            {member.nickname && <p className="text-xs text-gray-400 truncate">{member.nickname}</p>}
          </div>
        </div>
      </td>
      {/* ตำแหน่ง */}
      <td className="px-4 py-3">
        {member.position ? (
          <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 truncate max-w-[180px]">
            {member.position}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>
      {/* แผนก */}
      <td className="px-4 py-3">
        {member.department ? (
          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full truncate max-w-[160px] ${deptColor(member.department)}`}>
            {member.department}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>
      {/* วันเริ่มงาน */}
      <td className="px-4 py-3">
        <span className="text-xs text-gray-500 whitespace-nowrap">{startDateFormatted}</span>
      </td>
      {/* อายุงาน */}
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-gray-500">{calcTenure(member.startDate as Date | undefined)}</span>
      </td>
      {/* ล่าสุด */}
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-gray-400 whitespace-nowrap">{latest ? fmt(latest.createdAt) : '—'}</span>
      </td>
    </tr>
  )
}

// ── Member History Panel ──────────────────────────────────────────────────────

function MemberHistoryPanel({ member, assessments, onClose, canEdit, onDeleteAssessment, onEditAssessment }: {
  member: UserProfile
  assessments: RoleplayAssessment[]
  onClose: () => void
  canEdit?: boolean
  onDeleteAssessment?: (id: string) => void
  onEditAssessment?: (a: RoleplayAssessment) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const sorted = [...assessments].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const confirmTarget = sorted.find(a => a.id === confirmDeleteId)

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full sm:w-[65vw] max-w-[960px] flex flex-col shadow-2xl animate-pop-in overflow-hidden" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">ประวัติ Roleplay — {member.displayName}</h3>
            <p className="text-xs text-gray-400">{assessments.length} รอบการประเมิน</p>
          </div>
          <button type="button" onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Delete confirmation banner */}
        {confirmTarget && (
          <div className="mx-6 mt-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 flex items-center gap-3">
            <svg className="size-4 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-rose-700 flex-1">
              ลบ <span className="font-bold">{confirmTarget.type === 'pre' ? 'Pre Test' : 'Post Test'} รอบที่ {confirmTarget.round}</span> ของ {member.displayName}?
            </p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1 rounded-lg text-xs font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                ยกเลิก
              </button>
              <button type="button"
                onClick={() => { onDeleteAssessment?.(confirmDeleteId!); setConfirmDeleteId(null) }}
                className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors">
                ลบ
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Radar for latest pre + post */}
          {sorted.length > 0 && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-xs font-bold text-gray-500 mb-2">Radar Chart (ล่าสุด 2 รอบ)</p>
              <RadarChart assessments={sorted.slice(0, 2)} />
            </div>
          )}
          {sorted.map(a => (
            <AssessmentCard
              key={a.id}
              a={a}
              expanded={expanded === a.id}
              onToggle={() => setExpanded(p => p === a.id ? null : a.id)}
              canEdit={canEdit}
              onDelete={() => setConfirmDeleteId(a.id)}
              onEdit={() => { onEditAssessment?.(a); onClose() }}
            />
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">ยังไม่มีประวัติการประเมิน</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RoleplayPage() {
  const { user } = useAuth()
  const { data: allUsers } = useAllUsers()

  const isManager = user ? canAccess(user.role, 'team_lead') : false
  const isSuperAdmin = user?.role === 'super_admin'

  // Assessments + edit/delete state
  const [assessments, setAssessments] = useState<RoleplayAssessment[]>(DEMO_ASSESSMENTS)
  const [showModal, setShowModal] = useState(false)
  const [editAssessment, setEditAssessment] = useState<RoleplayAssessment | null>(null)
  const [historyMember, setHistoryMember] = useState<UserProfile | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSortField, setMemberSortField] = useState<'name' | 'position' | 'startDate'>('name')
  const [memberSortDir, setMemberSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSaveAssessment(a: RoleplayAssessment) {
    const isEdit = assessments.some(x => x.id === a.id)
    if (isEdit) {
      setAssessments(prev => prev.map(x => x.id === a.id ? a : x))
      if (user) {
        setAuditLogs(prev => [{
          id: 'log-' + Date.now(),
          timestamp: new Date(),
          actorName: user.displayName ?? '',
          actorRole: user.role,
          action: 'edit',
          assessmentId: a.id,
          subjectName: a.subjectName,
          round: a.round,
          type: a.type,
        }, ...prev])
      }
      setEditAssessment(null)
    } else {
      setAssessments(prev => [a, ...prev])
    }
  }

  function handleDeleteAssessment(id: string) {
    const a = assessments.find(x => x.id === id)
    if (!a || !user) return
    setAssessments(prev => prev.filter(x => x.id !== id))
    setAuditLogs(prev => [{
      id: 'log-' + Date.now(),
      timestamp: new Date(),
      actorName: user.displayName ?? '',
      actorRole: user.role,
      action: 'delete',
      assessmentId: id,
      subjectName: a.subjectName,
      round: a.round,
      type: a.type,
    }, ...prev])
  }

  // For sale users: their own assessments
  const myAssessments = useMemo(
    () => assessments.filter(a => a.subjectUid === (user?.uid ?? 'mock-sale-01'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [assessments, user?.uid]
  )
  // Fall back to demo subject if uid doesn't match (demo mode)
  const displayAssessments = myAssessments.length > 0 ? myAssessments : assessments.filter(a => a.subjectUid === 'mock-sale-01')

  // Round selector state: 'overall' (default) | 'pre' | 'post'
  const [viewMode, setViewMode] = useState<'overall' | 'pre' | 'post'>('overall')
  const [selectedRound, setSelectedRound] = useState<number>(1)

  const preRounds = Array.from(new Set(displayAssessments.filter(a => a.type === 'pre').map(a => a.round))).sort((a, b) => a - b)
  const postRounds = Array.from(new Set(displayAssessments.filter(a => a.type === 'post').map(a => a.round))).sort((a, b) => a - b)
  const selectedAssessment = viewMode === 'overall'
    ? null
    : (displayAssessments.find(a => a.type === viewMode && a.round === selectedRound) ?? null)

  // Separate Pre / Post avg for Overall dual-polygon view
  const preAssessments = displayAssessments.filter(a => a.type === 'pre')
  const postAssessments = displayAssessments.filter(a => a.type === 'post')

  function avgTopicsFor(list: RoleplayAssessment[]): RoleplayTopicScore[] {
    return ROLEPLAY_TOPICS.map(t => {
      const vals = list.map(a => a.topics.find(x => x.key === t.key)?.rating ?? 0).filter(v => v > 0)
      return { key: t.key, rating: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, comment: '' }
    })
  }
  const preAvgAssessment: RoleplayAssessment | null = preAssessments.length > 0
    ? { ...preAssessments[0], id: 'pre-avg', type: 'pre', topics: avgTopicsFor(preAssessments) }
    : null
  const postAvgAssessment: RoleplayAssessment | null = postAssessments.length > 0
    ? { ...postAssessments[0], id: 'post-avg', type: 'post', topics: avgTopicsFor(postAssessments) }
    : null

  // For single-round view, activeAssessment is the selected specific round
  const activeAssessment = viewMode === 'overall' ? null : selectedAssessment
  const displayScore = activeAssessment ? overallAvg(activeAssessment.topics) : 0
  const displayGroupScores = RADAR_GROUPS.map(g => ({
    ...g,
    score: activeAssessment ? avgTopics(activeAssessment.topics, g.keys) : 0,
  }))
  const radarColor = viewMode === 'pre' ? '#3b82f6' : '#00ce7c'

  // For manager view: members belonging to my team
  const myMembers = useMemo(() => {
    if (!user || !isManager) return []
    return (allUsers as UserProfile[]).filter(u =>
      u.role === 'sale' && (u.teamId === user.teamId || u.managerId === user.uid)
    )
  }, [allUsers, user, isManager])

  // Demo: if no members found, use demo users
  const displayMembers = myMembers.length > 0
    ? myMembers
    : (allUsers as UserProfile[]).filter(u => u.role === 'sale').slice(0, 4)

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim()
    let list = displayMembers
    if (q) {
      list = list.filter(m =>
        (m.displayName ?? '').toLowerCase().includes(q) ||
        (m.nickname ?? '').toLowerCase().includes(q) ||
        (m.position ?? '').toLowerCase().includes(q) ||
        (m.department ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let cmp = 0
      if (memberSortField === 'name') cmp = (a.displayName ?? '').localeCompare(b.displayName ?? '', 'th')
      else if (memberSortField === 'position') cmp = (a.position ?? '').localeCompare(b.position ?? '', 'th')
      else if (memberSortField === 'startDate') {
        const ta = a.startDate ? new Date(a.startDate as unknown as string).getTime() : 0
        const tb = b.startDate ? new Date(b.startDate as unknown as string).getTime() : 0
        cmp = ta - tb
      }
      return memberSortDir === 'asc' ? cmp : -cmp
    })
  }, [displayMembers, memberSearch, memberSortField, memberSortDir])

  function handleMemberSort(field: 'name' | 'position' | 'startDate') {
    if (memberSortField === field) setMemberSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setMemberSortField(field); setMemberSortDir('asc') }
  }

  if (!user) return null

  // ── Sale user view ──────────────────────────────────────────────────────────
  if (!isManager) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <Header title="Role Play" subtitle="ผลการประเมิน Roleplay ของฉัน" />
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Round selector ── */}
          <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
            <div className="flex items-center gap-3 flex-wrap">

              {/* Overall Avg (default) */}
              <button
                type="button"
                onClick={() => setViewMode('overall')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === 'overall'
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Overall Avg
              </button>

              <div className="w-px h-6 bg-gray-200 shrink-0" />

              {/* Pre buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600">Pre</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map(r => {
                    const exists = preRounds.includes(r)
                    const sel = viewMode === 'pre' && selectedRound === r
                    return (
                      <button key={r} type="button" disabled={!exists}
                        onClick={() => { setViewMode('pre'); setSelectedRound(r) }}
                        className={`size-9 rounded-full text-xs font-bold transition-all ${
                          !exists ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : sel ? 'bg-blue-500 text-white shadow-md scale-110'
                            : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                        }`}>
                        {r}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="w-px h-6 bg-gray-200 shrink-0" />

              {/* Post buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-freshket-600">Post</span>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map(r => {
                    const exists = postRounds.includes(r)
                    const sel = viewMode === 'post' && selectedRound === r
                    return (
                      <button key={r} type="button" disabled={!exists}
                        onClick={() => { setViewMode('post'); setSelectedRound(r) }}
                        className={`size-9 rounded-full text-xs font-bold transition-all ${
                          !exists ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : sel ? 'bg-freshket-500 text-white shadow-md scale-110'
                            : 'bg-freshket-50 text-freshket-600 border border-freshket-200 hover:bg-freshket-100'
                        }`}>
                        {r}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Assessor info for specific round */}
              {selectedAssessment && viewMode !== 'overall' && (
                <p className="ml-auto text-xs text-gray-400 hidden sm:block">
                  {selectedAssessment.type === 'pre' ? 'Pre Test' : 'Post Test'} รอบที่ {selectedAssessment.round}
                  {' · '}{fmt(selectedAssessment.createdAt)}
                  {' · '}ประเมินโดย {selectedAssessment.assessorName}
                </p>
              )}
            </div>
          </div>

          {/* Radar + Score grid */}
          <div className="grid gap-4 lg:grid-cols-2">

            {/* ── Radar card ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-gray-900">
                  {viewMode === 'overall' ? 'Radar Chart · Before & After'
                    : `Radar Chart · ${viewMode === 'pre' ? 'Pre' : 'Post'} ${selectedRound}`}
                </h2>
                {/* Legend for overall dual-polygon */}
                {viewMode === 'overall' ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <span className="size-2.5 rounded-full bg-blue-500 inline-block" />Before
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <span className="size-2.5 rounded-full bg-freshket-500 inline-block" />After
                    </span>
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="size-2.5 rounded-full inline-block" style={{ background: radarColor }} />
                    {viewMode === 'pre' ? `Pre ${selectedRound}` : `Post ${selectedRound}`}
                  </span>
                )}
              </div>

              {viewMode === 'overall' ? (
                (preAvgAssessment || postAvgAssessment) ? (
                  <RadarChart
                    assessments={[preAvgAssessment, postAvgAssessment].filter(Boolean) as RoleplayAssessment[]}
                    colors={['#3b82f6', '#00ce7c']}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-300">ยังไม่มีข้อมูล</div>
                )
              ) : (
                activeAssessment ? (
                  <RadarChart assessments={[activeAssessment]} colors={[radarColor]} />
                ) : (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-300">ยังไม่มีข้อมูล</div>
                )
              )}
            </div>

            {/* ── Right column ── */}
            <div className="space-y-3">

              {/* ── Overall mode: Before / After comparison ── */}
              {viewMode === 'overall' && (
                <>
                  {(preAvgAssessment || postAvgAssessment) ? (
                    <>
                      {/* Before / After / Develop — reference-style stat cards */}
                      <div className="grid grid-cols-3 gap-3">
                        {/* Pre Average */}
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                          <p className="text-xs font-bold text-amber-500 mb-2">Pre Average</p>
                          <p className="text-3xl font-black text-amber-600 leading-none">
                            {preAvgAssessment ? overallAvg(preAvgAssessment.topics).toFixed(1) : '—'}
                          </p>
                          <p className="text-xs text-amber-400 mt-2">{preAssessments.length} รอบ</p>
                        </div>

                        {/* Develop (improvement) */}
                        {(() => {
                          const diff = (preAvgAssessment && postAvgAssessment)
                            ? overallAvg(postAvgAssessment.topics) - overallAvg(preAvgAssessment.topics)
                            : null
                          const isPos = diff !== null && diff > 0
                          const isNeg = diff !== null && diff < 0
                          return (
                            <div className={`border rounded-2xl p-4 text-center ${
                              isPos ? 'bg-freshket-50 border-freshket-100'
                              : isNeg ? 'bg-rose-50 border-rose-100'
                              : 'bg-gray-50 border-gray-100'
                            }`}>
                              <p className={`text-xs font-bold mb-2 ${
                                isPos ? 'text-freshket-500' : isNeg ? 'text-rose-500' : 'text-gray-400'
                              }`}>Develop</p>
                              <p className={`text-3xl font-black leading-none ${
                                isPos ? 'text-freshket-600' : isNeg ? 'text-rose-600' : 'text-gray-300'
                              }`}>
                                {diff === null ? '—'
                                  : `${isPos ? '▲' : isNeg ? '▼' : ''}${Math.abs(diff).toFixed(1)}`}
                              </p>
                              <p className={`text-xs mt-2 ${isPos ? 'text-freshket-400' : isNeg ? 'text-rose-400' : 'text-gray-300'}`}>
                                {diff === null ? 'ไม่มีข้อมูล' : isPos ? 'พัฒนาขึ้น' : isNeg ? 'ลดลง' : 'เท่าเดิม'}
                              </p>
                            </div>
                          )
                        })()}

                        {/* Post Average */}
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
                          <p className="text-xs font-bold text-blue-500 mb-2">Post Average</p>
                          <p className="text-3xl font-black text-blue-600 leading-none">
                            {postAvgAssessment ? overallAvg(postAvgAssessment.topics).toFixed(1) : '—'}
                          </p>
                          <p className="text-xs text-blue-400 mt-2">{postAssessments.length} รอบ</p>
                        </div>
                      </div>

                      {/* Group scores — dual bars (Before + After) */}
                      <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <p className="text-xs font-bold text-gray-400 mb-3">คะแนนแยกหมวด</p>
                        <div className="space-y-3">
                          {RADAR_GROUPS.map(g => {
                            const preS = preAvgAssessment ? avgTopics(preAvgAssessment.topics, g.keys) : 0
                            const postS = postAvgAssessment ? avgTopics(postAvgAssessment.topics, g.keys) : 0
                            const diff = postS - preS
                            return (
                              <div key={g.label}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-xs text-gray-600 leading-tight">{g.label}</p>
                                  <div className="flex items-center gap-1 text-xs shrink-0">
                                    <span className="font-bold text-blue-500">{preS > 0 ? preS.toFixed(1) : '—'}</span>
                                    <span className={`font-bold ${diff > 0 ? 'text-freshket-600' : diff < 0 ? 'text-rose-500' : 'text-gray-300'}`}>
                                      {diff > 0 ? '▲' : diff < 0 ? '▼' : '→'}
                                    </span>
                                    <span className={`font-bold ${postS > 0 ? scoreColor(postS) : 'text-gray-300'}`}>{postS > 0 ? postS.toFixed(1) : '—'}</span>
                                  </div>
                                </div>
                                <div className="space-y-0.5">
                                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-400 transition-all duration-500" style={{ width: `${preS * 10}%` }} />
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-freshket-500 transition-all duration-500" style={{ width: `${postS * 10}%` }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50">
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span className="w-4 h-1 rounded-full bg-blue-400 inline-block" />Before (Pre)
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span className="w-4 h-1.5 rounded-full bg-freshket-500 inline-block" />After (Post)
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                      <p className="text-3xl mb-2">📋</p>
                      <p className="text-sm font-normal text-gray-500">ยังไม่มีผลการประเมิน</p>
                      <p className="text-xs text-gray-400 mt-1">รอ Team Lead / Manager ทำ Assessment ให้คุณ</p>
                    </div>
                  )}
                </>
              )}

              {/* ── Single-round mode ── */}
              {viewMode !== 'overall' && (
                activeAssessment ? (
                  <>
                    {/* Score card */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <p className="text-xs font-bold text-gray-400 mb-3">คะแนนรอบนี้</p>
                      <div className="flex items-end gap-3">
                        <p className={`text-5xl font-black ${scoreColor(displayScore)}`}>{displayScore.toFixed(1)}</p>
                        <div className="pb-1">
                          <p className="text-xs text-gray-400">/ 10</p>
                          <p className="text-xs text-gray-500 font-normal">
                            {`รอบที่ ${selectedAssessment?.round} · ${selectedAssessment?.type === 'pre' ? 'Pre Test' : 'Post Test'}`}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2 sm:hidden">
                        ประเมินโดย {selectedAssessment?.assessorName} · {selectedAssessment ? fmt(selectedAssessment.createdAt) : ''}
                      </p>
                    </div>

                    {/* Group scores */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <p className="text-xs font-bold text-gray-400 mb-3">คะแนนแยกหมวด</p>
                      <div className="space-y-2.5">
                        {displayGroupScores.map(g => (
                          <div key={g.label} className="flex items-center gap-3">
                            <p className="text-xs text-gray-600 w-32 shrink-0 leading-tight">{g.label}</p>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${scoreBg(g.score)} transition-all duration-500`}
                                style={{ width: `${g.score * 10}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-8 text-right ${scoreColor(g.score)}`}>{g.score.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Feedback detail */}
                    {selectedAssessment && (
                      <FeedbackDetailCard assessment={selectedAssessment} />
                    )}
                  </>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <p className="text-3xl mb-2">📋</p>
                    <p className="text-sm font-normal text-gray-500">ยังไม่มีผลการประเมิน</p>
                    <p className="text-xs text-gray-400 mt-1">รอ Team Lead / Manager ทำ Assessment ให้คุณ</p>
                  </div>
                )
              )}

            </div>
          </div>

        </div>
      </div>
    )
  }

  // ── Manager / Team Lead view ────────────────────────────────────────────────
  const memberAssessments = (m: UserProfile) => assessments.filter(a => a.subjectUid === m.uid)

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header
        title="Role Play Assessment"
        subtitle="ประเมิน Roleplay ของทีม"
        actions={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            สร้าง Assessment
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'สมาชิกทั้งหมด', value: displayMembers.length, color: 'text-gray-900' },
            { label: 'Assessment ทั้งหมด', value: assessments.filter(a => displayMembers.some(m => m.uid === a.subjectUid)).length, color: 'text-blue-600' },
            { label: 'Pre Test', value: assessments.filter(a => a.type === 'pre' && displayMembers.some(m => m.uid === a.subjectUid)).length, color: 'text-blue-500' },
            { label: 'Post Test', value: assessments.filter(a => a.type === 'post' && displayMembers.some(m => m.uid === a.subjectUid)).length, color: 'text-freshket-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Member table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <h2 className="text-sm font-bold text-gray-900 shrink-0">สมาชิกในทีม</h2>
            <span className="text-xs text-gray-400">{filteredMembers.length} คน</span>
            <div className="flex-1" />
            <div className="relative w-56">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
              </span>
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-freshket-200 placeholder:text-gray-400"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleMemberSort('name')} className="flex items-center text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors">
                      สมาชิก <SortIcon field="name" current={memberSortField} dir={memberSortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleMemberSort('position')} className="flex items-center text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors">
                      ตำแหน่ง <SortIcon field="position" current={memberSortField} dir={memberSortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">แผนก</th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleMemberSort('startDate')} className="flex items-center text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors">
                      วันเริ่มงาน <SortIcon field="startDate" current={memberSortField} dir={memberSortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">อายุงาน</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">ล่าสุด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredMembers.map(m => (
                  <MemberAssessmentRow
                    key={m.uid}
                    member={m}
                    assessments={memberAssessments(m)}
                    onViewHistory={() => setHistoryMember(m)}
                  />
                ))}
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-300">ไม่พบสมาชิก</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit log — super_admin only */}
        {isSuperAdmin && auditLogs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <svg className="size-4 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
              <h2 className="text-sm font-bold text-gray-900">Audit Log (Super Admin)</h2>
              <span className="ml-auto text-xs text-gray-400">{auditLogs.length} รายการ</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {auditLogs.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    log.action === 'delete' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {log.action === 'delete' ? 'ลบ' : 'แก้ไข'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700">
                      <span className="font-bold">{log.actorName}</span>
                      {' '}({log.actorRole}){' '}
                      {log.action === 'delete' ? 'ลบ' : 'แก้ไข'}{' '}
                      <span className="font-bold">{log.subjectName}</span>
                      {' — '}{log.type === 'pre' ? 'Pre' : 'Post'} Test รอบที่ {log.round}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(log.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {(showModal || editAssessment) && (
        <AssessmentModal
          members={displayMembers}
          assessments={assessments}
          editAssessment={editAssessment ?? undefined}
          onClose={() => { setShowModal(false); setEditAssessment(null) }}
          onSave={handleSaveAssessment}
        />
      )}

      {/* Member history panel */}
      {historyMember && (
        <MemberHistoryPanel
          member={historyMember}
          assessments={memberAssessments(historyMember)}
          onClose={() => setHistoryMember(null)}
          canEdit={isManager}
          onDeleteAssessment={handleDeleteAssessment}
          onEditAssessment={a => { setEditAssessment(a); setHistoryMember(null) }}
        />
      )}
    </div>
  )
}
