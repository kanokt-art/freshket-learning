'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { StatusBarChart } from '@/components/features/ProgressChart'
import { useAuth } from '@/hooks/useAuth'
import { useTeamTrainingRecords, useAllUsers } from '@/hooks/useFirestore'
import { STATUS_LABELS, STATUS_COLORS, type TrainingRecord } from '@/types/tracking'
import { formatDate } from '@/lib/utils/dateFormatter'
import { canAccess, ROLE_LABELS, type UserProfile } from '@/types/user'
import { getDemoMode } from '@/lib/demo/demoMode'

const DEMO_MODE = getDemoMode()

// ── Helpers ───────────────────────────────────────────────────────────────────────
const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-orange-100 text-orange-700 border border-orange-200',
  manager:     'bg-purple-100 text-purple-700 border border-purple-200',
  team_lead:   'bg-blue-100 text-blue-700 border border-blue-200',
  sale:        'bg-freshket-100 text-freshket-700 border border-freshket-200',
}
function scoreColor(s: number) {
  if (s >= 80) return 'text-freshket-600'
  if (s >= 60) return 'text-amber-600'
  return 'text-rose-600'
}
function scoreBarColor(s: number) {
  if (s >= 80) return '#00ce7c'
  if (s >= 60) return '#fbbf24'
  return '#f87171'
}

// ── Demo shadow data ──────────────────────────────────────────────────────────────
const DEMO_SHADOWS = [
  {
    id: 'sv-1',
    restaurantName: 'ร้านครัวไทย สีลม',
    restaurantType: 'ร้านอาหาร',
    date: new Date('2025-03-15'),
    seniorName: 'พี่วิชาญ มณีรัตน์',
    learnings: 'ได้เรียนรู้เทคนิคการแนะนำเมนูให้ตรงกับโปรไฟล์ลูกค้า พี่วิชาญสอนให้สังเกตขนาดร้านและยอดสั่งซื้อก่อนเสนอแพ็กเกจ\n\nการสร้างความไว้วางใจต้องใช้เวลาอย่างน้อย 3 ครั้ง',
  },
  {
    id: 'sv-2',
    restaurantName: 'โรงแรม แกรนด์ ไฮแอท เอราวัณ',
    restaurantType: 'โรงแรม 5 ดาว',
    date: new Date('2025-04-02'),
    seniorName: 'พี่สมชาย เจริญวงศ์',
    learnings: 'ลูกค้าระดับโรงแรม 5 ดาวให้ความสำคัญกับความสม่ำเสมอของคุณภาพและการจัดส่งตรงเวลา 100%',
  },
]

// ── Member Panel (slide-in overlay, 4 tabs) ────────────────────────────────────────
function MemberPanel({
  member,
  records,
  onClose,
}: {
  member: UserProfile
  records: TrainingRecord[]
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'training' | 'role' | 'shadow'>('info')
  const [expandedShadow, setExpandedShadow] = useState<string | null>(null)

  const total      = records.length
  const completed  = records.filter(r => r.status === 'completed').length
  const inProgress = records.filter(r => r.status === 'in_progress').length
  const failed     = records.filter(r => r.status === 'failed').length
  const notStarted = total - completed - inProgress - failed
  const scores     = records.filter(r => r.score != null).map(r => r.score!)
  const avgScore   = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const TABS = [
    { id: 'info'     as const, label: 'ข้อมูล' },
    { id: 'training' as const, label: 'Training' },
    { id: 'role'     as const, label: 'Role' },
    { id: 'shadow'   as const, label: 'Shadow' },
  ]
  const shadows = DEMO_MODE ? DEMO_SHADOWS : []

  return (
    <aside
      className="fixed top-0 right-0 h-full bg-white shadow-2xl z-40 flex flex-col border-l border-gray-100"
      style={{ width: 'min(480px, 100vw)', animation: 'panelIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
    >
      <style>{`@keyframes panelIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

      {/* ── Panel header ── */}
      <div className="px-6 pt-5 shrink-0 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-11 rounded-2xl bg-freshket-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 text-lg font-bold shrink-0">
              {member.displayName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base leading-tight truncate">
                {member.displayName}
                {member.nickname && (
                  <span className="text-sm text-gray-400 font-normal ml-1.5">({member.nickname})</span>
                )}
              </p>
              <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ${ROLE_BADGE[member.role]}`}>
                {ROLE_LABELS[member.role]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shrink-0">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-freshket-500 text-freshket-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Tab 1 — ข้อมูล */}
        {activeTab === 'info' && (
          <div className="p-6 space-y-5">
            {/* Score summary */}
            <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-5">
              <div className="text-center shrink-0 w-16">
                <p className={`text-3xl font-bold leading-none ${avgScore != null ? scoreColor(avgScore) : 'text-gray-200'}`}>
                  {avgScore ?? '—'}
                </p>
                {avgScore != null && <p className="text-xs text-gray-400 mt-0.5">/100</p>}
                <p className="text-xs text-gray-400 mt-1">คะแนนเฉลี่ย</p>
              </div>
              <div className="flex-1 space-y-2">
                {[
                  { label: 'ผ่านแล้ว',    count: completed,  color: '#00ce7c' },
                  { label: 'กำลังเรียน',  count: inProgress, color: '#60a5fa' },
                  { label: 'ไม่ผ่าน',     count: failed,     color: '#f87171' },
                  { label: 'ยังไม่เริ่ม', count: notStarted, color: '#d1d5db' },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-gray-500 truncate">{row.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%`, background: row.color }}
                      />
                    </div>
                    <span className="w-5 text-right text-gray-600 font-bold tabular-nums">{row.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile fields */}
            <div>
              <p className="text-xs font-bold text-gray-400 mb-3">ข้อมูลพนักงาน</p>
              <div className="space-y-2.5 text-sm">
                {member.employeeId && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0z" />
                    </svg>
                    <span className="font-mono text-xs bg-freshket-50 text-freshket-700 px-2 py-0.5 rounded-full">{member.employeeId}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-gray-700">
                  <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span className="text-xs">{member.email}</span>
                </div>
                {member.position && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    <span>{member.position}</span>
                  </div>
                )}
                {member.department && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                    <span>{member.department}</span>
                  </div>
                )}
                {member.startDate && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    <span>เข้างาน {formatDate(member.startDate)}</span>
                  </div>
                )}
                {member.lineManager && (
                  <div className="flex items-center gap-2.5 text-gray-700">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                    <span>Line Manager: {member.lineManager}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2 — Training Record */}
        {activeTab === 'training' && (
          <div>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between z-10">
              <p className="text-sm font-bold text-gray-900">ประวัติการฝึกอบรม</p>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{records.length} รายการ</span>
            </div>
            {records.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-400">ยังไม่มีประวัติการฝึกอบรม</div>
            ) : (
              <div className="p-4 space-y-3">
                {records.map(r => (
                  <div key={r.id} className="border border-gray-100 rounded-xl p-4 bg-white hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-bold text-sm text-gray-800 leading-snug flex-1">{r.courseTitle}</p>
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    {r.score != null && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-sm font-bold w-8 shrink-0 ${scoreColor(r.score)}`}>{r.score}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${r.score}%`, background: scoreBarColor(r.score) }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {r.completedAt && <span>สำเร็จ {formatDate(r.completedAt)}</span>}
                      {r.attemptCount > 0 && <span>{r.attemptCount} ครั้ง</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3 — Role */}
        {activeTab === 'role' && (
          <div className="p-6 space-y-5">
            <div className="bg-gray-50 rounded-2xl p-5">
              <p className="text-xs font-bold text-gray-400 mb-3">Role ในระบบ</p>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-freshket-100 flex items-center justify-center text-freshket-700 font-bold text-base">
                  {member.displayName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{member.displayName}</p>
                  <span className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full mt-1 ${ROLE_BADGE[member.role]}`}>
                    {ROLE_LABELS[member.role]}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-400 mb-3">ตำแหน่งงาน</p>
              <div className="divide-y divide-gray-100">
                {[
                  { label: 'ตำแหน่ง',    value: member.position },
                  { label: 'Rank',        value: member.rank },
                  { label: 'แผนก',        value: member.department },
                  { label: 'วันเข้างาน', value: member.startDate ? formatDate(member.startDate) : undefined },
                  { label: 'Line Manager', value: member.lineManager },
                ].filter(row => row.value).map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2.5">
                    <span className="text-xs text-gray-400">{row.label}</span>
                    <span className="text-xs font-normal text-gray-800 max-w-[60%] text-right truncate">{row.value}</span>
                  </div>
                ))}
                {!member.position && !member.rank && !member.department && (
                  <p className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูลตำแหน่ง</p>
                )}
              </div>
            </div>

            {/* Training summary */}
            <div>
              <p className="text-xs font-bold text-gray-400 mb-3">สรุปผล Training</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'ผ่าน',        count: completed,  color: 'bg-freshket-50 text-freshket-700' },
                  { label: 'กำลังเรียน', count: inProgress, color: 'bg-blue-50 text-blue-700' },
                  { label: 'ไม่ผ่าน',    count: failed,     color: 'bg-rose-50 text-rose-700' },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl p-3 text-center ${item.color}`}>
                    <p className="text-xl font-bold">{item.count}</p>
                    <p className="text-xs mt-0.5 opacity-80">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4 — Shadow */}
        {activeTab === 'shadow' && (
          shadows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-72 p-8 text-center">
              <div className="size-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center mb-4">
                <svg className="size-7 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="font-bold text-gray-700 mb-1">ยังไม่มีข้อมูล Shadow</p>
              <p className="text-xs text-gray-400">เมื่อมีการบันทึก Shadow จะแสดงที่นี่</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {shadows.map(visit => {
                const isOpen = expandedShadow === visit.id
                return (
                  <div
                    key={visit.id}
                    className={`border rounded-2xl overflow-hidden transition-all duration-200 ${isOpen ? 'border-sky-200 bg-sky-50/20' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                  >
                    <button
                      onClick={() => setExpandedShadow(isOpen ? null : visit.id)}
                      className="w-full text-left px-4 py-4 flex items-start gap-3"
                    >
                      <div className="size-10 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
                        <svg className="size-5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 leading-snug">{visit.restaurantName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">{visit.restaurantType}</span>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-400">{formatDate(visit.date)}</span>
                        </div>
                        <p className="text-xs text-sky-500 font-normal mt-1">พี่เลี้ยง: {visit.seniorName}</p>
                      </div>
                      <svg
                        className={`size-4 text-gray-400 shrink-0 mt-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <div className="border-t border-sky-100 pt-3">
                          <p className="text-xs font-bold text-sky-600 mb-2">สิ่งที่ได้เรียนรู้</p>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{visit.learnings}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </aside>
  )
}

// ── Member Card (grid item) ────────────────────────────────────────────────────────
function MemberCard({
  member,
  records,
  onClick,
}: {
  member: UserProfile
  records: TrainingRecord[]
  onClick: () => void
}) {
  const total     = records.length
  const completed = records.filter(r => r.status === 'completed').length
  const inProgress = records.filter(r => r.status === 'in_progress').length
  const failed    = records.filter(r => r.status === 'failed').length
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 0
  const scores    = records.filter(r => r.score != null).map(r => r.score!)
  const avgScore  = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const barColor  = rate >= 80 ? '#00ce7c' : rate >= 50 ? '#fbbf24' : '#f87171'

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-4 text-left hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 hover:border-freshket-200 transition-all group w-full"
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="size-10 rounded-xl bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 font-bold text-base shrink-0">
          {member.displayName.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-gray-900 truncate leading-tight">{member.displayName}</p>
          {member.nickname
            ? <p className="text-xs text-gray-400 truncate">{member.nickname}</p>
            : member.position && <p className="text-xs text-gray-400 truncate">{member.position}</p>
          }
        </div>
        <svg className="size-4 text-gray-300 group-hover:text-freshket-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">ผ่านแล้ว {completed}/{total}</span>
          <span className="text-xs font-bold" style={{ color: barColor }}>{rate}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${rate}%`, background: barColor }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className="size-1.5 rounded-full bg-freshket-400 inline-block" />{completed} ผ่าน
        </span>
        {inProgress > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <span className="size-1.5 rounded-full bg-amber-400 inline-block" />{inProgress} เรียนอยู่
          </span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-1 text-xs text-rose-500">
            <span className="size-1.5 rounded-full bg-rose-400 inline-block" />{failed} ไม่ผ่าน
          </span>
        )}
        {avgScore != null && (
          <span className={`ml-auto text-xs font-bold ${scoreColor(avgScore)}`}>{avgScore} pts</span>
        )}
      </div>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────────
export default function TeamLeadPage() {
  const { user } = useAuth()
  const { data: records, loading } = useTeamTrainingRecords(user?.teamId ?? '')
  const { data: allUsers } = useAllUsers()
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const teamMembers = useMemo(() => {
    if (!user?.teamId) return []
    return allUsers.filter(u => u.teamId === user.teamId && u.role === 'sale')
  }, [allUsers, user?.teamId])

  const recordsByMember = useMemo(() => {
    const map: Record<string, TrainingRecord[]> = {}
    records.forEach(r => {
      if (!map[r.userId]) map[r.userId] = []
      map[r.userId].push(r)
    })
    return map
  }, [records])

  const memberCount     = useMemo(() => new Set(records.map(r => r.userId)).size, [records])
  const completedCount  = useMemo(() => records.filter(r => r.status === 'completed').length, [records])
  const inProgressCount = useMemo(() => records.filter(r => r.status === 'in_progress').length, [records])
  const needDevCount    = useMemo(
    () => new Set(records.filter(r => r.status === 'failed').map(r => r.userId)).size,
    [records],
  )
  const completionRate = useMemo(() => {
    if (!records.length) return 0
    return Math.round((completedCount / records.length) * 100)
  }, [records, completedCount])

  const chartData = useMemo(() => {
    const byTitle: Record<string, { completed: number; in_progress: number; not_started: number }> = {}
    records.forEach(r => {
      if (!byTitle[r.courseTitle]) byTitle[r.courseTitle] = { completed: 0, in_progress: 0, not_started: 0 }
      if (r.status === 'completed') byTitle[r.courseTitle].completed++
      else if (r.status === 'in_progress') byTitle[r.courseTitle].in_progress++
      else byTitle[r.courseTitle].not_started++
    })
    return Object.entries(byTitle)
      .slice(0, 6)
      .map(([name, v]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, ...v }))
  }, [records])

  const selectedMember  = selectedMemberId ? (allUsers.find(u => u.uid === selectedMemberId) ?? null) : null
  const selectedRecords = selectedMemberId ? (recordsByMember[selectedMemberId] ?? []) : []

  if (user && !canAccess(user.role, 'team_lead')) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <p className="text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    )
  }

  const KPI_CARDS = [
    {
      bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconColor: 'text-blue-500',
      value: memberCount, unit: 'คน', label: 'พนักงานทั้งหมด',
      sub: `${completedCount} รายการผ่านแล้ว`, subColor: 'text-blue-400',
      icon: (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
    },
    {
      bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500',
      value: `${completionRate}%`, unit: '', label: 'อัตราผ่านการเรียน',
      sub: `จากทั้งหมด ${records.length} รายการ`, subColor: 'text-emerald-400',
      icon: (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconColor: 'text-amber-500',
      value: inProgressCount, unit: 'รายการ', label: 'กำลังเรียนอยู่',
      sub: 'กำลังดำเนินการ', subColor: 'text-amber-400',
      icon: (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
      ),
    },
    {
      bg: 'bg-rose-50', iconBg: 'bg-rose-100', iconColor: 'text-rose-400',
      value: needDevCount, unit: 'คน', label: 'ต้องเร่งพัฒนา',
      sub: 'มีบทเรียนที่ไม่ผ่าน', subColor: 'text-rose-400',
      icon: (
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
    },
  ]

  // Fallback member list built from records when allUsers filter returns nothing
  const displayMembers: UserProfile[] = teamMembers.length > 0
    ? teamMembers
    : Array.from(new Set(records.map(r => r.userId))).map(uid => {
        const name = recordsByMember[uid]?.[0]?.memberName ?? uid
        return { uid, email: '', displayName: name, photoURL: null, role: 'sale' as const, createdAt: new Date(), updatedAt: new Date() }
      })

  return (
    <>
      <Header title="ทีมของฉัน" subtitle="ภาพรวมความก้าวหน้าของลูกทีม" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {KPI_CARDS.map(card => (
            <div key={card.label} className={`${card.bg} rounded-2xl p-5 flex flex-col gap-3 min-h-[120px]`}>
              <div className={`size-9 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-tight">
                  {card.value}
                  {card.unit && <span className="text-sm font-bold text-gray-600 ml-1">{card.unit}</span>}
                </p>
                <p className="text-sm font-normal text-gray-700 mt-0.5">{card.label}</p>
                <p className={`text-xs mt-1 ${card.subColor}`}>{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-4">สถานะรายหลักสูตร</h2>
            <StatusBarChart data={chartData} />
          </div>
        )}

        {/* Member Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">สมาชิกในทีม</h2>
            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2.5 py-0.5 rounded-full shadow-sm">
              {displayMembers.length} คน
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="inline-block size-6 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayMembers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayMembers.map(member => (
                <MemberCard
                  key={member.uid}
                  member={member}
                  records={recordsByMember[member.uid] ?? []}
                  onClick={() => setSelectedMemberId(member.uid)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
              <svg className="size-10 mx-auto mb-3 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="text-sm font-normal text-gray-500">ยังไม่มีสมาชิกในทีม</p>
            </div>
          )}
        </div>
      </div>

      {/* Member overlay panel */}
      {selectedMember && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-30"
            onClick={() => setSelectedMemberId(null)}
          />
          <MemberPanel
            member={selectedMember}
            records={selectedRecords}
            onClose={() => setSelectedMemberId(null)}
          />
        </>
      )}
    </>
  )
}
