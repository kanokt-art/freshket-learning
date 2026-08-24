'use client'

import { useState, useMemo, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { getClientFirestore } from '@/lib/firebase/client'
import { getDemoMode } from '@/lib/demo/demoMode'
import { useAuth } from '@/hooks/useAuth'
import { useTeamTrainingRecords, useAllUsers, useTeams, useShadowRecordsByUser, useAssessmentScoresByUser, useRoleplayAssessmentsByUser, useFirestoreList } from '@/hooks/useFirestore'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { RoleplayRadar } from '@/components/features/RoleplayRadar'
import { STATUS_LABELS, type TrainingStatus, type TrainingRecord } from '@/types/tracking'
import { canAccess, ROLE_LABELS, getTeamManagerIds, getTeamLeadIds, type UserProfile } from '@/types/user'
import type { AssessmentScore } from '@/types/assessmentScore'
import { canViewByLevel } from '@/lib/jobLevel'
import { formatDateEN } from '@/lib/utils/dateFormatter'

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
function scorePastel(s: number) { return s >= 80 ? 'bg-freshket-100 text-freshket-700' : s >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700' }

function ddmmyyyy(d: Date | string | undefined | null): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d as string)
  if (isNaN(dt.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`
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

// Prefer the English full name; fall back to the Thai name when EN is missing.
function enName(u: { displayNameEN?: string; displayName: string }): string {
  return u.displayNameEN?.trim() || u.displayName
}

// Millis from a Date | Firestore-Timestamp | ISO string (0 if unusable).
function toMillis(v: unknown): number {
  if (!v) return 0
  if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime()
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') {
    const d = (v as { toDate(): Date }).toDate()
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }
  return 0
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const { user } = useAuth()
  const { data: allUsers } = useAllUsers()
  const { data: teams } = useTeams()

  // Teams this manager oversees. Source of truth = the team docs' managerId /
  // teamLeadId (exactly what OrgBoard shows), UNIONed with any explicit
  // visibleTeamIds and their own teamId. Relying on visibleTeamIds alone broke
  // when a manager was linked via team.managerId but their visibleTeamIds was
  // never populated — the roster then showed 0 members.
  const managedTeamIds = useMemo(() => {
    const set = new Set<string>()
    teams.forEach(t => { if (getTeamManagerIds(t).includes(user?.uid ?? '') || getTeamLeadIds(t).includes(user?.uid ?? '')) set.add(t.id) })
    ;(user?.visibleTeamIds ?? []).forEach(id => set.add(id))
    if (user?.teamId) set.add(user.teamId)
    return set
  }, [teams, user?.uid, user?.visibleTeamIds, user?.teamId])

  // Exclude the manager themselves, and anyone more senior — a viewer only sees
  // members at or below their own level (a team_lead never sees the manager).
  const users = useMemo(
    () => allUsers.filter(u =>
      u.uid !== user?.uid &&
      u.teamId && managedTeamIds.has(u.teamId) &&
      !!user && canViewByLevel(user, u)),
    [allUsers, managedTeamIds, user],
  )

  // Records scoped to the managed members. This used to stream the ENTIRE
  // trainingRecords collection (ungated) and then throw most of it away here; now
  // the member uids drive the query itself, so a manager reads only their own
  // people. Teams above the `in` limit still fall back to a filtered full read
  // inside the hook, so behaviour is identical either way.
  const memberUids = useMemo(() => users.map(u => u.uid), [users])
  const { data: records, loading } = useTeamTrainingRecords(memberUids)
  const [activeDept, setActiveDept] = useState<string>('all')
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'name' | 'position' | 'department' | 'startDate' | 'team'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

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

  // Stat cards. "พนักงานทั้งหมด" = the managed roster (same set the table shows),
  // NOT the count of users who happen to have a training record — the old
  // records-based count read "2 คน" while the roster below listed 11.
  const totalUsers    = users.length
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
        enName(u).toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.nickname?.toLowerCase() ?? '').includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q)
      return matchDept && matchSearch
    })
  }, [users, activeDept, userSearch])

  // Sorted view of the filtered members — driven by the clickable column headers.
  const sortedUsers = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const val = (u: UserProfile): string | number => {
      switch (sortField) {
        case 'name':       return enName(u).toLowerCase()
        case 'position':   return (u.position ?? '').toLowerCase()
        case 'department': return (u.department ?? '').toLowerCase()
        case 'team':       return (u.teamId ? (teamMap[u.teamId] ?? '') : '').toLowerCase()
        case 'startDate': {
          const d = u.startDate instanceof Date ? u.startDate : (u.startDate ? new Date(u.startDate as unknown as string) : null)
          return d && !isNaN(d.getTime()) ? d.getTime() : 0
        }
      }
    }
    return [...filteredUsers].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filteredUsers, sortField, sortDir, teamMap])

  const selectedUser = selectedUserId ? users.find(u => u.uid === selectedUserId) ?? null : null

  // ── Per-member "new training data" notification ─────────────────────────────
  // A red dot marks members whose latest training record was written AFTER the
  // manager last opened them. "Seen" timestamps are stored per-manager in
  // localStorage so the dot survives reloads and only clears when THIS manager
  // opens the member — not on someone else's read.
  const latestTrainingByUser = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of records) {
      const t = Math.max(toMillis(r.updatedAt), toMillis(r.completedAt), toMillis(r.startedAt))
      if (t > (m[r.userId] ?? 0)) m[r.userId] = t
    }
    return m
  }, [records])

  const seenKey = user?.uid ? `mgr_seen_training_${user.uid}` : null
  const [seenMap, setSeenMap] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!seenKey) { setSeenMap({}); return }
    try {
      const raw = localStorage.getItem(seenKey)
      setSeenMap(raw ? JSON.parse(raw) : {})
    } catch { setSeenMap({}) }
  }, [seenKey])

  const isUnread = (uid: string) => {
    const latest = latestTrainingByUser[uid] ?? 0
    return latest > 0 && latest > (seenMap[uid] ?? 0)
  }

  // Mark a member's training updates as read (persist immediately). Called when
  // the manager actually opens that member's ประวัติการเรียน tab — so the row
  // dot and the tab dot clear together, and only on a real read (not merely
  // opening the card).
  function markTrainingRead(uid: string) {
    if (!isUnread(uid)) return
    setSeenMap(prev => {
      const next = { ...prev, [uid]: Date.now() }
      if (seenKey) { try { localStorage.setItem(seenKey, JSON.stringify(next)) } catch {} }
      return next
    })
  }

  const unreadCount = useMemo(
    () => sortedUsers.filter(u => isUnread(u.uid)).length,
    // isUnread depends on latestTrainingByUser + seenMap; both are deps here
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedUsers, latestTrainingByUser, seenMap],
  )

  if (user && !canAccess(user.role, 'team_lead')) {
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
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-sm">รายชื่อพนักงาน</h3>
              {unreadCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                  <span className="size-1.5 rounded-full bg-rose-500" />
                  {unreadCount} ใหม่
                </span>
              )}
            </div>
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
                    <SortableTh label="พนักงาน" field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh label="ตำแหน่งงาน" field="position" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="hidden sm:table-cell" />
                    <SortableTh label="แผนก" field="department" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="hidden md:table-cell" />
                    <SortableTh label="วันเริ่มงาน" field="startDate" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                    <SortableTh label="ทีม" field="team" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="hidden lg:table-cell" />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sortedUsers.map((u, i) => {
                    const teamName = u.teamId ? (teamMap[u.teamId] ?? null) : null
                    const isSelected = u.uid === selectedUserId
                    const unread = isUnread(u.uid)
                    return (
                      <tr
                        key={u.uid}
                        onClick={() => setSelectedUserId(u.uid)}
                        className={`cursor-pointer transition-colors group ${isSelected ? 'bg-freshket-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-4 py-3.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              {u.photoURL ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.photoURL} alt={u.displayName} className="size-8 rounded-full object-cover" />
                              ) : (
                                <div className="size-8 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-xs font-bold">
                                  {enName(u).charAt(0)}
                                </div>
                              )}
                              {/* New-training-data indicator — clears when this manager opens the member */}
                              {unread && (
                                <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                                  <span className="relative inline-flex size-2.5 rounded-full bg-rose-500 border-2 border-white" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-gray-900 truncate">{enName(u)}</p>
                                {unread && <span className="text-xs font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-full leading-none shrink-0">ใหม่</span>}
                              </div>
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

      {/* Card overlay */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setSelectedUserId(null)}
        >
          <EmployeeSidebar
            user={selectedUser}
            records={records}
            teamMap={teamMap}
            hasNewTraining={isUnread(selectedUser.uid)}
            onReadTraining={() => markTrainingRead(selectedUser.uid)}
            onClose={() => setSelectedUserId(null)}
          />
        </div>
      )}
    </div>
  )
}

// ── Employee Sidebar ───────────────────────────────────────────────────────────
function EmployeeSidebar({
  user,
  records,
  teamMap,
  hasNewTraining,
  onReadTraining,
  onClose,
}: {
  user: UserProfile
  records: TrainingRecord[]
  teamMap: Record<string, string>
  hasNewTraining: boolean
  onReadTraining: () => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'info' | 'history' | 'assess' | 'shadow' | 'radar'>('info')

  // Opening the ประวัติการเรียน tab is the "read" that clears both the tab dot
  // and the member's row dot. The isUnread guard in onReadTraining makes the
  // repeated call a no-op once already cleared, so identity churn is harmless.
  useEffect(() => {
    if (tab === 'history' && hasNewTraining) onReadTraining()
  }, [tab, hasNewTraining, onReadTraining])
  const { user: viewer } = useAuth()
  const canFeedback = viewer ? canAccess(viewer.role, 'team_lead') : false

  // Shadow Visit tab appears only when this member's department has the shadow
  // module enabled by super_admin (appConfig/moduleAccess).
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user.role, user.department)
  const showShadow = !moduleLoading && allowedModules.has('shadow')
  const { data: shadowRecords } = useShadowRecordsByUser(showShadow ? user.uid : undefined)

  // Imported Pre/Post assessment scores, grouped by subject with the latest
  // pre → latest post and the improvement between them.
  const { data: assessmentScores } = useAssessmentScoresByUser(user.uid)
  const { data: roleplayAssessments } = useRoleplayAssessmentsByUser(user.uid)
  // Latest Post + latest Pre (max 2 polygons) for the radar.
  const radarAssessments = useMemo(() => {
    const post = roleplayAssessments.find(a => a.type === 'post')
    const pre = roleplayAssessments.find(a => a.type === 'pre')
    return [post, pre].filter((a): a is NonNullable<typeof a> => !!a)
  }, [roleplayAssessments])
  const assessBySubject = useMemo(() => {
    const map = new Map<string, { subject: string; pre?: AssessmentScore; post?: AssessmentScore }>()
    for (const a of assessmentScores) {
      const g = map.get(a.subject) ?? { subject: a.subject }
      const t = a.takenAt instanceof Date ? a.takenAt : new Date(a.takenAt as unknown as string)
      if (a.type === 'pre') {
        const prev = g.pre?.takenAt ? new Date(g.pre.takenAt as unknown as string) : null
        if (!prev || t >= prev) g.pre = a
      } else {
        const prev = g.post?.takenAt ? new Date(g.post.takenAt as unknown as string) : null
        if (!prev || t >= prev) g.post = a
      }
      map.set(a.subject, g)
    }
    return Array.from(map.values())
  }, [assessmentScores])
  const showAssess = assessBySubject.length > 0

  // Employee reflections ("act knowledge") + the lead's feedback, keyed by
  // courseId. Both read through the shared warm-listener registry (keyed by this
  // member's uid) so re-opening a member detail is instant — previously each
  // mount fired a fresh getDocs pair and re-read from Firestore every time.
  const takeawayDocs = useFirestoreList<{ courseId?: string; text?: string }>(
    'takeaways',
    [{ type: 'where', field: 'uid', op: '==', value: user.uid }],
    !getDemoMode() && !!user.uid,
  )
  const feedbackDocs = useFirestoreList<{ courseId?: string; comment?: string; score?: number | null; leadName?: string }>(
    'courseFeedback',
    [{ type: 'where', field: 'memberUid', op: '==', value: user.uid }],
    !getDemoMode() && !!user.uid,
  )

  const takeaways = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of takeawayDocs.data) if (d.courseId) m[d.courseId] = d.text ?? ''
    return m
  }, [takeawayDocs.data])

  // Local optimistic overlay for feedback the lead just saved — merged on top of
  // the live docs so the UI reflects a save instantly, before the listener
  // round-trips. Once the listener catches up the overlay is simply redundant.
  const [feedbackOverlay, setFeedbackOverlay] = useState<Record<string, { comment: string; score: number | null; leadName?: string }>>({})
  const feedback = useMemo(() => {
    const m: Record<string, { comment: string; score: number | null; leadName?: string }> = {}
    for (const d of feedbackDocs.data) if (d.courseId) m[d.courseId] = { comment: d.comment ?? '', score: d.score ?? null, leadName: d.leadName }
    return { ...m, ...feedbackOverlay }
  }, [feedbackDocs.data, feedbackOverlay])

  async function saveFeedback(courseId: string, comment: string, score: number | null) {
    const next = { comment, score, leadName: viewer?.displayName }
    setFeedbackOverlay((prev) => ({ ...prev, [courseId]: next }))
    try {
      const db = getClientFirestore()
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore')
      await setDoc(doc(db, 'courseFeedback', `${user.uid}_${courseId}`), {
        memberUid: user.uid, courseId, comment, score,
        leadUid: viewer?.uid ?? '', leadName: viewer?.displayName ?? '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
    } catch (e) {
      console.error('saveFeedback', e)
      alert('บันทึกความคิดเห็นไม่สำเร็จ')
    }
  }

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

  type TabKey = 'info' | 'history' | 'assess' | 'shadow' | 'radar'
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'info',    label: 'ข้อมูลพนักงาน' },
    { key: 'history', label: 'ประวัติการเรียน' },
    ...(showAssess ? [{ key: 'assess' as TabKey, label: 'แบบทดสอบ' }] : []),
    ...(showShadow ? [{ key: 'shadow' as TabKey, label: 'Shadow Visit' }] : []),
    ...(isSaleDept ? [{ key: 'radar' as TabKey, label: 'Radar Chart' }] : []),
  ]

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-white rounded-3xl shadow-2xl flex flex-col border border-gray-100 w-[min(1080px,96vw)] h-[min(760px,94vh)]"
      style={{ animation: 'panelIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
    >
      <style>{`@keyframes panelIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>

      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-start gap-4">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt={user.displayName} className="size-16 rounded-2xl object-cover border-2 border-freshket-200 shrink-0" />
          ) : (
            <div className="size-16 rounded-2xl bg-gradient-to-br from-freshket-200 to-emerald-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 shrink-0 overflow-hidden">
              <svg className="size-9" viewBox="0 0 24 24" fill="currentColor" opacity={0.85}>
                <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6z" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-snug truncate">{enName(user)}</p>
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
            <span className="inline-flex items-center justify-center gap-1.5">
              {t.label}
              {t.key === 'history' && hasNewTraining && (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-2 rounded-full bg-rose-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                </span>
              )}
            </span>
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
              <div key={rec.id} className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-bold text-sm text-gray-800 leading-snug flex-1">{rec.courseTitle}</p>
                  <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_PASTEL[rec.status]}`}>
                    {STATUS_LABELS[rec.status]}
                  </span>
                </div>

                {/* วันที่เรียน (dd/mm/yyyy) */}
                <div className="flex items-center gap-3 text-xs text-gray-400 mb-2.5">
                  <span>วันที่เรียน {ddmmyyyy(rec.completedAt ?? rec.startedAt)}</span>
                  {rec.attemptCount > 1 && <span>· {rec.attemptCount} ครั้ง</span>}
                </div>

                {rec.score != null && (
                  <div className="mb-2.5">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">คะแนน</span>
                      <span className={`font-bold ${scoreTextColor(rec.score)}`}>{rec.score} / 100</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rec.score}%`, background: scoreBarColor(rec.score) }} />
                    </div>
                    {rec.passScore != null && <p className="text-xs text-gray-400 mt-1">เกณฑ์ผ่าน: {rec.passScore}</p>}
                  </div>
                )}

                {/* Reflect knowledge (จากพนักงาน) + หัวหน้าคอมเมนต์ข้างล่าง */}
                <div className="mt-1 rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-freshket-50 border-b border-freshket-100 px-3 py-2.5">
                    <p className="text-xs font-bold text-freshket-700 mb-1">Reflect Knowledge (จากพนักงาน)</p>
                    {takeaways[rec.courseId] ? (
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{takeaways[rec.courseId]}</p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">ยังไม่มี reflection จากพนักงาน</p>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <FeedbackBlock
                      courseId={rec.courseId}
                      existing={feedback[rec.courseId]}
                      canEdit={canFeedback}
                      onSave={saveFeedback}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab — แบบทดสอบ (imported Pre/Post scores) */}
        {tab === 'assess' && (
          <div className="p-4 space-y-3">
            {assessBySubject.map(({ subject, pre, post }) => {
              const delta = pre && post ? post.pct - pre.pct : null
              return (
                <div key={subject} className="border border-gray-100 rounded-xl p-4">
                  <p className="font-bold text-sm text-gray-800 mb-3">{subject}</p>
                  <div className="flex items-center gap-3">
                    {/* Pre */}
                    <div className="flex-1 rounded-xl bg-slate-50 border border-gray-100 p-3 text-center">
                      <p className="text-xs text-gray-400 mb-1">Pre-Test</p>
                      {pre ? (
                        <>
                          <p className={`text-xl font-black ${scoreTextColor(pre.pct)}`}>{pre.pct}%</p>
                          <p className="text-xs text-gray-400 mt-0.5">{pre.score}/{pre.total}</p>
                        </>
                      ) : <p className="text-sm text-gray-300 py-2">—</p>}
                    </div>
                    {/* Arrow + delta */}
                    <div className="flex flex-col items-center shrink-0">
                      <svg className="size-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6-6m6 6l-6 6" /></svg>
                      {delta != null && (
                        <span className={`text-xs font-bold mt-1 ${delta > 0 ? 'text-freshket-600' : delta < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                          {delta > 0 ? `+${delta}` : delta}%
                        </span>
                      )}
                    </div>
                    {/* Post */}
                    <div className="flex-1 rounded-xl bg-freshket-50 border border-freshket-100 p-3 text-center">
                      <p className="text-xs text-freshket-600 mb-1">Post-Test</p>
                      {post ? (
                        <>
                          <p className={`text-xl font-black ${scoreTextColor(post.pct)}`}>{post.pct}%</p>
                          <p className="text-xs text-gray-400 mt-0.5">{post.score}/{post.total}</p>
                        </>
                      ) : <p className="text-sm text-gray-300 py-2">—</p>}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2.5">
                    {pre && `Pre ${ddmmyyyy(pre.takenAt)}`}{pre && post ? ' · ' : ''}{post && `Post ${ddmmyyyy(post.takenAt)}`}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Tab — Shadow Visit (dept has shadow module) */}
        {tab === 'shadow' && (
          <div className="p-4 space-y-3">
            {shadowRecords.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-12">ยังไม่มีประวัติ Shadow Visit</p>
            ) : shadowRecords.map(rec => {
              const rating = rec.ratingScore ?? null
              return (
                <div key={rec.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-800 leading-snug truncate">{rec.storeName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rec.mentorName ? `พี่เลี้ยง ${rec.mentorName}` : '—'}{rec.mentorPosition ? ` · ${rec.mentorPosition}` : ''}
                      </p>
                    </div>
                    {rating != null && (
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${scorePastel(rating * 20)}`}>
                        {rating}/5
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">{rec.segment}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{rec.persona}</span>
                    <span className="text-xs text-gray-400 ml-auto">{ddmmyyyy(rec.createdAt)}</span>
                  </div>
                  {rec.evaluationFeedback && (
                    <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-50 pt-2 mt-1 whitespace-pre-wrap">
                      {rec.evaluationFeedback}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Tab — Radar Chart (Sale dept only): real roleplay assessment radar */}
        {tab === 'radar' && (
          radarAssessments.length > 0 ? (
            <div className="p-4">
              <p className="text-sm font-bold text-gray-900 mb-1 text-center">Role Play Radar</p>
              <p className="text-xs text-gray-400 text-center mb-2">ค่าเฉลี่ยรายด้าน (เต็ม 10){radarAssessments.length > 1 ? ' · Pre เทียบ Post' : ''}</p>
              <RoleplayRadar assessments={radarAssessments} />
            </div>
          ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-72 p-8 text-center">
            <div className="size-16 rounded-2xl bg-freshket-50 border border-freshket-200 flex items-center justify-center mb-4">
              <svg className="size-8 text-freshket-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 7.5H21l-6.5 4.5 2.5 7.5L12 18l-5 4.5 2.5-7.5L4 10.5h6.5L12 3z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-700 mb-2">Role Play Radar</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              จะแสดงเมื่อมีข้อมูลจาก<br />Role Play Assessment
            </p>
          </div>
          )
        )}

      </div>
    </div>
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

// ── Feedback (lead/manager comment + score on a member's course) ────────────────
function FeedbackBlock({ courseId, existing, canEdit, onSave }: {
  courseId: string
  existing?: { comment: string; score: number | null; leadName?: string }
  canEdit: boolean
  onSave: (courseId: string, comment: string, score: number | null) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState(existing?.comment ?? '')
  const [score, setScore] = useState<string>(existing?.score != null ? String(existing.score) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setComment(existing?.comment ?? '')
    setScore(existing?.score != null ? String(existing.score) : '')
  }, [existing])

  async function submit() {
    setSaving(true)
    const n = score.trim() === '' ? null : Math.max(0, Math.min(100, Number(score) || 0))
    try {
      await onSave(courseId, comment.trim(), n)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  // Read-only view of existing feedback
  if (!editing) {
    return (
      <>
        {existing && (existing.comment || existing.score != null) ? (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs font-bold text-blue-700">ความเห็นหัวหน้า{existing.leadName ? ` · ${existing.leadName}` : ''}</p>
              {existing.score != null && (
                <span className={`text-xs font-black ${scoreTextColor(existing.score)}`}>{existing.score}/100</span>
              )}
            </div>
            {existing.comment && <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{existing.comment}</p>}
            {canEdit && (
              <button onClick={() => setEditing(true)} className="text-xs font-bold text-blue-600 hover:text-blue-700 mt-1.5">แก้ไข</button>
            )}
          </div>
        ) : canEdit ? (
          <button onClick={() => setEditing(true)} className="text-xs font-bold text-freshket-600 hover:text-freshket-700">
            + ให้คะแนน / คอมเมนต์
          </button>
        ) : (
          <p className="text-xs text-gray-300 italic">ยังไม่มีความเห็นจากหัวหน้า</p>
        )}
      </>
    )
  }

  // Edit form
  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="คอมเมนต์ถึงพนักงาน..."
        className="w-full px-2.5 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="number" min={0} max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="คะแนน"
            className="w-20 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
          />
          <span className="text-xs text-gray-400">/ 100</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-60">
            {saving ? 'บันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
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
    <div className={`${bg} rounded-2xl p-5 flex flex-col gap-3 border border-white/80 transition-all duration-150 hover:-translate-y-1 hover:shadow-md`}>
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

type MemberSortField = 'name' | 'position' | 'department' | 'startDate' | 'team'
function SortableTh({ label, field, sortField, sortDir, onSort, className = '' }: {
  label: string
  field: MemberSortField
  sortField: MemberSortField
  sortDir: 'asc' | 'desc'
  onSort: (f: MemberSortField) => void
  className?: string
}) {
  const active = sortField === field
  return (
    <th className={`text-left px-4 py-3 text-xs font-bold text-gray-500 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-gray-700 ${active ? 'text-gray-900' : ''}`}
      >
        {label}
        <svg
          className={`size-3 transition-transform ${active ? 'opacity-100' : 'opacity-30'} ${active && sortDir === 'desc' ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
        </svg>
      </button>
    </th>
  )
}
