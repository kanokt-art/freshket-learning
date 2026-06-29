'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers, useMyTrainingRecords, useTeams, useDepartments, saveLocalImportedUsers, saveLocalTeam, deleteLocalTeam, getLocalTeams, applyLocalUserPatch, useShadowRecordsByUser, useRoleplayAssessmentsByUser } from '@/hooks/useFirestore'
import { canAccess, ROLE_LABELS, type UserRole, type UserProfile, type Department } from '@/types/user'
import type { ShadowRecord } from '@/types/shadow'
import type { RoleplayAssessment } from '@/types/roleplay'
import { STATUS_LABELS, STATUS_COLORS } from '@/types/tracking'
import { formatDate, formatDateEN } from '@/lib/utils/dateFormatter'
import { OrgBoard } from '@/components/features/OrgBoard'
import { OrgTable } from '@/components/features/OrgTable'
import { demoStore } from '@/lib/demo/demoStore'
import { getDemoMode } from '@/lib/demo/demoMode'
const DEMO_MODE = getDemoMode()

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: 'bg-orange-100 text-orange-700',
  manager:     'bg-purple-100 text-purple-700',
  team_lead:   'bg-blue-100 text-blue-700',
  sale:        'bg-freshket-100 text-freshket-700',
}

const ROLE_BADGE_PILL: Record<UserRole, string> = {
  super_admin: 'bg-orange-100 text-orange-700 border border-orange-200',
  manager:     'bg-purple-100 text-purple-700 border border-purple-200',
  team_lead:   'bg-blue-100 text-blue-700 border border-blue-200',
  sale:        'bg-freshket-100 text-freshket-700 border border-freshket-200',
}

const SEGMENT_STYLE: Record<string, string> = {
  'Chain':       'bg-purple-100 text-purple-700',
  'Mini Chain':  'bg-sky-100 text-sky-700',
  'Stand alone': 'bg-amber-100 text-amber-700',
}
const PERSONA_STYLE: Record<string, string> = {
  'Chef':       'bg-rose-100 text-rose-700',
  'Owner':      'bg-orange-100 text-orange-700',
  'Purchasing': 'bg-indigo-100 text-indigo-700',
  'Manager':    'bg-teal-100 text-teal-700',
}

const SHADOW_EVAL_FIELDS: { key: keyof ShadowRecord; label: string }[] = [
  { key: 'opening',            label: 'Opening / Hook' },
  { key: 'interestPoint',      label: 'Interest Point' },
  { key: 'customerPain',       label: 'Customer Pain' },
  { key: 'diagnosticApproach', label: 'Diagnostic Approach' },
  { key: 'closingNextStep',    label: 'Closing / Next Step' },
  { key: 'bestPractice',       label: 'Best Practice' },
  { key: 'beyondClassroom',    label: 'Beyond Classroom' },
]

const TEAM_LABELS: Record<string, string> = {
  'team-sale-a': 'ทีม Sale A',
  'team-sale-b': 'ทีม Sale B',
  'team-ka-a':   'ทีม KA A',
  'team-ka-b':   'ทีม KA B',
}

const TEAM_BADGE_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
]
function teamBadgeColor(teamId: string): string {
  let h = 0
  for (const c of teamId) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return TEAM_BADGE_PALETTE[h % TEAM_BADGE_PALETTE.length]
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

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: users, loading } = useAllUsers()
  const { data: teams } = useTeams()
  const { data: departments } = useDepartments()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [sortField, setSortField] = useState<'name' | 'empId' | 'startDate'>('startDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'teams'>('list')
  const [teamSubView, setTeamSubView] = useState<'table' | 'board' | 'manage'>('manage')
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)

  const deptOptions = useMemo(() => {
    const set = new Set(users.map(u => u.department).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let list = q
      ? users.filter((u) =>
          u.displayName.toLowerCase().includes(q) ||
          (u.nickname?.toLowerCase() ?? '').includes(q) ||
          (u.employeeId?.toLowerCase() ?? '').includes(q)
        )
      : [...users]
    if (deptFilter) list = list.filter(u => u.department === deptFilter)
    return list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'name') {
        cmp = a.displayName.localeCompare(b.displayName, 'th')
      } else if (sortField === 'empId') {
        cmp = (a.employeeId ?? '').localeCompare(b.employeeId ?? '', undefined, { numeric: true })
      } else {
        const da = a.startDate instanceof Date ? a.startDate.getTime() : 0
        const db = b.startDate instanceof Date ? b.startDate.getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [users, search, deptFilter, sortField, sortDir])

  function handleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const selectedProfile = selectedId ? users.find((u) => u.uid === selectedId) : undefined

  if (user && !canAccess(user.role, 'team_lead')) {
    router.replace('/sale')
    return null
  }

  const canManageTeams = !!user && canAccess(user.role, 'manager')

  function handleMoveUser(userId: string, teamId: string | undefined) {
    if (DEMO_MODE) demoStore.moveUserToTeam(userId, teamId)
    else applyLocalUserPatch(userId, { teamId })
  }
  function handleRenameTeam(teamId: string, newName: string) {
    if (DEMO_MODE) demoStore.updateTeam(teamId, { name: newName })
    else { const t = getLocalTeams().find(x => x.id === teamId); if (t) saveLocalTeam({ ...t, name: newName }) }
  }
  function handleDeleteTeam(teamId: string) {
    if (DEMO_MODE) demoStore.deleteTeam(teamId)
    else deleteLocalTeam(teamId)
  }
  function handleAddTeam(deptId: string, name: string) {
    const team = { id: `team-${Date.now()}`, name, departmentId: deptId }
    if (DEMO_MODE) demoStore.addTeam(team)
    else saveLocalTeam(team)
  }
  function handleSetTeamLead(teamId: string, uid: string | undefined) {
    if (DEMO_MODE) demoStore.updateTeam(teamId, { teamLeadId: uid })
  }
  function handleUpdateVisibility(uid: string, visibleTeamIds: string[] | undefined) {
    if (DEMO_MODE) demoStore.updateUser(uid, { visibleTeamIds })
    else applyLocalUserPatch(uid, { visibleTeamIds })
  }
  function handleChangeRole(userId: string, newRole: UserRole) {
    if (DEMO_MODE) demoStore.updateUser(userId, { role: newRole })
    else applyLocalUserPatch(userId, { role: newRole })
  }

  function handleCreateTeam(name: string, deptId?: string) {
    const team = { id: `team-${Date.now()}`, name, departmentId: deptId }
    if (DEMO_MODE) demoStore.addTeam(team)
    else saveLocalTeam(team)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="รายชื่อพนักงาน" subtitle={`ทั้งหมด ${users.length} คน`} />

      <div className="flex-1 overflow-auto p-6">
        {/* View toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-normal transition-all ${
                view === 'list'
                  ? 'bg-freshket-100 text-freshket-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              รายชื่อ
            </button>
            <button
              onClick={() => setView('teams')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-normal transition-all ${
                view === 'teams'
                  ? 'bg-freshket-100 text-freshket-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              จัดการทีม
            </button>
          </div>
        </div>

        {/* ── Team View ──────────────────────────────────────────────────── */}
        {view === 'teams' && (
          <div className="mb-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                <button
                  onClick={() => setTeamSubView('manage')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-normal transition-all ${
                    teamSubView === 'manage' ? 'bg-freshket-100 text-freshket-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                  </svg>
                  จัดการทีม
                </button>
                <button
                  onClick={() => setTeamSubView('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-normal transition-all ${
                    teamSubView === 'table' ? 'bg-freshket-100 text-freshket-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5H3.375m0 0c-.621 0-1.125-.504-1.125-1.125V15.75c0-.621.504-1.125 1.125-1.125" />
                  </svg>
                  ตารางสรุป
                </button>
                {DEMO_MODE && canManageTeams && (
                  <button
                    onClick={() => setTeamSubView('board')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-normal transition-all ${
                      teamSubView === 'board' ? 'bg-freshket-100 text-freshket-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    โครงสร้างทีม
                  </button>
                )}
              </div>
              {canManageTeams && (
                <button
                  onClick={() => setShowCreateTeam(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  สร้างทีม
                </button>
              )}
            </div>

            {teamSubView === 'manage' ? (
              <TeamManagerPanel
                teams={teams}
                users={users}
                canManage={canManageTeams}
                canDelete={user?.role === 'super_admin'}
                onAddMember={handleMoveUser}
                onRemoveMember={(uid) => handleMoveUser(uid, undefined)}
                onChangeRole={handleChangeRole}
                onUpdateVisibility={handleUpdateVisibility}
                onRenameTeam={handleRenameTeam}
                onDeleteTeam={handleDeleteTeam}
              />
            ) : teamSubView === 'table' ? (
              <OrgTable departments={departments} teams={teams} users={users} />
            ) : (
              <OrgBoard
                departments={departments}
                teams={teams}
                users={users}
                canManage={canManageTeams}
                onRenameTeam={handleRenameTeam}
                onDeleteTeam={handleDeleteTeam}
                onAddTeam={handleAddTeam}
                onMoveUser={handleMoveUser}
                onSetTeamLead={handleSetTeamLead}
                onUpdateVisibility={handleUpdateVisibility}
              />
            )}
          </div>
        )}

        {/* ── List View ─────────────────────────────────────────────────── */}
        {view === 'list' && <>

        {/* Search + Dept Filter + Add */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="ค้นหาจากชื่อ, ชื่อเล่น, รหัสพนักงาน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
            />
          </div>
          {/* Department filter */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </span>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className={`pl-9 pr-8 py-2.5 text-sm rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 appearance-none cursor-pointer transition-all ${
                deptFilter ? 'border-freshket-300 text-freshket-700 font-bold' : 'border-gray-200 text-gray-700'
              }`}
            >
              <option value="">ทุกแผนก</option>
              {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
          {user && canAccess(user.role, 'manager') && (
            <button
              onClick={() => setShowAddEmployee(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all whitespace-nowrap"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
              เพิ่มพนักงาน
            </button>
          )}
        </div>

        {(search || deptFilter) && (
          <p className="text-xs text-gray-500 mb-3">
            พบ <span className="font-bold text-gray-800">{filtered.length}</span> คน
            {search && <> จากการค้นหา &ldquo;{search}&rdquo;</>}
            {deptFilter && <> · แผนก <span className="font-bold text-freshket-700">{deptFilter}</span></>}
          </p>
        )}

        {/* Import success banner */}
        {importResult && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-freshket-50 border border-freshket-200 rounded-2xl">
            <div className="size-8 rounded-xl bg-freshket-500 flex items-center justify-center shrink-0">
              <svg className="size-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-freshket-700">นำเข้าสำเร็จ</p>
              <p className="text-xs text-freshket-600">
                เพิ่มพนักงานใหม่ <span className="font-bold">{importResult.added}</span> คน
                {importResult.skipped > 0 && <> · ข้ามรายการซ้ำ <span className="font-bold">{importResult.skipped}</span> คน</>}
              </p>
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="p-1.5 rounded-lg text-freshket-400 hover:text-freshket-600 hover:bg-freshket-100 transition-all"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <span className="inline-block size-7 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 mt-3">กำลังโหลด...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <svg className="size-10 mx-auto mb-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <p className="text-sm">ไม่พบพนักงานที่ตรงกับการค้นหา</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white border-b border-gray-100">
                  <th className="text-left px-4 py-3">
                    <button
                      onClick={() => handleSort('empId')}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-freshket-600 transition-colors group"
                    >
                      Emp.ID
                      <SortIcon active={sortField === 'empId'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-freshket-600 transition-colors group"
                    >
                      Name-Surname
                      <SortIcon active={sortField === 'name'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden md:table-cell">Department</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden md:table-cell">Position</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden lg:table-cell">Rank</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <button
                      onClick={() => handleSort('startDate')}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-freshket-600 transition-colors group"
                    >
                      Start Date
                      <SortIcon active={sortField === 'startDate'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden xl:table-cell">Line Manager</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden lg:table-cell">Company Email</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 hidden xl:table-cell">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((u, i) => (
                  <tr
                    key={u.uid}
                    onClick={() => setSelectedId(u.uid)}
                    className={`cursor-pointer transition-colors group ${selectedId === u.uid ? 'bg-freshket-100/60' : 'hover:bg-slate-50'}`}
                  >
                    {/* Emp.ID */}
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {u.employeeId
                          ? <span className="font-mono text-xs bg-freshket-100 text-freshket-700 px-2.5 py-0.5 rounded-full">{u.employeeId}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                        {u.employeeId && <CopyBtn text={u.employeeId} />}
                      </div>
                    </td>

                    {/* Name-Surname + Nickname */}
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-gray-900 truncate">{u.displayName}</span>
                            <CopyBtn text={u.displayName} />
                          </div>
                          {u.nickname && <span className="text-xs text-gray-400 block leading-tight">{u.nickname}</span>}
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="px-4 py-3.5 text-xs text-gray-600 hidden md:table-cell max-w-32 truncate">
                      {u.department ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Position */}
                    <td className="px-4 py-3.5 text-xs text-gray-700 hidden md:table-cell max-w-40 truncate">
                      {u.position ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Rank */}
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {u.rank
                        ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">{u.rank}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Start Date */}
                    <td className="px-4 py-3.5 text-xs text-gray-500 hidden lg:table-cell whitespace-nowrap">
                      {u.startDate ? formatDateEN(u.startDate) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Line Manager */}
                    <td className="px-4 py-3.5 text-xs text-gray-600 hidden xl:table-cell max-w-36 truncate">
                      {u.lineManager ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Company Email */}
                    <td className="px-4 py-3.5 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs text-gray-500 truncate max-w-44">{u.email}</span>
                        <CopyBtn text={u.email} />
                      </div>
                    </td>

                    {/* ทีม */}
                    <td className="px-4 py-3.5 hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const effectiveTeamId = u.teamId ?? u.visibleTeamIds?.[0] ?? ''
                        const teamName = effectiveTeamId ? (teams.find(t => t.id === effectiveTeamId)?.name ?? TEAM_LABELS[effectiveTeamId] ?? null) : null
                        if (canManageTeams) {
                          return (
                            <div className="relative inline-flex items-center">
                              {/* native select — invisible overlay for interaction */}
                              <select
                                value={effectiveTeamId}
                                onChange={(e) => {
                                  const newTeamId = e.target.value || undefined
                                  handleMoveUser(u.uid, newTeamId)
                                  if (u.role === 'manager' || u.role === 'super_admin' || u.role === 'team_lead') {
                                    const others = (u.visibleTeamIds ?? []).filter(id => id !== newTeamId)
                                    handleUpdateVisibility(u.uid, newTeamId ? [newTeamId, ...others] : (others.length ? others : undefined))
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                              >
                                <option value="">— ไม่มีทีม —</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                              {/* visual badge */}
                              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border pointer-events-none whitespace-nowrap max-w-36 truncate ${effectiveTeamId ? teamBadgeColor(effectiveTeamId) : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                                <span className="truncate">{teamName ?? '— ไม่มีทีม —'}</span>
                                <svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </div>
                          )
                        }
                        return teamName
                          ? <span className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border ${teamBadgeColor(effectiveTeamId)}`}>{teamName}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        </> /* end list view */}
      </div>

      {/* Modals */}
      {showAddEmployee && (
        <AddEmployeeModal
          users={users}
          onClose={() => setShowAddEmployee(false)}
          onImport={(newUsers, skipped) => {
            if (DEMO_MODE) {
              newUsers.forEach(u => demoStore.addUser(u))
            } else {
              saveLocalImportedUsers(newUsers)
            }
            setImportResult({ added: newUsers.length, skipped })
            setShowAddEmployee(false)
          }}
        />
      )}
      {showCreateTeam && (
        <CreateTeamModal
          departments={departments}
          onClose={() => setShowCreateTeam(false)}
          onCreate={handleCreateTeam}
        />
      )}

      {/* Card overlay */}
      {selectedId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <UserPanel
            userId={selectedId}
            profile={selectedProfile}
            onClose={() => setSelectedId(null)}
            onExpand={() => router.push(`/users/${selectedId}`)}
          />
        </div>
      )}
    </div>
  )
}


// ── Shadow list card ──────────────────────────────────────────────────────────
function ShadowListCard({ record, onClick }: { record: ShadowRecord; onClick: () => void }) {
  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-freshket-200 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="font-bold text-sm text-gray-900 truncate flex-1">{record.storeName}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {record.ratingScore != null && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className={`size-3 ${i < record.ratingScore! ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                    </svg>
                  ))}
                </div>
              )}
              <svg className="size-4 text-gray-300 group-hover:text-freshket-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
          </div>
          <p className="text-xs text-gray-500">
            Mentor: <span className="font-bold text-gray-700">{record.mentorName}</span>
            <span className="text-gray-300 mx-1.5">·</span>
            {dateStr}
          </p>
          {record.evaluationFeedback && (
            <div className="mt-2.5 px-3 py-2 bg-freshket-50 border border-freshket-100 rounded-xl">
              <p className="text-xs text-freshket-700 leading-relaxed line-clamp-2">{record.evaluationFeedback}</p>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Shadow detail panel (push navigation inside panel) ────────────────────────
function UserShadowDetailPanel({ record, onBack }: { record: ShadowRecord; onBack: () => void }) {
  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'
  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50/60 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-freshket-600 transition-colors"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Shadow Visit
        </button>
        <span className="text-gray-300">/</span>
        <p className="text-xs font-bold text-gray-700 flex-1 truncate">{record.storeName}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
        </div>
        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
            <span className="font-bold text-gray-700">{record.mentorName}</span>
            {record.mentorPosition && <span className="text-gray-400">· {record.mentorPosition}</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            {dateStr}
          </span>
          {record.ratingScore != null && (
            <span className="flex items-center gap-0.5 ml-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className={`size-3.5 ${i < record.ratingScore! ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                </svg>
              ))}
              <span className="text-xs font-bold text-amber-600 ml-1">{record.ratingScore}/5</span>
            </span>
          )}
        </div>
        {/* Feedback */}
        {record.evaluationFeedback && (
          <div className="bg-freshket-50 border border-freshket-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-freshket-600 mb-1.5">Evaluator Feedback</p>
            <p className="text-sm text-gray-700 leading-relaxed">{record.evaluationFeedback}</p>
          </div>
        )}
        {/* 7 eval fields */}
        {SHADOW_EVAL_FIELDS.map(f => {
          const val = record[f.key] as string | undefined
          if (!val) return null
          return (
            <div key={f.key} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500">{f.label}</p>
              </div>
              <div className="px-4 py-3 space-y-1">
                {val.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-gray-700 leading-relaxed">{line || ' '}</p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Right Panel ────────────────────────────────────────────────────────────────
function UserPanel({
  userId,
  profile,
  onClose,
  onExpand,
}: {
  userId: string
  profile: UserProfile | undefined
  onClose: () => void
  onExpand: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'information' | 'training' | 'roleplay' | 'shadow'>('information')
  const [selectedShadow, setSelectedShadow] = useState<ShadowRecord | null>(null)
  const { data: records, loading } = useMyTrainingRecords(userId)
  const { data: shadowRecords, loading: shadowLoading } = useShadowRecordsByUser(userId)
  const { data: roleplayAssessments, loading: roleplayLoading } = useRoleplayAssessmentsByUser(userId)

  const handleShare = async () => {
    const url = `${window.location.origin}/users/${userId}`
    try { await navigator.clipboard.writeText(url) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const TABS = [
    { id: 'information' as const, label: 'Information' },
    { id: 'training' as const,   label: 'Training' },
    { id: 'roleplay' as const,   label: 'Role Play' },
    { id: 'shadow' as const,     label: 'Shadow' },
  ]

  return (
    <div
      className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full sm:w-[65vw] max-w-[900px]"
      style={{ height: '85vh', animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
      onClick={e => e.stopPropagation()}
    >
      <style>{`@keyframes popIn { from { transform: scale(0.93); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>

      {/* ── Header (always visible) ─────────────── */}
      <div className="px-6 pt-5 shrink-0 border-b border-gray-100">
        {/* Top row: avatar + name + action buttons */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-11 rounded-2xl bg-freshket-100 border-2 border-freshket-200 flex items-center justify-center text-freshket-700 text-lg font-bold shrink-0">
              {profile?.displayName.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base leading-tight truncate">
                {profile?.displayName ?? '—'}
                {profile?.nickname && <span className="text-sm text-gray-400 font-normal ml-1.5">({profile.nickname})</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                เข้างาน {profile?.startDate ? formatDate(profile.startDate) : '—'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleShare}
              title="แชร์ลิงก์รายงาน"
              className={`p-2 rounded-xl transition-all ${copied ? 'bg-freshket-100 text-freshket-600' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
            >
              {copied ? (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              ) : (
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
              )}
            </button>
            <button onClick={onExpand} title="เปิดรายงานเต็มหน้าจอ" className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-normal border-b-2 transition-all ${
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

      {/* ── Tab content (scrollable) ────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Information ── */}
        {activeTab === 'information' && (
          <div className="p-6 space-y-5">

            {/* Contact */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Contact</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <InfoRow label="Employee ID">
                  {profile?.employeeId
                    ? <span className="font-mono text-xs bg-freshket-100 text-freshket-700 px-2.5 py-0.5 rounded-full">{profile.employeeId}</span>
                    : <span className="text-gray-400">—</span>}
                </InfoRow>
                <InfoRow label="Email">
                  <span className="text-sm text-gray-700 truncate">{profile?.email ?? '—'}</span>
                </InfoRow>
                {profile?.nickname && (
                  <InfoRow label="Nickname">
                    <span className="text-sm text-gray-700">{profile.nickname}</span>
                  </InfoRow>
                )}
              </div>
            </section>

            {/* Role & Department */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Role & Department</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                {profile?.role && (
                  <InfoRow label="Role">
                    <span className={`inline-flex items-center text-xs font-bold px-3 py-1 rounded-full border ${ROLE_BADGE_PILL[profile.role]}`}>
                      {ROLE_LABELS[profile.role]}
                    </span>
                  </InfoRow>
                )}
                {profile?.department && (
                  <InfoRow label="Department">
                    <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {profile.department}
                    </span>
                  </InfoRow>
                )}
                {profile?.position && (
                  <InfoRow label="Position">
                    <span className="text-sm text-gray-700">{profile.position}</span>
                  </InfoRow>
                )}
                {profile?.rank && (
                  <InfoRow label="Rank">
                    <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {profile.rank}
                    </span>
                  </InfoRow>
                )}
              </div>
            </section>

            {/* Employment */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Employment</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <InfoRow label="Start Date">
                  <span className="text-sm text-gray-700">
                    {profile?.startDate ? formatDateEN(profile.startDate) : '—'}
                  </span>
                </InfoRow>
                <InfoRow label="Line Manager">
                  <span className="text-sm text-gray-700">{profile?.lineManager ?? '—'}</span>
                </InfoRow>
              </div>
            </section>

          </div>
        )}

        {/* ── Training Record ── */}
        {activeTab === 'training' && (
          <div>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between z-10">
              <p className="text-sm font-bold text-gray-900">ประวัติการฝึกอบรม</p>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{records.length} รายการ</span>
            </div>
            {loading ? (
              <div className="p-10 text-center">
                <span className="inline-block size-6 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : records.length === 0 ? (
              <div className="p-10 text-center text-xs text-gray-400">ยังไม่มีประวัติการฝึกอบรม</div>
            ) : (
              <div className="p-4 space-y-3">
                {records.map((rec) => (
                  <div key={rec.id} className="border border-gray-100 rounded-xl p-4 bg-white hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <p className="font-bold text-sm text-gray-800 leading-snug flex-1">{rec.courseTitle}</p>
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[rec.status]}`}>
                        {STATUS_LABELS[rec.status]}
                      </span>
                    </div>
                    {rec.score != null && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-sm font-bold w-8 shrink-0 ${scoreColor(rec.score)}`}>{rec.score}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rec.score}%`, background: scoreBarColor(rec.score) }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {rec.completedAt && <span>สำเร็จ {formatDate(rec.completedAt)}</span>}
                      <span>{rec.attemptCount ?? 1} ครั้ง</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Role Play ── */}
        {activeTab === 'roleplay' && (
          roleplayLoading ? (
            <div className="flex items-center justify-center h-full p-8">
              <span className="size-6 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : roleplayAssessments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="size-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center mb-4">
                <svg className="size-7 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <p className="font-bold text-gray-700 mb-1">ไม่พบข้อมูล Role Play</p>
              <p className="text-xs text-gray-400">ยังไม่มีการประเมิน Role Play สำหรับพนักงานนี้</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {roleplayAssessments.map((a: RoleplayAssessment) => {
                const avg = a.topics.length > 0
                  ? (a.topics.reduce((s, t) => s + t.rating, 0) / a.topics.length).toFixed(1)
                  : null
                const dateStr = a.createdAt
                  ? new Date(a.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                  : '—'
                return (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${a.type === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-freshket-100 text-freshket-700'}`}>
                          {a.type === 'pre' ? 'Pre' : 'Post'} · Round {a.round}
                        </span>
                        <span className="text-xs text-gray-400">{dateStr}</span>
                      </div>
                      {avg && (
                        <span className="text-xl font-black text-freshket-600 shrink-0">
                          {avg}<span className="text-xs font-normal text-gray-400 ml-0.5">/10</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      Assessor: <span className="font-bold text-gray-700">{a.assessorName}</span>
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="text-gray-500">{ROLE_LABELS[a.assessorRole]}</span>
                    </p>
                    {a.overallNote && (
                      <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-3 bg-gray-50 rounded-xl px-3 py-2">{a.overallNote}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── Shadow ── */}
        {activeTab === 'shadow' && (
          shadowLoading ? (
            <div className="flex items-center justify-center h-full p-8">
              <span className="size-6 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : shadowRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="size-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center mb-4">
                <svg className="size-7 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="font-bold text-gray-700 mb-1">ไม่พบข้อมูล Shadow Visit</p>
              <p className="text-xs text-gray-400">ยังไม่มีบันทึก Shadow Visit สำหรับพนักงานนี้</p>
            </div>
          ) : selectedShadow ? (
            <UserShadowDetailPanel record={selectedShadow} onBack={() => setSelectedShadow(null)} />
          ) : (
            <div className="p-4 space-y-2.5">
              {shadowRecords.map((rec: ShadowRecord) => (
                <ShadowListCard key={rec.id} record={rec} onClick={() => setSelectedShadow(rec)} />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      {copied && (
        <div className="px-6 py-3 bg-freshket-100 border-t border-freshket-200 text-center text-xs text-freshket-700 font-normal">
          คัดลอกลิงก์รายงานแล้ว — ส่งให้ Manager หรือ Team Lead ที่มีสิทธิ์ดูได้เลย
        </div>
      )}
    </div>
  )
}

// ── Info row (label + value inside a divided card) ────────────────────────────
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-xs text-gray-500 shrink-0 w-28">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className="inline-flex flex-col gap-[1px] ml-0.5">
      <svg
        className={`size-2.5 transition-colors ${active && dir === 'asc' ? 'text-freshket-500' : 'text-gray-300 group-hover:text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"
      >
        <path d="M5 0L9.33 6H.67L5 0z" />
      </svg>
      <svg
        className={`size-2.5 transition-colors ${active && dir === 'desc' ? 'text-freshket-500' : 'text-gray-300 group-hover:text-gray-400'}`}
        viewBox="0 0 10 6" fill="currentColor"
      >
        <path d="M5 6L.67 0H9.33L5 6z" />
      </svg>
    </span>
  )
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

const MONTH_SHORT: Record<string, number> = {
  Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,
  Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12,
}

function parseCsvDate(s: string): Date | undefined {
  if (!s) return undefined
  // DD-Mon-YYYY e.g. "27-Aug-2018"
  const m1 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (m1) {
    const mo = MONTH_SHORT[m1[2].charAt(0).toUpperCase() + m1[2].slice(1).toLowerCase()]
    if (mo) {
      const d = new Date(parseInt(m1[3]), mo - 1, parseInt(m1[1]))
      if (!isNaN(d.getTime())) return d
    }
  }
  // DD/MM/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m2) {
    const d = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]))
    if (!isNaN(d.getTime())) return d
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += c }
  }
  result.push(cur)
  return result
}

// CSV columns: Status(0), Emp.ID(1), Name(2), Nick(3), Dept(4), Position(5), Rank(6), StartDate(7), LineManager(8), Email(9), Slack(10)
function parseCsvToProfiles(text: string, existingUsers: UserProfile[]): {
  valid: UserProfile[]
  duplicates: string[]
} {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return { valid: [], duplicates: [] }

  const existingEmpIds = new Set(existingUsers.map(u => u.employeeId).filter(Boolean))
  const existingEmails = new Set(existingUsers.map(u => u.email?.toLowerCase()).filter(Boolean))

  const valid: UserProfile[] = []
  const duplicates: string[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCSVLine(line)
    const status = cols[0]?.trim() ?? ''
    if (status !== 'Active') continue

    const empId       = cols[1]?.trim() ?? ''
    const fullName    = cols[2]?.trim() ?? ''
    const nickname    = cols[3]?.trim() ?? ''
    const dept        = cols[4]?.trim() ?? ''
    const position    = cols[5]?.trim() ?? ''
    const rank        = cols[6]?.trim() ?? ''
    const startStr    = cols[7]?.trim() ?? ''
    const lineManager = cols[8]?.trim() ?? ''
    const email       = cols[9]?.trim() ?? ''

    if (!fullName) continue

    if (empId && existingEmpIds.has(empId)) {
      duplicates.push(`${fullName} (รหัส ${empId} ซ้ำ)`)
      continue
    }
    if (email && existingEmails.has(email.toLowerCase())) {
      duplicates.push(`${fullName} (อีเมล ${email} ซ้ำ)`)
      continue
    }

    const uid = `csv-${empId || Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    valid.push({
      uid,
      email: email || `${empId || uid}@freshket.co`,
      displayName: fullName,
      photoURL: null,
      role: 'sale',
      nickname: nickname || undefined,
      employeeId: empId || undefined,
      department: dept || undefined,
      position: position || undefined,
      rank: rank || undefined,
      lineManager: lineManager || undefined,
      startDate: parseCsvDate(startStr),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    if (empId) existingEmpIds.add(empId)
    if (email) existingEmails.add(email.toLowerCase())
  }

  return { valid, duplicates }
}

// ── Team Manager Panel ────────────────────────────────────────────────────────

function TeamManagerPanel({
  teams,
  users,
  canManage,
  canDelete,
  onAddMember,
  onRemoveMember,
  onChangeRole,
  onUpdateVisibility,
  onRenameTeam,
  onDeleteTeam,
}: {
  teams: import('@/types/user').Team[]
  users: UserProfile[]
  canManage: boolean
  canDelete?: boolean
  onAddMember: (userId: string, teamId: string) => void
  onRemoveMember: (userId: string) => void
  onChangeRole: (userId: string, newRole: UserRole) => void
  onUpdateVisibility: (uid: string, teamIds: string[] | undefined) => void
  onRenameTeam: (teamId: string, name: string) => void
  onDeleteTeam?: (teamId: string) => void
}) {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [addingTo, setAddingTo] = useState<{ teamId: string; sectionRole: UserRole } | null>(null)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
  const [draggedUid, setDraggedUid] = useState<string | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmTeamId, setDeleteConfirmTeamId] = useState<string | null>(null)
  const [openPill, setOpenPill] = useState<string | null>(null)
  const router = useRouter()

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const ROLE_GROUPS: { role: UserRole; label: string; lColor: string; dBg: string; aBg: string; aText: string; dropBg: string; dropBorder: string }[] = [
    { role: 'super_admin', label: 'Super Admin', lColor: 'text-orange-500',    dBg: 'bg-orange-100',    aBg: 'bg-orange-100',    aText: 'text-orange-700',    dropBg: '#fff7ed', dropBorder: '#f97316' },
    { role: 'manager',     label: 'Manager',     lColor: 'text-purple-500',    dBg: 'bg-purple-100',    aBg: 'bg-purple-100',    aText: 'text-purple-700',    dropBg: '#faf5ff', dropBorder: '#a855f7' },
    { role: 'team_lead',   label: 'Team Lead',   lColor: 'text-blue-500',      dBg: 'bg-blue-100',      aBg: 'bg-blue-100',      aText: 'text-blue-700',      dropBg: '#eff6ff', dropBorder: '#3b82f6' },
    { role: 'sale',        label: 'Member',      lColor: 'text-freshket-600',  dBg: 'bg-freshket-100',  aBg: 'bg-freshket-100',  aText: 'text-freshket-700',  dropBg: '#f0fdf9', dropBorder: '#00ce7c' },
  ]

  const isHighRole = (r: UserRole) => r === 'manager' || r === 'super_admin' || r === 'team_lead'

  function isInTeam(u: UserProfile, teamId: string) {
    if (u.teamId === teamId) return true
    return isHighRole(u.role) && (u.visibleTeamIds?.includes(teamId) ?? false)
  }

  function handleRemoveMember(uid: string, teamId: string) {
    const u = users.find(x => x.uid === uid)
    if (!u) { onRemoveMember(uid); return }
    if (isHighRole(u.role) && u.visibleTeamIds?.includes(teamId)) {
      const next = u.visibleTeamIds!.filter(id => id !== teamId)
      onUpdateVisibility(uid, next.length ? next : undefined)
      if (u.teamId === teamId) onRemoveMember(uid)  // sync teamId with list view
    } else {
      onRemoveMember(uid)
    }
  }

  function handleConfirmAdd(teamId: string, sectionRole: UserRole) {
    for (const uid of Array.from(selectedUids)) {
      const u = users.find(x => x.uid === uid)
      if (!u) continue
      if (sectionRole === 'sale') {
        onAddMember(uid, teamId)
      } else {
        // super_admin / manager / team_lead: assign via visibleTeamIds + set teamId if unset
        const current = u.visibleTeamIds ?? []
        if (!current.includes(teamId)) onUpdateVisibility(uid, [...current, teamId])
        if (!u.teamId) onAddMember(uid, teamId)
        if (sectionRole !== 'super_admin' && u.role !== sectionRole) onChangeRole(uid, sectionRole)
      }
    }
    setAddingTo(null); setSelectedUids(new Set()); setSearch(''); setDeptFilter('all')
  }

  function toggleExpand(teamId: string) {
    setExpandedTeams(prev => {
      const s = new Set(prev)
      if (s.has(teamId)) { s.delete(teamId); if (addingTo?.teamId === teamId) { setAddingTo(null); setSelectedUids(new Set()) } }
      else s.add(teamId)
      return s
    })
  }

  if (teams.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
        <svg className="size-10 mx-auto mb-3 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <p className="text-sm font-normal text-gray-500">ยังไม่มีทีม</p>
        <p className="text-xs text-gray-400 mt-1">กดปุ่ม &ldquo;สร้างทีม&rdquo; เพื่อเริ่มต้น</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
      {/* Backdrop to close pill popovers */}
      {openPill && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenPill(null)} />
      )}
      {teams.map((team) => {
        const members = users.filter(u => isInTeam(u, team.id))
        const isExpanded = expandedTeams.has(team.id)
        const saMembers = members.filter(m => m.role === 'super_admin')
        const mMembers  = members.filter(m => m.role === 'manager')
        const tlMembers = members.filter(m => m.role === 'team_lead')
        const sMembers  = members.filter(m => m.role === 'sale')
        const saCount = saMembers.length
        const mCount  = mMembers.length
        const tlCount = tlMembers.length
        const sCount  = sMembers.length

        const makePill = (
          key: string, abbr: string, count: number, pillUsers: UserProfile[],
          bg: string, text: string,
        ) => {
          if (count === 0) return null
          const pillKey = `${team.id}:${key}`
          const isOpen = openPill === pillKey
          return (
            <div key={key} className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenPill(isOpen ? null : pillKey) }}
                className={`text-xs font-bold px-1.5 py-0.5 rounded-full transition-colors hover:opacity-80 ${bg} ${text}`}
              >
                {count}{abbr}
              </button>
              {isOpen && (
                <div
                  className="absolute top-6 right-0 z-30 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden min-w-44"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-3 py-1.5 border-b border-gray-100 text-xs text-gray-400 font-normal">{count} คน</div>
                  {pillUsers.map(u => (
                    <button
                      key={u.uid}
                      onClick={() => { router.push(`/users/${u.uid}`); setOpenPill(null) }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                    >
                      <div className={`size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${text}`}>
                        {u.displayName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                        {u.nickname && <p className="text-xs text-gray-400 truncate">{u.nickname}</p>}
                      </div>
                      <svg className="size-3 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }

        const RolePills = () => (
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {makePill('SA', 'SA', saCount, saMembers, 'bg-orange-100', 'text-orange-700')}
            {makePill('M',  'M',  mCount,  mMembers,  'bg-purple-100', 'text-purple-700')}
            {makePill('TL', 'TL', tlCount, tlMembers, 'bg-blue-100',   'text-blue-700')}
            {makePill('Mem','Mem',sCount,  sMembers,  'bg-freshket-100','text-freshket-700')}
          </div>
        )

        const isRenaming = renamingTeamId === team.id
        const PencilBtn = ({ onClick }: { onClick: (e: React.MouseEvent) => void }) => canManage ? (
          <button
            onClick={onClick}
            className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-freshket-500 hover:bg-freshket-50 transition-all opacity-0 group-hover:opacity-100"
            title="เปลี่ยนชื่อทีม"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
          </button>
        ) : null

        // ── Collapsed capsule ────────────────────────────────────────────────
        if (!isExpanded) {
          return (
            <div
              key={team.id}
              onClick={() => !isRenaming && toggleExpand(team.id)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5 cursor-pointer hover:shadow-md hover:border-freshket-200 transition-all flex items-center gap-2 group"
            >
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && renameValue.trim()) { onRenameTeam(team.id, renameValue.trim()); setRenamingTeamId(null) }
                      if (e.key === 'Escape') setRenamingTeamId(null)
                    }}
                    onBlur={() => { if (renameValue.trim()) onRenameTeam(team.id, renameValue.trim()); setRenamingTeamId(null) }}
                    className="w-full text-sm font-bold text-gray-900 bg-transparent border-b border-freshket-400 outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{team.name}</p>
                    <span className="text-xs text-gray-400 shrink-0">({members.length})</span>
                  </div>
                )}
              </div>
              <RolePills />
              <PencilBtn onClick={e => { e.stopPropagation(); setRenamingTeamId(team.id); setRenameValue(team.name) }} />
              <svg className="size-3.5 text-gray-300 group-hover:text-freshket-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          )
        }

        // ── Expanded card ────────────────────────────────────────────────────
        return (
          <div key={team.id} className="bg-white rounded-2xl border border-freshket-200 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 rounded-t-2xl group">
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !isRenaming && toggleExpand(team.id)}>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && renameValue.trim()) { onRenameTeam(team.id, renameValue.trim()); setRenamingTeamId(null) }
                      if (e.key === 'Escape') setRenamingTeamId(null)
                    }}
                    onBlur={() => { if (renameValue.trim()) onRenameTeam(team.id, renameValue.trim()); setRenamingTeamId(null) }}
                    className="w-full text-sm font-bold text-gray-900 bg-transparent border-b-2 border-freshket-400 outline-none"
                  />
                ) : (
                  <p className="font-bold text-gray-900 text-sm truncate">{team.name}</p>
                )}
                <p className="text-xs text-gray-400">{members.length} สมาชิก</p>
              </div>
              <RolePills />
              <PencilBtn onClick={e => { e.stopPropagation(); setRenamingTeamId(team.id); setRenameValue(team.name) }} />
              {canDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmTeamId(team.id) }}
                  className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                  title="ลบทีม"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
              <svg className="size-4 text-freshket-500 shrink-0 cursor-pointer" onClick={() => !isRenaming && toggleExpand(team.id)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              </svg>
            </div>

            {/* Delete confirm */}
            {deleteConfirmTeamId === team.id && (
              <div className="mx-3 mt-2 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs">
                <p className="text-rose-700 font-bold mb-1">ลบทีม &ldquo;{team.name}&rdquo; ใช่ไหม?</p>
                <p className="text-rose-500 mb-2">สมาชิกจะถูกออกจากทีมนี้</p>
                <div className="flex gap-2">
                  <button onClick={() => { onDeleteTeam?.(team.id); setDeleteConfirmTeamId(null) }} className="px-3 py-1 bg-rose-500 text-white rounded-lg font-normal hover:bg-rose-600 transition-colors">ยืนยัน</button>
                  <button onClick={() => setDeleteConfirmTeamId(null)} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">ยกเลิก</button>
                </div>
              </div>
            )}

            {/* Role sections */}
            <div className="px-3 py-3 space-y-2 max-h-[520px] overflow-y-auto">
              {ROLE_GROUPS.map((group) => {
                const dropKey = `${team.id}:${group.label}`
                const isOver = dragOverKey === dropKey && !!draggedUid
                const isAddingHere = addingTo?.teamId === team.id && addingTo?.sectionRole === group.role
                const groupMembers = members.filter(m => m.role === group.role)

                // Exclusive assignment + role promotion rules:
                const sectionPool = users.filter(u => {
                  if (group.role === 'super_admin') {
                    if (u.role !== 'super_admin') return false
                    return !isInTeam(u, team.id)
                  }
                  if (group.role === 'manager') {
                    const hasManagerTitle = !!(u.position?.toLowerCase().includes('manager') || u.rank?.toLowerCase().includes('manager'))
                    if (u.role !== 'manager' && u.role !== 'team_lead' && !hasManagerTitle) return false
                    return !isInTeam(u, team.id)
                  }
                  if (group.role === 'team_lead') {
                    if (u.role !== 'team_lead' && u.role !== 'sale') return false
                    return !isInTeam(u, team.id)
                  }
                  // sale — only unassigned members (already in any team = taken)
                  if (u.role !== 'sale') return false
                  return !u.teamId
                })
                const depts = ['all', ...Array.from(new Set(sectionPool.flatMap(u => u.department ? [u.department] : [])))]
                const filteredPool = sectionPool.filter(u => {
                  const q = search.toLowerCase()
                  const mSearch = !q || u.displayName.toLowerCase().includes(q) || (u.nickname?.toLowerCase() ?? '').includes(q) || (u.employeeId ?? '').includes(q)
                  const mDept = deptFilter === 'all' || u.department === deptFilter
                  return mSearch && mDept
                })
                const allSelected = filteredPool.length > 0 && filteredPool.every(u => selectedUids.has(u.uid))

                return (
                  <div key={group.label}>
                    {/* Drop zone */}
                    <div
                      className="rounded-xl transition-all duration-150"
                      style={isOver ? { outline: `1.5px dashed ${group.dropBorder}`, backgroundColor: group.dropBg, padding: '6px' } : { padding: '6px' }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverKey(dropKey) }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null) }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedUid) {
                          const d = members.find(m => m.uid === draggedUid)
                          if (d && d.role !== group.role) {
                            onChangeRole(draggedUid, group.role)
                          }
                        }
                        setDraggedUid(null); setDragOverKey(null)
                      }}
                    >
                      {/* Section header */}
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className={`text-xs font-bold whitespace-nowrap ${group.lColor}`}>{group.label}</span>
                        <div className={`flex-1 h-px ${group.dBg}`} />
                        <span className="text-xs text-gray-300 tabular-nums mr-1">{groupMembers.length}</span>
                        {canManage && !isAddingHere && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setAddingTo({ teamId: team.id, sectionRole: group.role }); setSearch(''); setDeptFilter('all'); setSelectedUids(new Set()) }}
                            className={`shrink-0 flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full hover:bg-gray-100 transition-all ${group.lColor}`}
                          >
                            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            เพิ่ม
                          </button>
                        )}
                      </div>

                      {/* Empty zone */}
                      {groupMembers.length === 0 && !isAddingHere && (
                        <p className={`text-xs text-center py-1.5 transition-colors ${isOver ? group.lColor : 'text-gray-200'}`}>ลากมาวางที่นี่</p>
                      )}

                      {/* Members */}
                      <div className="space-y-0.5">
                        {groupMembers.map(m => (
                          <div
                            key={m.uid}
                            draggable={canManage}
                            onDragStart={(e) => { setDraggedUid(m.uid); e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => { setDraggedUid(null); setDragOverKey(null) }}
                            className={`flex items-center py-1.5 px-2 rounded-xl transition-all ${draggedUid === m.uid ? 'opacity-30' : canManage ? 'hover:bg-white cursor-grab active:cursor-grabbing group/member' : 'group/member'}`}
                          >
                            {canManage && (
                              <svg className="size-3 text-gray-200 shrink-0 mr-1" viewBox="0 0 10 16" fill="currentColor">
                                <circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/>
                              </svg>
                            )}
                            <div className={`size-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mr-2 ${group.aBg} ${group.aText}`}>{m.displayName.charAt(0)}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-gray-800 truncate">{m.displayName}</p>
                              <p className="text-xs text-gray-400 truncate leading-tight">{[m.nickname, m.position].filter(Boolean).join(' · ')}</p>
                            </div>
                            <button
                              onClick={() => router.push(`/users/${m.uid}`)}
                              className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 opacity-0 group-hover/member:opacity-100 transition-all"
                              title="ดูโปรไฟล์"
                            >
                              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </button>
                            {canManage && draggedUid !== m.uid && (
                              <button onClick={() => handleRemoveMember(m.uid, team.id)} className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 opacity-0 group-hover/member:opacity-100 transition-all" title="นำออก">
                                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Add panel (inline, per section) ──────────────────── */}
                    {isAddingHere && (
                      <div className="mt-1.5 border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                        {/* Search */}
                        <div className="relative mb-2">
                          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" /></svg>
                          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, ชื่อเล่น, รหัส..." className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-freshket-300" />
                        </div>

                        {/* Dept filter pills */}
                        {depts.length > 2 && (
                          <div className="flex gap-1 flex-wrap mb-2">
                            {depts.map(d => (
                              <button key={d} onClick={() => setDeptFilter(d)} className={`text-xs font-normal px-2 py-0.5 rounded-full border transition-all ${deptFilter === d ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-500 border-gray-200 hover:border-freshket-300'}`}>
                                {d === 'all' ? 'ทั้งหมด' : d}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Check all */}
                        <label className="flex items-center gap-2 py-1 px-2 border-b border-gray-100 mb-1 cursor-pointer">
                          <input type="checkbox" checked={allSelected} onChange={e => {
                            setSelectedUids(prev => {
                              const s = new Set(prev)
                              filteredPool.forEach(u => e.target.checked ? s.add(u.uid) : s.delete(u.uid))
                              return s
                            })
                          }} className="size-3.5 accent-freshket-500" />
                          <span className="text-xs text-gray-500">เลือกทั้งหมด ({filteredPool.length} คน)</span>
                        </label>

                        {/* User list with checkboxes */}
                        <div className="max-h-44 overflow-y-auto space-y-0.5">
                          {filteredPool.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-3">ไม่พบพนักงาน</p>
                          ) : filteredPool.map(u => (
                            <label key={u.uid} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer transition-colors">
                              <input type="checkbox" checked={selectedUids.has(u.uid)} onChange={e => {
                                setSelectedUids(prev => { const s = new Set(prev); e.target.checked ? s.add(u.uid) : s.delete(u.uid); return s })
                              }} className="size-3.5 accent-freshket-500 shrink-0" />
                              <div className={`size-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${group.aBg} ${group.aText}`}>{u.displayName.charAt(0)}</div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                                <p className="text-xs text-gray-400 truncate">{[u.nickname, u.department, u.position].filter(Boolean).join(' · ')}</p>
                              </div>
                            </label>
                          ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                          <button onClick={() => { setAddingTo(null); setSelectedUids(new Set()); setSearch(''); setDeptFilter('all') }} className="flex-1 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">ยกเลิก</button>
                          <button onClick={() => handleConfirmAdd(team.id, group.role)} disabled={selectedUids.size === 0} className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            เพิ่ม {selectedUids.size > 0 ? `${selectedUids.size} คน` : ''}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Copy Button ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 p-1 rounded text-gray-300 hover:text-freshket-500 hover:bg-freshket-50 transition-all opacity-0 group-hover:opacity-100"
      title={`คัดลอก`}
    >
      {copied ? (
        <svg className="size-3.5 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
    </button>
  )
}

// ── Add Employee Modal ─────────────────────────────────────────────────────────

function AddEmployeeModal({
  users,
  onClose,
  onImport,
}: {
  users: UserProfile[]
  onClose: () => void
  onImport: (newUsers: UserProfile[], skipped: number) => void
}) {
  const [tab, setTab] = useState<'manual' | 'csv'>('manual')
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    displayName: '', nickname: '', employeeId: '', email: '',
    department: '', position: '', role: 'sale' as UserRole, startDate: '',
  })
  const [manualError, setManualError] = useState('')
  const [csvResult, setCsvResult] = useState<{ valid: UserProfile[]; duplicates: string[] } | null>(null)
  const [csvFileName, setCsvFileName] = useState('')

  function handleManualSubmit() {
    setManualError('')
    if (!form.displayName.trim()) { setManualError('กรุณาระบุชื่อพนักงาน'); return }
    if (form.employeeId && users.some(u => u.employeeId === form.employeeId.trim())) {
      setManualError(`รหัสพนักงาน ${form.employeeId} มีอยู่ในระบบแล้ว`); return
    }
    if (form.email && users.some(u => u.email?.toLowerCase() === form.email.toLowerCase().trim())) {
      setManualError(`อีเมล ${form.email} มีอยู่ในระบบแล้ว`); return
    }
    let startDate: Date | undefined
    if (form.startDate) { const d = new Date(form.startDate); if (!isNaN(d.getTime())) startDate = d }
    onImport([{
      uid: `manual-${Date.now()}`,
      email: form.email.trim() || `${form.employeeId || Date.now()}@freshket.co`,
      displayName: form.displayName.trim(),
      photoURL: null,
      role: form.role,
      nickname: form.nickname.trim() || undefined,
      employeeId: form.employeeId.trim() || undefined,
      department: form.department.trim() || undefined,
      position: form.position.trim() || undefined,
      startDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    }], 0)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvResult(parseCsvToProfiles(text, users))
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" style={{ animation: 'addEmpIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
        <style>{`@keyframes addEmpIn { from { opacity:0; transform:scale(0.94) } to { opacity:1; transform:scale(1) } }`}</style>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">เพิ่มพนักงาน</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setTab('manual')} className={`flex-1 py-1.5 text-sm font-normal rounded-lg transition-all ${tab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              กรอกด้วยตนเอง
            </button>
            <button onClick={() => setTab('csv')} className={`flex-1 py-1.5 text-sm font-normal rounded-lg transition-all ${tab === 'csv' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              นำเข้า CSV
            </button>
          </div>
        </div>

        {tab === 'manual' && (
          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อ-นามสกุล <span className="text-rose-500">*</span></label>
                <input type="text" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="เช่น Somchai Jaidee" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อเล่น</label>
                <input type="text" value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="เช่น โอ" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">รหัสพนักงาน</label>
                <input type="text" value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} placeholder="เช่น EMP001" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-600 mb-1">Company Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="example@freshket.co" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">แผนก</label>
                <input type="text" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="เช่น Sales Management" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">ตำแหน่ง</label>
                <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="เช่น Sale Executive" className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">ระดับสิทธิ์</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
                  <option value="sale">Sale</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">วันเข้างาน</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>
            </div>
            {manualError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-normal">{manualError}</div>
            )}
          </div>
        )}

        {tab === 'csv' && (
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
            {!csvResult ? (
              <div>
                <button onClick={() => fileRef.current?.click()} className="w-full flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed border-gray-200 hover:border-freshket-300 hover:bg-freshket-50/40 transition-all cursor-pointer">
                  <svg className="size-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-700">คลิกเพื่อเลือกไฟล์ CSV</p>
                    <p className="text-xs text-gray-400 mt-1">รองรับคอลัมน์: Status, Emp.ID, Name-Surname, ...</p>
                  </div>
                </button>
                <p className="text-xs text-gray-400 mt-3 text-center">นำเข้าเฉพาะพนักงานที่มี Status = &quot;Active&quot;</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 truncate flex-1 mr-2">{csvFileName}</p>
                  <button onClick={() => { setCsvResult(null); setCsvFileName('') }} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">เปลี่ยนไฟล์</button>
                </div>
                <div className="flex items-center gap-3 p-3 bg-freshket-50 border border-freshket-200 rounded-xl">
                  <svg className="size-5 text-freshket-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold text-freshket-700">พร้อมนำเข้า <span className="text-base">{csvResult.valid.length}</span> คน</p>
                    {csvResult.duplicates.length > 0 && <p className="text-xs text-amber-600 mt-0.5">ข้ามซ้ำ {csvResult.duplicates.length} คน</p>}
                  </div>
                </div>
                {csvResult.duplicates.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-xs font-bold text-amber-700 mb-1.5">รายการที่ข้ามเนื่องจากซ้ำ:</p>
                    <ul className="space-y-0.5">
                      {csvResult.duplicates.map((d, i) => <li key={i} className="text-xs text-amber-600">• {d}</li>)}
                    </ul>
                  </div>
                )}
                {csvResult.valid.length > 0 && (
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2 font-bold text-gray-500">ชื่อ</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">ชื่อเล่น</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">รหัส</th>
                          <th className="text-left px-3 py-2 font-bold text-gray-500">แผนก</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {csvResult.valid.slice(0, 10).map((u, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-gray-700">{u.displayName}</td>
                            <td className="px-3 py-1.5 text-gray-500">{u.nickname ?? '—'}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-500">{u.employeeId ?? '—'}</td>
                            <td className="px-3 py-1.5 text-gray-500 truncate max-w-24">{u.department ?? '—'}</td>
                          </tr>
                        ))}
                        {csvResult.valid.length > 10 && (
                          <tr><td colSpan={4} className="px-3 py-1.5 text-center text-gray-400">... และอีก {csvResult.valid.length - 10} คน</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {csvResult.valid.length === 0 && (
                  <div className="p-6 text-center text-gray-400 text-sm">ไม่พบพนักงานที่มีสถานะ Active</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            ยกเลิก
          </button>
          {tab === 'manual' ? (
            <button onClick={handleManualSubmit} disabled={!form.displayName.trim()} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              เพิ่มพนักงาน
            </button>
          ) : (
            <button onClick={() => csvResult?.valid.length ? onImport(csvResult.valid, csvResult.duplicates.length) : undefined} disabled={!csvResult || csvResult.valid.length === 0} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              นำเข้า {csvResult?.valid.length ?? 0} คน
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Team Modal ─────────────────────────────────────────────────────────

function CreateTeamModal({
  departments,
  onClose,
  onCreate,
}: {
  departments: Department[]
  onClose: () => void
  onCreate: (name: string, deptId?: string) => void
}) {
  const [name, setName] = useState('')
  const [deptId, setDeptId] = useState('')

  function handleSubmit() {
    if (!name.trim()) return
    onCreate(name.trim(), deptId || undefined)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl" style={{ animation: 'addEmpIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">สร้างทีมใหม่</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">ชื่อทีม <span className="text-rose-500">*</span></label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="เช่น ทีม Sale C"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">แผนก (ไม่บังคับ)</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
              <option value="">— ไม่ระบุแผนก —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all">
            ยกเลิก
          </button>
          <button onClick={handleSubmit} disabled={!name.trim()} className="flex-1 px-4 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            สร้างทีม
          </button>
        </div>
      </div>
    </div>
  )
}
