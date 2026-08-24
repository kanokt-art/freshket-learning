'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Department, Team, UserProfile } from '@/types/user'
import { ROLE_LABELS, canAccess, getTeamManagerIds, getTeamLeadIds } from '@/types/user'

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrgBoardProps {
  departments: Department[]
  teams: Team[]
  users: UserProfile[]
  canManage: boolean
  searchQuery?: string
  deptFilter?: string[]
  onRenameTeam:   (teamId: string, name: string) => void
  onDeleteTeam:   (teamId: string) => void
  onAddTeam:      (deptId: string, name: string) => void
  onMoveUser:     (userId: string, teamId: string | undefined) => void
  onSetTeamLeads: (teamId: string, userIds: string[]) => void
  onSetManagers:  (teamId: string, userIds: string[]) => void
  onUpdateVisibility: (userId: string, visibleTeamIds: string[] | undefined) => void
}

// ── Role pill badges (pastel — CLAUDE.md's pastel-pill pattern) ─────────────────

function RolePill({ role }: { role: 'manager' | 'teamLead' | 'member' }) {
  const styles: Record<typeof role, string> = {
    manager:  'bg-purple-100 text-purple-700 border-purple-200',
    teamLead: 'bg-blue-100 text-blue-700 border-blue-200',
    member:   'bg-gray-100 text-gray-500 border-gray-200',
  }
  const labels: Record<typeof role, string> = { manager: 'Manager', teamLead: 'Team Lead', member: 'Member' }
  return (
    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${styles[role]}`}>
      {labels[role]}
    </span>
  )
}

// ── Department merges — display-only, no data change ─────────────────────────

const DEPT_MERGES: Array<{ sourceNames: string[]; displayName: string }> = [
  {
    sourceNames: ['Key Account Management', 'Portfolio Management'],
    displayName: 'Key Account Management & Portfolio Management',
  },
]

// Phase 1 rollout — only these departments are onboarded onto the platform so
// far; the rest exist in the roster but are hidden here to keep admin focus on
// the active departments. Remove this allowlist once other departments go live.
// Exported so the Employees list-view department filter (users/page.tsx) can
// apply the same restriction consistently.
export const PHASE1_DEPARTMENTS = new Set([
  'Sales Management',
  'Key Account Management',
  'Portfolio Management',
  'People Experience',
  'Commercial Operations',
  'Commercial',
])

function deptId(name: string) {
  return `dept-${name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '-')}`
}

// Roster-eligible: shows up in a team's "Members" list and a department's
// "Unassigned" list. Managers are included here per request — previously they
// only appeared via the separate dept/team "Manager" badge, with no way to see
// or assign them like a regular roster member.
export function isRosterRole(role: UserProfile['role']): boolean {
  return role === 'sale' || role === 'team_lead' || role === 'manager'
}

function matchesSearch(u: UserProfile, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    u.displayName.toLowerCase().includes(q) ||
    (u.displayNameEN?.toLowerCase() ?? '').includes(q) ||
    (u.nickname?.toLowerCase() ?? '').includes(q) ||
    (u.employeeId?.toLowerCase() ?? '').includes(q)
  )
}

// ── Colors ────────────────────────────────────────────────────────────────────

const DEPT_ACCENT: Record<number, { ring: string; badge: string; dot: string }> = {
  0: { ring: 'border-freshket-300 bg-freshket-50', badge: 'bg-freshket-100 text-freshket-700 border border-freshket-200', dot: 'bg-freshket-500' },
  1: { ring: 'border-blue-200 bg-blue-50',         badge: 'bg-blue-100 text-blue-700 border border-blue-200',             dot: 'bg-blue-500' },
  2: { ring: 'border-purple-200 bg-purple-50',     badge: 'bg-purple-100 text-purple-700 border border-purple-200',       dot: 'bg-purple-500' },
  3: { ring: 'border-amber-200 bg-amber-50',       badge: 'bg-amber-100 text-amber-700 border border-amber-200',         dot: 'bg-amber-500' },
}
function deptAccent(idx: number) { return DEPT_ACCENT[idx % 4] }

// Rank/level badge palette — same rotating-hash approach as CLAUDE.md's
// DEPT_COLORS, since rank strings vary across departments (JG grades, named
// titles) with no single canonical seniority order to encode reliably.
const RANK_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-lime-100 text-lime-700',
  'bg-sky-100 text-sky-700',
]
function rankColor(rank?: string): string {
  if (!rank) return 'bg-gray-200 text-gray-500'
  let h = 0
  for (const c of rank) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return RANK_COLORS[h % RANK_COLORS.length]
}

// ── Visibility Modal ──────────────────────────────────────────────────────────

function VisibilityModal({
  user,
  allTeams,
  departments,
  onSave,
  onClose,
}: {
  user: UserProfile
  allTeams: Team[]
  departments: Department[]
  onSave: (uid: string, visibleTeamIds: string[] | undefined) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'all' | 'selected'>(
    user.visibleTeamIds === undefined ? 'all' : 'selected'
  )
  const [selected, setSelected] = useState<string[]>(user.visibleTeamIds ?? [])

  const userDeptId = departments.find(d => d.name === user.department)?.id
  const sameDeptTeams = userDeptId ? allTeams.filter(t => t.departmentId === userDeptId) : []
  const otherTeams = allTeams.filter(t => t.departmentId !== userDeptId || !userDeptId)

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSave() {
    onSave(user.uid, mode === 'all' ? undefined : selected)
    onClose()
  }

  function TeamCheckbox({ t }: { t: Team }) {
    return (
      <label key={t.id} className="flex items-center gap-2.5 cursor-pointer group">
        <div
          onClick={() => toggle(t.id)}
          className={`size-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
            selected.includes(t.id)
              ? 'border-freshket-500 bg-freshket-500'
              : 'border-gray-300 group-hover:border-gray-400'
          }`}
        >
          {selected.includes(t.id) && (
            <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          )}
        </div>
        <span className="text-sm text-gray-700">{t.name}</span>
      </label>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl"
        style={{ animation: 'orgModalIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}
      >
        <style>{`@keyframes orgModalIn { from { opacity:0; transform:scale(0.94) } to { opacity:1; transform:scale(1) } }`}</style>

        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="size-9 rounded-xl bg-freshket-100 flex items-center justify-center text-freshket-700 font-bold text-base shrink-0">
              {user.displayName.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{user.displayName}</p>
              <p className="text-xs text-gray-400">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <p className="text-sm font-bold text-gray-700 mt-3">กำหนดทีมที่มองเห็นรายงาน</p>
        </div>

        <div className="px-6 py-4 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setMode('all')}
              className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                mode === 'all' ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300 group-hover:border-gray-400'
              }`}
            >
              {mode === 'all' && <div className="size-1.5 rounded-full bg-white" />}
            </div>
            <span className="text-sm text-gray-700 font-normal">ทุกทีมในระบบ</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setMode('selected')}
              className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                mode === 'selected' ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300 group-hover:border-gray-400'
              }`}
            >
              {mode === 'selected' && <div className="size-1.5 rounded-full bg-white" />}
            </div>
            <span className="text-sm text-gray-700 font-normal">เฉพาะทีมที่เลือก</span>
          </label>

          {mode === 'selected' && (
            <div className="ml-7 space-y-1 pt-1 max-h-64 overflow-y-auto pr-1">
              {allTeams.length === 0 && (
                <p className="text-xs text-gray-400">ยังไม่มีทีมในระบบ</p>
              )}

              {/* Same department teams first */}
              {sameDeptTeams.length > 0 && (
                <>
                  <p className="text-xs font-bold text-freshket-600 pt-1 pb-0.5">
                    {user.department ?? 'แผนกของฉัน'}
                  </p>
                  {sameDeptTeams.map(t => <TeamCheckbox key={t.id} t={t} />)}
                </>
              )}

              {/* Other departments */}
              {otherTeams.length > 0 && (
                <>
                  {sameDeptTeams.length > 0 && (
                    <p className="text-xs font-bold text-gray-400 pt-2 pb-0.5">แผนกอื่น</p>
                  )}
                  {otherTeams.map(t => <TeamCheckbox key={t.id} t={t} />)}
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-normal rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
  user,
  teams,
  currentTeamId,
  canEdit,
  isTeamLead,
  isManager,
  onMove,
  onSetTeamLead,
  onDelete,
}: {
  user: UserProfile
  teams: Team[]
  currentTeamId: string
  canEdit: boolean
  isTeamLead?: boolean
  isManager?: boolean
  onMove: (uid: string, teamId: string | undefined) => void
  onSetTeamLead: (uid: string) => void
  onDelete: (uid: string) => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function handleSelect(teamId: string | undefined) {
    onMove(user.uid, teamId)
    setOpen(false)
  }

  return (
    <div
      className={`inline-flex items-center gap-2 py-1.5 pl-1.5 pr-2 group/member rounded-lg border transition-all w-full sm:w-64 ${
        isDragging ? 'opacity-50 bg-gray-100 border-gray-200' : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
      }`}
      ref={ref}
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('userId', user.uid)
        setIsDragging(true)
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      <div className={`size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${rankColor(user.rank)}`}>
        {(user.displayNameEN || user.displayName).charAt(0)}
      </div>
      <button
        type="button"
        onClick={() => router.push(`/users/${user.uid}`)}
        title="ดูผลการเรียน"
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-xs font-medium text-gray-700 truncate hover:text-freshket-600 hover:underline">
          {user.displayNameEN || user.displayName}
          {user.nickname && <span className="text-gray-400 font-normal ml-1">({user.nickname})</span>}
        </p>
        <div className="flex items-center gap-1 min-w-0 mt-0.5">
          <RolePill role={isManager ? 'manager' : isTeamLead ? 'teamLead' : 'member'} />
          {user.rank && (
            <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full ${rankColor(user.rank)}`}>{user.rank}</span>
          )}
          {user.position && <p className="text-xs text-gray-400 truncate">{user.position}</p>}
        </div>
      </button>
      {canEdit && (
        <div className="flex items-center gap-1">
          {isTeamLead ? (
            <span className="opacity-0 group-hover/member:opacity-100 p-1 text-blue-400" title="Team Lead">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </span>
          ) : (
            <button
              onClick={() => onSetTeamLead(user.uid)}
              className="opacity-0 group-hover/member:opacity-100 p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              title="Set as Team Lead"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => onDelete(user.uid)}
            className="opacity-0 group-hover/member:opacity-100 p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
            title="Remove"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="opacity-0 group-hover/member:opacity-100 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
              title="Move team"
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>
            {open && (
              <div className="absolute right-0 top-6 z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-36 text-sm">
                <div className="px-3 py-1.5 text-xs text-gray-400 font-normal border-b border-gray-100">Move to team</div>
                {teams
                  .filter(t => t.id !== currentTeamId)
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t.id)}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                    >
                      {t.name}
                    </button>
                  ))}
                <button
                  onClick={() => handleSelect(undefined)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-rose-500"
                >
                  Remove from team
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-400 text-xs border-t border-gray-100 mt-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add member dropdown ───────────────────────────────────────────────────────

function AddMemberDropdown({
  teamId,
  availableUsers,
  allTeams,
  onAdd,
  onClose,
}: {
  teamId: string
  availableUsers: UserProfile[]
  allTeams: Team[]
  onAdd: (user: UserProfile, teamId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  // Org-wide, department-agnostic — a manager searches the whole employee
  // database by nickname or real name, not just people in the same department.
  const filtered = availableUsers.filter(u => !q || matchesSearch(u, q))

  if (availableUsers.length === 0) {
    return (
      <div className="mt-2 p-3 rounded-xl border border-gray-100 bg-gray-50 text-xs text-gray-400 text-center">
        No available members
        <button onClick={onClose} className="block mx-auto mt-1 text-gray-300 hover:text-gray-400">Close</button>
      </div>
    )
  }

  return (
    <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-lg text-sm overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          placeholder="ค้นหาชื่อจริง หรือชื่อเล่น..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-freshket-300"
        />
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {filtered.map(u => {
          const engName = u.displayNameEN || u.displayName
          // If already on another team, surface that here — this add moves
          // them (a member can only belong to one team at a time).
          const currentTeam = u.teamId ? allTeams.find(t => t.id === u.teamId)?.name : undefined
          const sub = [u.nickname, u.department, currentTeam ? `ย้ายจากทีม ${currentTeam}` : null].filter(Boolean).join(' · ')
          return (
            <button
              key={u.uid}
              onClick={() => { onAdd(u, teamId); onClose() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
            >
              <div className="size-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
                {u.displayName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-gray-700 truncate block">{engName}</span>
                {sub && <span className="text-xs text-gray-500 truncate block">{sub}</span>}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No results</p>}
      </div>
      <div className="border-t border-gray-100 px-3 py-2">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-500">Cancel</button>
      </div>
    </div>
  )
}

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({
  team,
  users,
  allTeams,
  canManage,
  accent,
  deptName,
  sourceNames,
  onRename,
  onDelete,
  onMoveUser,
  onSetTeamLeads,
  onSetManagers,
  onOpenVisibility,
  onUpdateVisibility,
  rankFilter,
  searchQuery,
}: {
  team: Team
  users: UserProfile[]
  allTeams: Team[]
  canManage: boolean
  accent: ReturnType<typeof deptAccent>
  deptName: string
  sourceNames: string[]
  onRename: (name: string) => void
  onDelete: () => void
  onMoveUser: (uid: string, teamId: string | undefined) => void
  onSetTeamLeads: (uids: string[]) => void
  onSetManagers: (uids: string[]) => void
  onOpenVisibility: (user: UserProfile) => void
  onUpdateVisibility: (uid: string, teamIds: string[] | undefined) => void
  rankFilter?: string
  searchQuery?: string
}) {
  const router = useRouter()
  const [editMode, setEditMode] = useState(false)
  const canEdit = canManage && editMode
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(team.name)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showTLPicker, setShowTLPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [dragOverMembers, setDragOverMembers] = useState(false)
  const [dragOverTL, setDragOverTL] = useState(false)
  const [dragOverManager, setDragOverManager] = useState(false)
  const [showManagerPicker, setShowManagerPicker] = useState(false)
  const [selManagers, setSelManagers] = useState<string[]>([])
  const [selTeamLeads, setSelTeamLeads] = useState<string[]>([])

  const managerIds = getTeamManagerIds(team)
  const teamLeadIds = getTeamLeadIds(team)
  const teamLeads = useMemo(() => users.filter(u => teamLeadIds.includes(u.uid)), [users, teamLeadIds])
  const teamManagers = useMemo(() => users.filter(u => managerIds.includes(u.uid)), [users, managerIds])
  // Every one of these re-filters the full roster; with N team cards each
  // holding their own drag/search state, a single keystroke in the shared
  // search box (or a drag-over toggling in ONE card) re-ran all of them for
  // EVERY card. Memoized so only the inputs that actually changed recompute.
  const allMembers = useMemo(
    () => users.filter(u => u.teamId === team.id && isRosterRole(u.role)),
    [users, team.id],
  )
  const rankedMembers = useMemo(
    () => rankFilter ? allMembers.filter(u => u.rank === rankFilter) : allMembers,
    [allMembers, rankFilter],
  )
  const members = useMemo(
    () => searchQuery ? rankedMembers.filter(u => matchesSearch(u, searchQuery)) : rankedMembers,
    [rankedMembers, searchQuery],
  )
  // Org-wide, department-agnostic: a manager can search the whole employee
  // roster by name/nickname, not just people already unassigned in this team's
  // own department. Adding someone here overwrites their single `teamId` (a
  // sale rep can only ever be on one team), so picking someone from another
  // team here is a move, not a duplicate assignment — AddMemberDropdown
  // surfaces their current team so that's not a surprise.
  const eligibleSale = useMemo(
    () => users.filter(u => u.role === 'sale' && u.teamId !== team.id),
    [users, team.id],
  )
  const availableHigherRoles = useMemo(
    () => users.filter(u =>
      (u.role === 'team_lead' || u.role === 'manager') &&
      !(u.visibleTeamIds ?? []).includes(team.id)
    ),
    [users, team.id],
  )
  const availableForAdd = useMemo(
    () => [...eligibleSale, ...availableHigherRoles],
    [eligibleSale, availableHigherRoles],
  )
  // Org-wide, same as managerCandidates below — a team can pull in a team lead
  // from anywhere, not just people already parked on this exact team.
  const tlCandidates = useMemo(
    () => users.filter(u => u.role === 'team_lead'),
    [users],
  )
  // Manager slot: only manager-level-and-above employees are eligible.
  const managerCandidates = useMemo(
    () => users.filter(u => canAccess(u.role, 'manager')),
    [users],
  )

  function handleAddMember(user: UserProfile, teamId: string) {
    if (user.role === 'sale') {
      onMoveUser(user.uid, teamId)
    } else {
      const current = user.visibleTeamIds ?? []
      if (!current.includes(teamId)) onUpdateVisibility(user.uid, [...current, teamId])
    }
  }

  function commitName() {
    if (nameVal.trim() && nameVal.trim() !== team.name) onRename(nameVal.trim())
    setEditingName(false)
  }

  function handleResetMembers() {
    allMembers.forEach(m => onMoveUser(m.uid, undefined))
    setConfirmReset(false)
  }

  return (
    <div
      className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4"
      onDragOver={(e) => { if (canEdit) { e.stopPropagation(); e.preventDefault() } }}
      onDrop={(e) => {
        if (!canEdit) return
        e.stopPropagation()
        e.preventDefault()
        // Fallback: drop on any non-zone part of the card → add as member
        const uid = e.dataTransfer.getData('userId')
        if (uid) {
          const droppedUser = users.find(x => x.uid === uid)
          if (droppedUser && isRosterRole(droppedUser.role)) {
            onMoveUser(uid, team.id)
          }
        }
      }}
    >
      {/* Team header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(team.name); setEditingName(false) } }}
              className="w-full text-sm font-bold text-gray-900 border-b-2 border-freshket-400 outline-none bg-transparent pb-0.5"
            />
          ) : (
            <div className="flex items-center gap-1.5 group/name">
              <h4 className="text-sm font-bold text-gray-900 truncate">{team.name}</h4>
              {canEdit && (
                <button
                  onClick={() => setEditingName(true)}
                  className="opacity-0 group-hover/name:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-all"
                >
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <span className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full mt-1 ${accent.badge}`}>
            <span className={`size-1.5 rounded-full ${accent.dot}`} />
            {(rankFilter || searchQuery) ? `${members.length}/${allMembers.length}` : allMembers.length} member{allMembers.length !== 1 ? 's' : ''}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 shrink-0">
            {canEdit && allMembers.length > 0 && (
              <button
                onClick={() => setConfirmReset(true)}
                className="p-1 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-all"
                title="Reset members to Unassigned"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1 rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 transition-all"
                title="Delete team"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            )}
            {/* Edit-mode toggle — locks all editing (rename/delete/reset/add/remove/
                drag) behind an explicit click, so browsing the board never risks
                an accidental change. */}
            <button
              onClick={() => setEditMode(v => !v)}
              title={editMode ? 'ออกจากโหมดแก้ไข' : 'แก้ไขทีม'}
              className={`p-1 rounded-lg transition-all ${
                editMode ? 'bg-freshket-100 text-freshket-700' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
              }`}
            >
              {editMode ? (
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Confirm reset */}
      {confirmReset && (
        <div className="mb-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs">
          <p className="text-amber-700 font-bold mb-2">
            ล้างสมาชิก {allMembers.length} คนกลับไปที่ Unassigned?
          </p>
          <div className="flex gap-2">
            <button onClick={handleResetMembers} className="px-3 py-1 bg-amber-500 text-white rounded-lg font-normal">Confirm</button>
            <button onClick={() => setConfirmReset(false)} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="mb-3 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs">
          <p className="text-rose-700 font-bold mb-2">Delete this team?</p>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDelete(false) }} className="px-3 py-1 bg-rose-500 text-white rounded-lg font-normal">Confirm</button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Horizontal body — Manager | Team Lead | Members side by side so the
          whole team reads as one wide row instead of a stack of sections. */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-4">

      {/* Manager */}
      <div className="lg:w-56 lg:shrink-0 lg:border-r lg:border-gray-100 lg:pr-4">
      <div
        className={`h-full rounded-xl p-2 transition-all ${
          dragOverManager ? 'bg-purple-50 border-2 border-dashed border-purple-300' : 'border-2 border-dashed border-transparent'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDragOverManager(true)
        }}
        onDragLeave={() => setDragOverManager(false)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverManager(false)
          const uid = e.dataTransfer.getData('userId')
          if (uid && !managerIds.includes(uid)) onSetManagers([...managerIds, uid])
        }}
      >
        <p className="text-xs text-gray-400 mb-1.5 font-normal">Manager</p>
        {teamManagers.length > 0 ? (
          <div className="space-y-1.5">
            {teamManagers.map(mgr => (
              <div key={mgr.uid} className="flex items-center gap-2 group/mgr">
                <div className="size-7 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold shrink-0">
                  {(mgr.nickname ?? mgr.displayName).charAt(0)}
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/users/${mgr.uid}`)}
                  title="ดูผลการเรียน"
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-xs font-bold text-gray-800 truncate hover:text-freshket-600 hover:underline">
                    {mgr.displayNameEN || mgr.displayName}
                    {mgr.nickname && (
                      <span className="text-gray-400 font-normal ml-1">({mgr.nickname})</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1 min-w-0 mt-0.5">
                    <RolePill role="manager" />
                    {mgr.position && <p className="text-xs text-gray-400 truncate">{mgr.position}</p>}
                  </div>
                </button>
                {canEdit && (
                  <button
                    onClick={() => onOpenVisibility(mgr)}
                    title="Visibility settings"
                    className="opacity-0 group-hover/mgr:opacity-100 p-0.5 rounded text-gray-300 hover:text-freshket-600 transition-all"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => onSetManagers(managerIds.filter(id => id !== mgr.uid))}
                    title="Remove Manager"
                    className="opacity-0 group-hover/mgr:opacity-100 p-0.5 rounded text-gray-300 hover:text-rose-500 transition-all"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className={`text-xs italic ${dragOverManager ? 'text-purple-600 font-bold' : 'text-gray-400'}`}>
            {dragOverManager ? 'Drop here to set as Manager' : 'No Manager — drag to assign'}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => { setSelManagers(managerIds); setShowManagerPicker(v => !v) }}
            className="text-xs text-purple-600 hover:underline mt-1.5 block"
          >
            + Assign
          </button>
        )}
        {canEdit && showManagerPicker && (
          <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-lg text-xs overflow-hidden">
            <div className="px-3 pt-2.5 pb-1.5 text-xs font-bold text-gray-500 border-b border-gray-100">
              เลือก Manager ได้หลายคน (ระดับ Manager ขึ้นไป)
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {managerCandidates.length === 0 && (
                <p className="px-3 py-3 text-gray-400 text-center">ไม่มีพนักงานระดับ Manager ขึ้นไป</p>
              )}
              {managerCandidates.map(u => {
                const checked = selManagers.includes(u.uid)
                return (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => setSelManagers(prev => checked ? prev.filter(x => x !== u.uid) : [...prev, u.uid])}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`size-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                      checked ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                    }`}>
                      {checked && (
                        <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <div className="size-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold shrink-0">
                      {(u.displayNameEN || u.displayName).charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-800 truncate">
                        {u.displayNameEN || u.displayName}
                        {u.nickname && <span className="text-gray-400 font-normal ml-1">({u.nickname})</span>}
                      </p>
                      <p className="text-gray-400 truncate">{u.position || ROLE_LABELS[u.role]}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 p-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowManagerPicker(false)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => { onSetManagers(selManagers); setShowManagerPicker(false) }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-purple-500 text-white font-bold hover:bg-purple-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Team Lead */}
      <div className="lg:w-56 lg:shrink-0 lg:border-r lg:border-gray-100 lg:pr-4">
      <div
        className={`h-full rounded-xl p-2 transition-all ${
          dragOverTL ? 'bg-blue-50 border-2 border-dashed border-blue-300' : 'border-2 border-dashed border-transparent'
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDragOverTL(true)
        }}
        onDragLeave={() => setDragOverTL(false)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOverTL(false)
          const uid = e.dataTransfer.getData('userId')
          if (uid && !teamLeadIds.includes(uid)) onSetTeamLeads([...teamLeadIds, uid])
        }}
      >
        <p className="text-xs text-gray-400 mb-1.5 font-normal">Team Lead</p>
        {teamLeads.length > 0 ? (
          <div className="space-y-1.5">
            {teamLeads.map(lead => (
              <div
                key={lead.uid}
                className={`flex items-center gap-2 group/tl ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('userId', lead.uid)
                  e.dataTransfer.setData('teamLeadTeamId', team.id)
                }}
              >
                <div className="size-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                  {(lead.nickname ?? lead.displayName).charAt(0)}
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/users/${lead.uid}`)}
                  title="ดูผลการเรียน"
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-xs font-bold text-gray-800 truncate hover:text-freshket-600 hover:underline">
                    {lead.displayNameEN || lead.displayName}
                    {lead.nickname && (
                      <span className="text-gray-400 font-normal ml-1">({lead.nickname})</span>
                    )}
                  </p>
                  <div className="flex items-center gap-1 min-w-0 mt-0.5">
                    <RolePill role="teamLead" />
                    {lead.position && <p className="text-xs text-gray-400 truncate">{lead.position}</p>}
                  </div>
                </button>
                {canEdit && (
                  <button
                    onClick={() => onOpenVisibility(lead)}
                    title="Visibility settings"
                    className="opacity-0 group-hover/tl:opacity-100 p-0.5 rounded text-gray-300 hover:text-freshket-600 transition-all"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => onSetTeamLeads(teamLeadIds.filter(id => id !== lead.uid))}
                    title="Remove Team Lead"
                    className="opacity-0 group-hover/tl:opacity-100 p-0.5 rounded text-gray-300 hover:text-rose-500 transition-all"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className={`text-xs italic ${dragOverTL ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
            {dragOverTL ? 'Drop here to set as Team Lead' : 'No Team Lead yet (drag to assign)'}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => { setSelTeamLeads(teamLeadIds); setShowTLPicker(v => !v) }}
            className="text-xs text-freshket-600 hover:underline mt-1.5 block"
          >
            + Set
          </button>
        )}
        {canEdit && showTLPicker && (
          <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-lg text-xs overflow-hidden">
            <div className="px-3 pt-2.5 pb-1.5 text-xs font-bold text-gray-500 border-b border-gray-100">
              เลือก Team Lead ได้หลายคน
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {tlCandidates.length === 0 && (
                <p className="px-3 py-3 text-gray-400 text-center">No Team Lead available</p>
              )}
              {tlCandidates.map(u => {
                const checked = selTeamLeads.includes(u.uid)
                return (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => setSelTeamLeads(prev => checked ? prev.filter(x => x !== u.uid) : [...prev, u.uid])}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`size-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                      checked ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {checked && (
                        <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <div className="size-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">
                      {(u.displayNameEN || u.displayName).charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-800 truncate">
                        {u.displayNameEN || u.displayName}
                        {u.nickname && <span className="text-gray-400 font-normal ml-1">({u.nickname})</span>}
                      </p>
                      <p className="text-gray-400 truncate">{u.position || ROLE_LABELS[u.role]}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 p-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowTLPicker(false)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 font-bold hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => { onSetTeamLeads(selTeamLeads); setShowTLPicker(false) }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white font-bold hover:bg-blue-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Members list */}
      <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-400 mb-1 font-normal">Members</p>
      <div
        className={`flex flex-wrap gap-2 mb-2 rounded-xl p-2 transition-all ${
          dragOverMembers ? 'bg-freshket-50 border-2 border-dashed border-freshket-300' : 'bg-transparent border-2 border-dashed border-transparent'
        }`}
        onDragOver={(e) => {
          if (!canEdit) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDragOverMembers(true)
        }}
        onDragLeave={() => setDragOverMembers(false)}
        onDrop={(e) => {
          if (!canEdit) return
          e.preventDefault()
          e.stopPropagation()
          setDragOverMembers(false)
          const uid = e.dataTransfer.getData('userId')
          if (uid) {
            const droppedUser = users.find(x => x.uid === uid)
            if (droppedUser && isRosterRole(droppedUser.role)) onMoveUser(uid, team.id)
          }
        }}
      >
        {members.map(m => (
          <MemberRow
            key={m.uid}
            user={m}
            teams={allTeams.filter(t => t.id !== team.id)}
            currentTeamId={team.id}
            canEdit={canEdit}
            isTeamLead={teamLeadIds.includes(m.uid)}
            isManager={managerIds.includes(m.uid)}
            onMove={onMoveUser}
            onSetTeamLead={() => onSetTeamLeads([...teamLeadIds, m.uid])}
            onDelete={() => onMoveUser(m.uid, undefined)}
          />
        ))}
        {members.length === 0 && (
          <p className={`text-xs italic py-1 ${
            dragOverMembers ? 'text-freshket-600 font-bold' : 'text-gray-400'
          }`}>
            {dragOverMembers ? 'Drop here' : searchQuery ? 'ไม่พบคนที่ตรงกับการค้นหา' : 'No members yet'}
          </p>
        )}
      </div>

      {/* Add member */}
      {canEdit && (
        <div>
          <button
            onClick={() => setShowAddMember(!showAddMember)}
            className="flex items-center gap-1.5 text-xs text-freshket-600 hover:text-freshket-700 font-normal mt-1 transition-colors"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add member
          </button>
          {showAddMember && (
            <AddMemberDropdown
              teamId={team.id}
              availableUsers={availableForAdd}
              allTeams={allTeams}
              onAdd={handleAddMember}
              onClose={() => setShowAddMember(false)}
            />
          )}
        </div>
      )}
      </div>

      </div>
    </div>
  )
}


// ── Department Card ───────────────────────────────────────────────────────────

function DeptCard({
  dept,
  deptIndex,
  sourceNames,
  teams,
  users,
  allTeams,
  canManage,
  onRenameTeam,
  onDeleteTeam,
  onAddTeam,
  onMoveUser,
  onSetTeamLeads,
  onSetManagers,
  onOpenVisibility,
  onUpdateVisibility,
  searchQuery,
}: {
  dept: Department
  deptIndex: number
  sourceNames: string[]
  teams: Team[]
  users: UserProfile[]
  allTeams: Team[]
  canManage: boolean
  onRenameTeam: (teamId: string, name: string) => void
  onDeleteTeam: (teamId: string) => void
  onAddTeam: (deptId: string, name: string) => void
  onMoveUser: (uid: string, teamId: string | undefined) => void
  onSetTeamLeads: (teamId: string, uids: string[]) => void
  onSetManagers: (teamId: string, uids: string[]) => void
  onOpenVisibility: (user: UserProfile) => void
  onUpdateVisibility: (uid: string, teamIds: string[] | undefined) => void
  searchQuery?: string
}) {
  const accent = deptAccent(deptIndex)
  const [addingTeam, setAddingTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [rankFilter, setRankFilter] = useState('')

  const manager = users.find(u => u.uid === dept.managerId)
  // Both re-filter the full roster; without memoization, local state
  // unrelated to the roster (e.g. typing a new team's name) still re-ran
  // these on every keystroke.
  const deptTeams = useMemo(() => {
    // Support merged departments: match teams from all source dept IDs
    const sourceDeptIds = new Set(sourceNames.map(deptId))
    return teams.filter(t => {
      if (t.departmentId) return sourceDeptIds.has(t.departmentId)
      // Orphan team (no departmentId): include if any member belongs to a source department
      return users.some(u => u.teamId === t.id && !!u.department && sourceNames.includes(u.department))
    })
  }, [teams, users, sourceNames])

  // Members belonging to any source department — feeds both the header count
  // and (filtered to roster roles) the rank-filter option list below.
  const deptMembers = useMemo(
    () => users.filter(u => !!u.department && sourceNames.includes(u.department)),
    [users, sourceNames],
  )
  const deptMemberCount = useMemo(() => deptMembers.filter(u => isRosterRole(u.role)).length, [deptMembers])
  // Only ranks present in any source department
  const deptRanks = useMemo(
    () => Array.from(new Set(deptMembers.map(u => u.rank).filter((r): r is string => Boolean(r)))).sort(),
    [deptMembers],
  )

  // Unassigned-in-this-dept roster, computed once instead of inside the JSX
  // IIFE below (which re-ran on every render regardless of whether teams/
  // users/filters actually changed).
  const deptTeamIds = useMemo(() => new Set(deptTeams.map(t => t.id)), [deptTeams])
  const allUnassigned = useMemo(
    () => users.filter(u => {
      if (!u.department || !sourceNames.includes(u.department)) return false
      if (!isRosterRole(u.role)) return false
      if (!u.teamId) return true
      // Show if their team is not visible in this card (orphan, wrong dept, or deleted team)
      return !deptTeamIds.has(u.teamId)
    }),
    [users, sourceNames, deptTeamIds],
  )
  const rankedUnassigned = useMemo(
    () => rankFilter ? allUnassigned.filter(u => u.rank === rankFilter) : allUnassigned,
    [allUnassigned, rankFilter],
  )
  const visibleUnassigned = useMemo(
    () => searchQuery ? rankedUnassigned.filter(u => matchesSearch(u, searchQuery)) : rankedUnassigned,
    [rankedUnassigned, searchQuery],
  )

  function commitAddTeam() {
    if (newTeamName.trim()) {
      onAddTeam(dept.id, newTeamName.trim())
      setNewTeamName('')
    }
    setAddingTeam(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Dept header */}
      <div className={`px-6 py-4 border-b border-gray-100 ${accent.ring} bg-opacity-40`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`size-8 rounded-xl flex items-center justify-center text-sm font-bold ${accent.badge}`}>
              {dept.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900">{dept.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{deptTeams.length} team{deptTeams.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-400">
                  {deptMemberCount} members
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Manager badge + visibility */}
            {manager && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
                <div className="size-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                  {manager.displayName.charAt(0)}
                </div>
                <div className="text-xs leading-tight">
                  <p className="text-gray-400 font-normal">Manager</p>
                  <p className="text-gray-700 font-bold">{manager.displayNameEN || manager.displayName}</p>
                </div>
                {canManage && (
                  <button
                    onClick={() => onOpenVisibility(manager)}
                    title="Visibility settings"
                    className="ml-1 p-1 rounded-lg text-gray-300 hover:text-freshket-600 hover:bg-freshket-50 transition-all"
                  >
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Rank filter pills — only ranks in this dept */}
            {deptRanks.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setRankFilter('')}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    rankFilter === '' ? 'bg-freshket-100 border-freshket-300 text-freshket-700 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  All
                </button>
                {deptRanks.map(rank => (
                  <button
                    key={rank}
                    onClick={() => setRankFilter(rankFilter === rank ? '' : rank)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      rankFilter === rank ? 'bg-freshket-100 border-freshket-300 text-freshket-700 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {rank}
                  </button>
                ))}
              </div>
            )}

            {canManage && (
              <button
                onClick={() => setAddingTeam(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add team
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Teams grid — drop here (outside any TeamCard) to unassign */}
      <div
        className="p-5"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
        onDrop={(e) => {
          e.preventDefault()
          const uid = e.dataTransfer.getData('userId')
          const teamLeadTeamId = e.dataTransfer.getData('teamLeadTeamId')
          if (uid) {
            if (teamLeadTeamId) {
              const t = teams.find(x => x.id === teamLeadTeamId)
              if (t) onSetTeamLeads(teamLeadTeamId, getTeamLeadIds(t).filter(id => id !== uid))
            } else {
              onMoveUser(uid, undefined)
            }
          }
        }}
      >
        <div className="flex flex-col gap-3">
          {deptTeams.map(t => (
            <TeamCard
              key={t.id}
              team={t}
              users={users}
              allTeams={allTeams}
              canManage={canManage}
              accent={accent}
              deptName={dept.name}
              sourceNames={sourceNames}
              onRename={name => onRenameTeam(t.id, name)}
              onDelete={() => onDeleteTeam(t.id)}
              onMoveUser={onMoveUser}
              onSetTeamLeads={uids => onSetTeamLeads(t.id, uids)}
              onSetManagers={uids => onSetManagers(t.id, uids)}
              onOpenVisibility={onOpenVisibility}
              onUpdateVisibility={onUpdateVisibility}
              rankFilter={rankFilter}
              searchQuery={searchQuery}
            />
          ))}

          {/* Add team inline form */}
          {addingTeam && (
            <div className="w-full max-w-sm bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-4">
              <p className="text-xs text-gray-500 font-normal mb-2">Team name</p>
              <input
                autoFocus
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitAddTeam(); if (e.key === 'Escape') setAddingTeam(false) }}
                placeholder="e.g. Team Sale C"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={commitAddTeam} className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all">Add</button>
                <button onClick={() => setAddingTeam(false)} className="px-3 py-1.5 text-xs rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">Cancel</button>
              </div>
            </div>
          )}

          {deptTeams.length === 0 && !addingTeam && (
            <div className="text-center py-8 text-sm text-gray-400">
              No teams yet — click <span className="text-freshket-600 font-normal">Add team</span> to get started
            </div>
          )}
        </div>

      </div>

      {/* Unassigned members in this dept */}
      {allUnassigned.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400 font-normal mb-2">
            Unassigned ({(rankFilter || searchQuery) ? `${visibleUnassigned.length}/${allUnassigned.length}` : allUnassigned.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {visibleUnassigned.map(u => (
              <div
                key={u.uid}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('userId', u.uid)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-freshket-200 transition-all"
              >
                <span className={`size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rankColor(u.rank)}`}>
                  {(u.displayNameEN || u.displayName).charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{u.displayNameEN || u.displayName}</p>
                  <div className="flex items-center gap-1 min-w-0">
                    {u.rank && (
                      <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full ${rankColor(u.rank)}`}>{u.rank}</span>
                    )}
                    {u.nickname && <p className="text-xs text-gray-400 truncate">{u.nickname}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── OrgBoard (main export) ────────────────────────────────────────────────────

export function OrgBoard({
  departments,
  teams,
  users,
  canManage,
  searchQuery,
  deptFilter,
  onRenameTeam,
  onDeleteTeam,
  onAddTeam,
  onMoveUser,
  onSetTeamLeads,
  onSetManagers,
  onUpdateVisibility,
}: OrgBoardProps) {
  const [visibilityUser, setVisibilityUser] = useState<UserProfile | null>(null)
  const [activeDeptId, setActiveDeptId] = useState<string | null>(null)

  // Apply DEPT_MERGES: collapse specified departments into a single card
  const displayDepts: Array<{ dept: Department; sourceNames: string[] }> = (() => {
    const mergeByName = new Map<string, { sourceNames: string[]; displayName: string }>()
    for (const m of DEPT_MERGES) {
      for (const n of m.sourceNames) mergeByName.set(n, m)
    }
    const seen = new Set<string>()
    const result: Array<{ dept: Department; sourceNames: string[] }> = []
    for (const dept of departments) {
      const merge = mergeByName.get(dept.name)
      if (merge) {
        if (!seen.has(merge.displayName)) {
          seen.add(merge.displayName)
          result.push({
            dept: { ...dept, name: merge.displayName, id: deptId(merge.sourceNames[0]) },
            sourceNames: merge.sourceNames,
          })
        }
      } else {
        result.push({ dept, sourceNames: [dept.name] })
      }
    }
    return result
  })()

  // Every dept/team card filters strictly by `sourceNames.includes(u.department)`.
  // A sale/team_lead user whose `department` doesn't exactly match any known
  // department name (typo, trailing space, stale value, or simply not onboarded
  // yet) falls through every card's filter and renders nowhere — by design,
  // not surfaced anywhere on this board.

  // Department checklist filter, then hide any dept card with zero search matches
  // (a person counts as a "match" whether they're on a team or unassigned).
  const visibleDepts = displayDepts.filter(({ sourceNames }) => {
    if (!sourceNames.some(n => PHASE1_DEPARTMENTS.has(n))) return false
    if (deptFilter && deptFilter.length > 0 && !sourceNames.some(n => deptFilter.includes(n))) return false
    if (!searchQuery) return true
    return users.some(u =>
      isRosterRole(u.role) &&
      !!u.department && sourceNames.includes(u.department) &&
      matchesSearch(u, searchQuery)
    )
  })

  // One tab per department; clicking a tab shows only that department's teams.
  // Fall back to the first visible dept when the remembered tab is filtered out.
  const activeIdx = Math.max(0, visibleDepts.findIndex(d => d.dept.id === activeDeptId))
  const activeEntry = visibleDepts[activeIdx]

  const deptMemberCount = (sourceNames: string[]) =>
    users.filter(u => !!u.department && sourceNames.includes(u.department) && isRosterRole(u.role)).length

  return (
    <div className="space-y-5">
      {/* Department tabs — one per department, click to switch */}
      {visibleDepts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {visibleDepts.map(({ dept, sourceNames }, idx) => {
            const accent = deptAccent(idx)
            const isActive = idx === activeIdx
            return (
              <button
                key={dept.id}
                onClick={() => setActiveDeptId(dept.id)}
                className={`inline-flex items-center gap-2 pl-2.5 pr-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`size-2 rounded-full shrink-0 ${accent.dot}`} />
                <span className="truncate max-w-[14rem]">{dept.name}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {deptMemberCount(sourceNames)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {activeEntry && (
        <DeptCard
          key={activeEntry.dept.id}
          dept={activeEntry.dept}
          deptIndex={activeIdx}
          sourceNames={activeEntry.sourceNames}
          teams={teams}
          users={users}
          allTeams={teams}
          canManage={canManage}
          searchQuery={searchQuery}
          onRenameTeam={onRenameTeam}
          onDeleteTeam={onDeleteTeam}
          onAddTeam={onAddTeam}
          onMoveUser={onMoveUser}
          onSetTeamLeads={onSetTeamLeads}
          onSetManagers={onSetManagers}
          onOpenVisibility={setVisibilityUser}
          onUpdateVisibility={onUpdateVisibility}
        />
      )}

      {departments.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="size-10 mx-auto mb-3 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          <p className="text-sm font-normal">No departments yet</p>
        </div>
      )}

      {departments.length > 0 && visibleDepts.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <p className="text-sm font-normal">ไม่พบแผนกหรือพนักงานที่ตรงกับตัวกรอง</p>
        </div>
      )}

      {visibilityUser && (
        <VisibilityModal
          user={visibilityUser}
          allTeams={teams}
          departments={departments}
          onSave={onUpdateVisibility}
          onClose={() => setVisibilityUser(null)}
        />
      )}
    </div>
  )
}
