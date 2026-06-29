'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Department, Team, UserProfile } from '@/types/user'
import { ROLE_LABELS } from '@/types/user'
import { useMyTrainingRecords } from '@/hooks/useFirestore'
import { formatDate } from '@/lib/utils/dateFormatter'

// ── Score helpers ─────────────────────────────────────────────────────────────

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

// ── Breakdown bar ─────────────────────────────────────────────────────────────

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-400 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-4 text-right text-gray-600 font-bold tabular-nums">{count}</span>
    </div>
  )
}

// ── User Card Modal ───────────────────────────────────────────────────────────

function UserCardModal({
  user,
  teams,
  onClose,
}: {
  user: UserProfile
  teams: Team[]
  onClose: () => void
}) {
  const router = useRouter()
  const { data: records, loading } = useMyTrainingRecords(user.uid)

  const team = teams.find(t => t.id === user.teamId)
  const total = records.length
  const completed  = records.filter(r => r.status === 'completed').length
  const inProgress = records.filter(r => r.status === 'in_progress').length
  const failed     = records.filter(r => r.status === 'failed').length
  const notStarted = total - completed - inProgress - failed
  const scores     = records.filter(r => r.score != null).map(r => r.score!)
  const avgScore   = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        style={{ animation: 'cardModalIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes cardModalIn { from { opacity:0; transform:scale(0.93) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>

        {/* ── Top section ── */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-4">
            <div className="size-14 rounded-2xl bg-freshket-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 text-2xl font-bold shrink-0">
              {user.displayName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-base leading-snug truncate">{user.displayName}</p>
              {user.nickname && (
                <p className="text-sm text-gray-400">ชื่อเล่น: {user.nickname}</p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs font-bold bg-freshket-100 text-freshket-700 border border-freshket-200 px-2.5 py-0.5 rounded-full">
                  {ROLE_LABELS[user.role]}
                </span>
                {team && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">
                    {team.name}
                  </span>
                )}
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

          {/* Info row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-gray-500">
            {user.employeeId && (
              <span className="flex items-center gap-1">
                <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zM12.75 9.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
                </svg>
                <span className="font-mono">{user.employeeId}</span>
              </span>
            )}
            {user.startDate && (
              <span className="flex items-center gap-1">
                <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                เข้างาน {formatDate(user.startDate)}
              </span>
            )}
            {user.department && (
              <span className="flex items-center gap-1">
                <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                {user.department}
              </span>
            )}
          </div>
        </div>

        {/* ── Training stats ── */}
        <div className="px-6 pb-5 border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 mb-3">ความคืบหน้าการฝึกอบรม</p>

          {loading ? (
            <div className="flex justify-center py-4">
              <span className="size-5 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : total === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="flex items-start gap-5">
              <div className="text-center shrink-0 w-14">
                <p className={`text-3xl font-bold leading-none ${avgScore != null ? scoreColor(avgScore) : 'text-gray-300'}`}>
                  {avgScore ?? '—'}
                </p>
                <p className="text-xs text-gray-400 mt-1">คะแนนเฉลี่ย</p>
              </div>
              <div className="flex-1 space-y-1.5">
                <Bar label="ผ่านแล้ว"    count={completed}  total={total} color="#00ce7c" />
                <Bar label="กำลังเรียน"  count={inProgress} total={total} color="#60a5fa" />
                <Bar label="ไม่ผ่าน"     count={failed}     total={total} color="#f87171" />
                <Bar label="ยังไม่เริ่ม" count={notStarted} total={total} color="#d1d5db" />
              </div>
            </div>
          )}
        </div>

        {/* ── Action footer ── */}
        <div className="px-6 pb-6">
          <button
            onClick={() => { onClose(); router.push(`/users/${user.uid}`) }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all"
          >
            ดูรายงานเต็ม
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Score chip ────────────────────────────────────────────────────────────────

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-xs">—</span>
  return (
    <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
  )
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  index,
  records,
  onClick,
}: {
  user: UserProfile
  index: number
  records: { status: string; score?: number | null }[]
  onClick: () => void
}) {
  const completed  = records.filter(r => r.status === 'completed').length
  const inProgress = records.filter(r => r.status === 'in_progress').length
  const failed     = records.filter(r => r.status === 'failed').length
  const total      = records.length
  const scores     = records.filter(r => r.score != null).map(r => r.score as number)
  const avg        = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-freshket-50 transition-colors group border-b border-gray-50 last:border-0"
    >
      <td className="py-2.5 px-3">
        {user.employeeId
          ? <span className="font-mono text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{user.employeeId}</span>
          : <span className="text-gray-300 text-xs">—</span>}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-sm font-bold shrink-0">
            {user.displayName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate leading-snug">{user.displayName}</p>
            {user.nickname && <p className="text-xs text-gray-400 leading-snug">{user.nickname}</p>}
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3 hidden md:table-cell">
        <span className="text-xs text-gray-500">{user.startDate ? formatDate(user.startDate) : '—'}</span>
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: scoreBarColor(avg ?? 0) }}
            />
          </div>
          <ScoreChip score={avg} />
        </div>
      </td>
      <td className="py-2.5 px-3 w-8">
        <svg className="size-4 text-gray-200 group-hover:text-freshket-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </td>
    </tr>
  )
}

// ── Pre-fetch training records per team ───────────────────────────────────────
// We pass pre-computed record maps so each row doesn't trigger its own hook.
// (React rules: hooks must be called at the top level — we call this in the parent.)

// ── Team section ──────────────────────────────────────────────────────────────

function TeamSection({
  team,
  users,
  allTeams,
  accentClass,
  onSelectUser,
}: {
  team: Team
  users: UserProfile[]
  allTeams: Team[]
  accentClass: string
  onSelectUser: (u: UserProfile) => void
}) {
  const tl = users.find(u => u.uid === team.teamLeadId)
  const members = users.filter(u => u.teamId === team.id)
  const allInTeam = [...(tl && !members.includes(tl) ? [tl] : []), ...members]

  if (allInTeam.length === 0) return null

  return (
    <div className="mb-4 last:mb-0">
      {/* Team sub-header */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-t-xl ${accentClass}`}>
        <svg className="size-3.5 text-current opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <span className="text-xs font-bold">{team.name}</span>
        <span className="text-xs opacity-60">{allInTeam.length} คน</span>
        {tl && (
          <>
            <span className="opacity-40">·</span>
            <span className="text-xs opacity-70">TL: {tl.displayName}</span>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 border-t-0 rounded-b-xl overflow-hidden shadow-sm">
        <table className="w-full">
          <tbody>
            {allInTeam.map((u, i) => (
              <UserRow
                key={u.uid}
                user={u}
                index={i}
                records={[]}
                onClick={() => onSelectUser(u)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Department section ────────────────────────────────────────────────────────

const DEPT_ACCENTS = [
  { header: 'bg-freshket-50 text-freshket-800 border border-freshket-200', sub: 'bg-freshket-50 text-freshket-700' },
  { header: 'bg-blue-50 text-blue-800 border border-blue-200',             sub: 'bg-blue-50 text-blue-700' },
  { header: 'bg-purple-50 text-purple-800 border border-purple-200',       sub: 'bg-purple-50 text-purple-700' },
  { header: 'bg-amber-50 text-amber-800 border border-amber-200',          sub: 'bg-amber-50 text-amber-700' },
]

// ── OrgTable (main export) ────────────────────────────────────────────────────

interface OrgTableProps {
  departments: Department[]
  teams: Team[]
  users: UserProfile[]
}

export function OrgTable({ departments, teams, users }: OrgTableProps) {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  const unassigned = users.filter(u => !u.teamId && u.role === 'sale')

  return (
    <div className="space-y-6">
      {departments.map((dept, dIdx) => {
        const accent = DEPT_ACCENTS[dIdx % 4]
        const manager = users.find(u => u.uid === dept.managerId)
        const deptTeams = teams.filter(t => t.departmentId === dept.id)
        const deptUserCount = deptTeams.reduce(
          (n, t) => n + users.filter(u => u.teamId === t.id).length,
          0
        )

        return (
          <div key={dept.id}>
            {/* Dept header */}
            <div className={`flex items-center justify-between gap-3 px-5 py-3 rounded-2xl mb-3 ${accent.header}`}>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-xl bg-white/60 flex items-center justify-center text-sm font-bold">
                  {dept.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sm">{dept.name}</p>
                  <p className="text-xs opacity-60">{deptTeams.length} ทีม · {deptUserCount} คน</p>
                </div>
              </div>
              {manager && (
                <div
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setSelectedUser(manager)}
                  title="ดูข้อมูล Manager"
                >
                  <div className="text-right">
                    <p className="text-xs opacity-60">Manager</p>
                    <p className="text-xs font-bold">{manager.displayName}</p>
                  </div>
                  <div className="size-7 rounded-full bg-white/70 flex items-center justify-center text-xs font-bold">
                    {manager.displayName.charAt(0)}
                  </div>
                </div>
              )}
            </div>

            {/* Table header */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden mb-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-400">รหัส</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-400">ชื่อ</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-400 hidden md:table-cell">วันเข้างาน</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-400">คะแนนเฉลี่ย</th>
                    <th className="w-8" />
                  </tr>
                </thead>
              </table>
            </div>

            {/* Teams */}
            {deptTeams.map(t => (
              <TeamSection
                key={t.id}
                team={t}
                users={users}
                allTeams={teams}
                accentClass={accent.sub}
                onSelectUser={setSelectedUser}
              />
            ))}

            {deptTeams.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-sm text-gray-400">
                ยังไม่มีทีม
              </div>
            )}
          </div>
        )
      })}

      {/* Unassigned */}
      {unassigned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl mb-3 bg-gray-100 text-gray-600 border border-gray-200">
            <svg className="size-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <span className="text-sm font-bold">ยังไม่ได้จัดทีม</span>
            <span className="text-xs opacity-60">{unassigned.length} คน</span>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full">
              <tbody>
                {unassigned.map((u, i) => (
                  <UserRow key={u.uid} user={u} index={i} records={[]} onClick={() => setSelectedUser(u)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {departments.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <p className="text-sm">ยังไม่มีข้อมูลทีม</p>
        </div>
      )}

      {/* User card overlay */}
      {selectedUser && (
        <UserCardModal
          user={selectedUser}
          teams={teams}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}
