'use client'

import { useState, useMemo } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useTeamTrainingRecords, useAllUsers, useTeams } from '@/hooks/useFirestore'
import { STATUS_LABELS, type TrainingStatus, type TrainingRecord } from '@/types/tracking'
import { canAccess, ROLE_LABELS, type UserProfile } from '@/types/user'
import { formatDate, formatDateEN } from '@/lib/utils/dateFormatter'

// ── Dept color palette ─────────────────────────────────────────────────────────
const DEPT_COLORS = [
  'bg-emerald-100 text-emerald-800', 'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',   'bg-amber-100 text-amber-800',
  'bg-cyan-100 text-cyan-800',       'bg-rose-100 text-rose-800',
  'bg-indigo-100 text-indigo-800',   'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',   'bg-pink-100 text-pink-800',
  'bg-lime-100 text-lime-800',       'bg-sky-100 text-sky-800',
]
function deptColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return DEPT_COLORS[h % 12]
}

const STATUS_PASTEL: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-freshket-100 text-freshket-700',
  failed:      'bg-rose-100 text-rose-600',
}

function scoreBarColor(s: number) { return s >= 80 ? '#00ce7c' : s >= 60 ? '#fbbf24' : '#f87171' }
function scoreTextColor(s: number) { return s >= 80 ? 'text-freshket-600' : s >= 60 ? 'text-amber-600' : 'text-rose-600' }

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const { user } = useAuth()
  const { data: records, loading } = useTeamTrainingRecords(user?.teamId ?? '')
  const { data: allUsers } = useAllUsers()
  const { data: teams } = useTeams()

  const users = useMemo(
    () => allUsers.filter(u => u.teamId === user?.teamId),
    [allUsers, user?.teamId],
  )
  const [activeDept, setActiveDept] = useState<string>('all')
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const teamMap = useMemo(() => {
    const m: Record<string, string> = {}
    teams.forEach(t => { m[t.id] = t.name })
    return m
  }, [teams])

  const departments = useMemo(() => {
    const set = new Set<string>()
    users.forEach(u => { if (u.department) set.add(u.department) })
    return Array.from(set).sort()
  }, [users])

  // Stat cards computed from all records
  const totalUsers    = useMemo(() => new Set(records.map(r => r.userId)).size, [records])
  const overallCompletion = useMemo(() => {
    if (!records.length) return 0
    return Math.round((records.filter(r => r.status === 'completed').length / records.length) * 100)
  }, [records])
  const inProgressCount = useMemo(() => records.filter(r => r.status === 'in_progress').length, [records])
  const atRiskCount = useMemo(() => {
    const s = new Set<string>()
    records.forEach(r => { if (r.status === 'failed' || (r.score !== undefined && r.score < 60)) s.add(r.userId) })
    return s.size
  }, [records])

  // Filtered employee list
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim()
    return users.filter(u => {
      const matchDept   = activeDept === 'all' || u.department === activeDept
      const matchSearch = !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.nickname?.toLowerCase() ?? '').includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q)
      return matchDept && matchSearch
    })
  }, [users, activeDept, userSearch])

  const selectedUser = selectedUserId ? users.find(u => u.uid === selectedUserId) ?? null : null

  if (user && !canAccess(user.role, 'manager')) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <p className="text-sm text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="ภาพรวมทีม" subtitle="สถิติการอบรมของทีมคุณ" />

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="พนักงานทั้งหมด" value={totalUsers} unit="คน"
            bg="bg-blue-50" iconBg="bg-blue-100" iconColor="text-blue-500"
            icon={<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
          />
          <StatCard label="อัตราผ่านการเรียน" value={`${overallCompletion}%`}
            bg="bg-freshket-100" iconBg="bg-freshket-200" iconColor="text-freshket-600"
            icon={<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <StatCard label="กำลังเรียนอยู่" value={inProgressCount} unit="รายการ"
            bg="bg-amber-50" iconBg="bg-amber-100" iconColor="text-amber-500"
            icon={<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>}
          />
          <StatCard label="ต้องเร่งพัฒนา" value={atRiskCount} unit="คน"
            bg="bg-rose-50" iconBg="bg-rose-100" iconColor="text-rose-500"
            icon={<svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
          />
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative w-full sm:w-64 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
            </span>
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัส..."
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <DeptPill label="ทุกแผนก" active={activeDept === 'all'} onClick={() => setActiveDept('all')} />
            {departments.map(d => (
              <DeptPill key={d} label={d} active={activeDept === d} onClick={() => setActiveDept(d)} />
            ))}
          </div>
        </div>

        {/* ── Employee table ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">รายชื่อพนักงาน</h3>
            <span className="text-xs text-gray-400">{filteredUsers.length} คน</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-sm">ไม่พบพนักงาน</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 w-10">#</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500">พนักงาน</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden sm:table-cell">ตำแหน่งงาน</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden md:table-cell">แผนก</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden lg:table-cell">วันเริ่มงาน</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden lg:table-cell">ทีม</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.map((u, i) => {
                    const teamName = u.teamId ? (teamMap[u.teamId] ?? null) : null
                    const isSelected = u.uid === selectedUserId
                    return (
                      <tr
                        key={u.uid}
                        onClick={() => setSelectedUserId(u.uid)}
                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-freshket-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-4 py-3.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.photoURL} alt={u.displayName} className="size-8 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="size-8 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-xs font-bold shrink-0">
                                {u.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{u.displayName}</p>
                              {u.nickname && <p className="text-xs text-gray-400 leading-tight">{u.nickname}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600 hidden sm:table-cell max-w-36 truncate">
                          {u.position ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 hidden md:table-cell">
                          {u.department
                            ? <span className={`inline-block text-xs font-normal px-2 py-0.5 rounded-full ${deptColor(u.department)}`}>{u.department}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
                          {u.startDate ? formatDateEN(u.startDate) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 hidden lg:table-cell">
                          {teamName
                            ? <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full whitespace-nowrap">{teamName}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 w-8">
                          <svg className="size-4 text-gray-200 group-hover:text-freshket-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Backdrop + Sidebar */}
      {selectedUser && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-30"
            onClick={() => setSelectedUserId(null)}
          />
          <EmployeeSidebar
            user={selectedUser}
            records={records}
            teamMap={teamMap}
            onClose={() => setSelectedUserId(null)}
          />
        </>
      )}
    </div>
  )
}

// ── Employee Sidebar ───────────────────────────────────────────────────────────
function EmployeeSidebar({
  user,
  records,
  teamMap,
  onClose,
}: {
  user: UserProfile
  records: TrainingRecord[]
  teamMap: Record<string, string>
  onClose: () => void
}) {
  const [tab, setTab] = useState<'info' | 'history' | 'radar'>('info')

  const userRecords = useMemo(
    () => records
      .filter(r => r.userId === user.uid)
      .sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt as unknown as string).getTime() : 0
        const tb = b.completedAt ? new Date(b.completedAt as unknown as string).getTime() : 0
        return tb - ta
      }),
    [records, user.uid],
  )

  const teamName      = user.teamId ? (teamMap[user.teamId] ?? null) : null
  const isSaleDept    = user.department?.toLowerCase().includes('sale') || user.role === 'sale'
  const completedCount = userRecords.filter(r => r.status === 'completed').length
  const scores        = userRecords.filter(r => r.score != null).map(r => r.score as number)
  const avgScore      = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  type TabKey = 'info' | 'history' | 'radar'
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'info',    label: 'ข้อมูลพนักงาน' },
    { key: 'history', label: 'ประวัติการเรียน' },
    ...(isSaleDept ? [{ key: 'radar' as TabKey, label: 'Radar Chart' }] : []),
  ]

  return (
    <aside
      className="fixed top-0 right-0 h-full bg-white shadow-2xl z-40 flex flex-col border-l border-gray-100"
      style={{ width: 'min(500px, 100vw)', animation: 'panelIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
    >
      <style>{`@keyframes panelIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-2xl bg-freshket-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 text-xl font-bold shrink-0">
            {user.displayName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug truncate">{user.displayName}</p>
            {user.nickname && <p className="text-sm text-gray-400">{user.nickname}</p>}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {user.employeeId && (
                <span className="font-mono text-xs bg-freshket-100 text-freshket-700 border border-freshket-200 px-2 py-0.5 rounded-full">
                  {user.employeeId}
                </span>
              )}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all shrink-0"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-50 text-xs text-gray-500">
          <span>
            <span className="font-bold text-freshket-600">{completedCount}</span> หลักสูตรผ่าน
          </span>
          <span>
            <span className="font-bold text-gray-700">{userRecords.length}</span> รายการทั้งหมด
          </span>
          {avgScore !== null && (
            <span>
              เฉลี่ย{' '}
              <span className={`font-bold ${scoreTextColor(avgScore)}`}>{avgScore}</span>
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 shrink-0 px-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
              tab === t.key
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* Tab 1 — ข้อมูลพนักงาน */}
        {tab === 'info' && (
          <div className="p-5 space-y-0.5">
            <InfoRow label="รหัสพนักงาน"  value={user.employeeId ?? '—'} mono />
            <InfoRow label="ตำแหน่งงาน"   value={user.position ?? '—'} />
            <InfoRow label="แผนก"          value={user.department ?? '—'} />
            <InfoRow label="ทีม"           value={teamName ?? '—'} />
            <InfoRow label="วันเริ่มงาน"  value={user.startDate ? formatDateEN(user.startDate) : '—'} />
            <InfoRow label="อายุงาน"       value={calcTenure(user.startDate as Date | undefined)} mono />
            <InfoRow label="Line Manager"  value={user.lineManager ?? '—'} />
            <InfoRow label="Email"         value={user.email} />
          </div>
        )}

        {/* Tab 2 — ประวัติการเรียน */}
        {tab === 'history' && (
          <div className="p-4 space-y-3">
            {userRecords.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-12">ยังไม่มีประวัติการเรียน</p>
            ) : userRecords.map(rec => (
              <div key={rec.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <p className="font-bold text-sm text-gray-800 leading-snug flex-1">{rec.courseTitle}</p>
                  <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_PASTEL[rec.status]}`}>
                    {STATUS_LABELS[rec.status]}
                  </span>
                </div>

                {rec.score != null && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">คะแนน</span>
                      <span className={`font-bold ${scoreTextColor(rec.score)}`}>{rec.score} / 100</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${rec.score}%`, background: scoreBarColor(rec.score) }}
                      />
                    </div>
                    {rec.passScore != null && (
                      <p className="text-xs text-gray-400 mt-1">เกณฑ์ผ่าน: {rec.passScore}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-400">
                  {rec.completedAt && <span>สำเร็จ {formatDate(rec.completedAt)}</span>}
                  {rec.attemptCount > 1 && <span>{rec.attemptCount} ครั้ง</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3 — Radar Chart (Sale dept only) */}
        {tab === 'radar' && (
          <div className="flex flex-col items-center justify-center h-72 p-8 text-center">
            <div className="size-16 rounded-2xl bg-freshket-50 border border-freshket-200 flex items-center justify-center mb-4">
              <svg className="size-8 text-freshket-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 7.5H21l-6.5 4.5 2.5 7.5L12 18l-5 4.5 2.5-7.5L4 10.5h6.5L12 3z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-700 mb-2">Shadow Radar Chart</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              จะแสดงเมื่อมีข้อมูลจาก<br />Role Play Assessment
            </p>
          </div>
        )}

      </div>
    </aside>
  )
}

// ── Info Row ───────────────────────────────────────────────────────────────────
function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-px">{label}</span>
      <span className={`text-xs text-gray-800 font-normal flex-1 break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, unit, bg, iconBg, iconColor, icon,
}: {
  label: string; value: string | number; unit?: string
  bg: string; iconBg: string; iconColor: string; icon: React.ReactNode
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 flex flex-col gap-3 border border-white/80`}>
      <div className={`size-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor} shrink-0`}>
        {icon}
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          {unit && <span className="text-xs text-gray-500 font-normal">{unit}</span>}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 font-normal">{label}</p>
      </div>
    </div>
  )
}

// ── Department Pill ───────────────────────────────────────────────────────────
function DeptPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  )
}
