'use client'

import { useState, useRef } from 'react'
import type { Department, Team, UserProfile } from '@/types/user'
import { ROLE_LABELS } from '@/types/user'

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrgBoardProps {
  departments: Department[]
  teams: Team[]
  users: UserProfile[]
  canManage: boolean
  onRenameTeam:   (teamId: string, name: string) => void
  onDeleteTeam:   (teamId: string) => void
  onAddTeam:      (deptId: string, name: string) => void
  onMoveUser:     (userId: string, teamId: string | undefined) => void
  onSetTeamLead:  (teamId: string, userId: string | undefined) => void
  onUpdateVisibility: (userId: string, visibleTeamIds: string[] | undefined) => void
}

// ── Colors ────────────────────────────────────────────────────────────────────

const DEPT_ACCENT: Record<number, { ring: string; badge: string; dot: string }> = {
  0: { ring: 'border-freshket-300 bg-freshket-50', badge: 'bg-freshket-100 text-freshket-700 border border-freshket-200', dot: 'bg-freshket-500' },
  1: { ring: 'border-blue-200 bg-blue-50',         badge: 'bg-blue-100 text-blue-700 border border-blue-200',             dot: 'bg-blue-500' },
  2: { ring: 'border-purple-200 bg-purple-50',     badge: 'bg-purple-100 text-purple-700 border border-purple-200',       dot: 'bg-purple-500' },
  3: { ring: 'border-amber-200 bg-amber-50',       badge: 'bg-amber-100 text-amber-700 border border-amber-200',         dot: 'bg-amber-500' },
}
function deptAccent(idx: number) { return DEPT_ACCENT[idx % 4] }

// ── Visibility Modal ──────────────────────────────────────────────────────────

function VisibilityModal({
  user,
  allTeams,
  onSave,
  onClose,
}: {
  user: UserProfile
  allTeams: Team[]
  onSave: (uid: string, visibleTeamIds: string[] | undefined) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'all' | 'selected'>(
    user.visibleTeamIds === undefined ? 'all' : 'selected'
  )
  const [selected, setSelected] = useState<string[]>(user.visibleTeamIds ?? [])

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSave() {
    onSave(user.uid, mode === 'all' ? undefined : selected)
    onClose()
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
            <div className="ml-7 space-y-2 pt-1">
              {allTeams.map(t => (
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
              ))}
              {allTeams.length === 0 && (
                <p className="text-xs text-gray-400">ยังไม่มีทีมในระบบ</p>
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
  canManage,
  onMove,
}: {
  user: UserProfile
  teams: Team[]
  currentTeamId: string
  canManage: boolean
  onMove: (uid: string, teamId: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function handleSelect(teamId: string | undefined) {
    onMove(user.uid, teamId)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-2 py-1 group/member" ref={ref}>
      <div className="size-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
        {user.displayName.charAt(0)}
      </div>
      <span className="text-sm text-gray-700 flex-1 truncate">
        {user.displayName}
        {user.nickname && <span className="text-gray-400 text-xs ml-1">({user.nickname})</span>}
      </span>
      {canManage && (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="opacity-0 group-hover/member:opacity-100 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            title="ย้ายทีม"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
          {open && (
            <div className="absolute right-0 top-6 z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-36 text-sm">
              <div className="px-3 py-1.5 text-xs text-gray-400 font-normal border-b border-gray-100">ย้ายไปทีม</div>
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
                ออกจากทีม
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-400 text-xs border-t border-gray-100 mt-1"
              >
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add member dropdown ───────────────────────────────────────────────────────

function AddMemberDropdown({
  teamId,
  availableUsers,
  onAdd,
  onClose,
}: {
  teamId: string
  availableUsers: UserProfile[]
  onAdd: (user: UserProfile, teamId: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = availableUsers.filter(u =>
    !q || u.displayName.toLowerCase().includes(q.toLowerCase())
  )

  if (availableUsers.length === 0) {
    return (
      <div className="mt-2 p-3 rounded-xl border border-gray-100 bg-gray-50 text-xs text-gray-400 text-center">
        ไม่มีพนักงานที่จะเพิ่มได้
        <button onClick={onClose} className="block mx-auto mt-1 text-gray-300 hover:text-gray-400">ปิด</button>
      </div>
    )
  }

  return (
    <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-lg text-sm overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          placeholder="ค้นหาพนักงาน..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-freshket-300"
        />
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {filtered.map(u => (
          <button
            key={u.uid}
            onClick={() => { onAdd(u, teamId); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
          >
            <div className="size-5 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0">
              {u.displayName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-gray-700 truncate">{u.displayName}</span>
              {(u.role === 'manager' || u.role === 'team_lead') && (
                <span className="ml-1.5 text-xs text-blue-500">{ROLE_LABELS[u.role]}</span>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">ไม่พบ</p>}
      </div>
      <div className="border-t border-gray-100 px-3 py-2">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-500">ยกเลิก</button>
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
  onRename,
  onDelete,
  onMoveUser,
  onSetTeamLead,
  onOpenVisibility,
  onUpdateVisibility,
}: {
  team: Team
  users: UserProfile[]
  allTeams: Team[]
  canManage: boolean
  accent: ReturnType<typeof deptAccent>
  onRename: (name: string) => void
  onDelete: () => void
  onMoveUser: (uid: string, teamId: string | undefined) => void
  onSetTeamLead: (uid: string | undefined) => void
  onOpenVisibility: (user: UserProfile) => void
  onUpdateVisibility: (uid: string, teamIds: string[] | undefined) => void
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(team.name)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showTLPicker, setShowTLPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const teamLead = users.find(u => u.uid === team.teamLeadId)
  const members = users.filter(u => u.teamId === team.id && u.role === 'sale')
  // sale: only unassigned (enforce one-team-only); manager/team_lead: not yet tracking this team
  const unassignedSale = users.filter(u => u.role === 'sale' && !u.teamId)
  const availableHigherRoles = users.filter(u =>
    (u.role === 'team_lead' || u.role === 'manager') &&
    !(u.visibleTeamIds ?? []).includes(team.id)
  )
  const availableForAdd = [...unassignedSale, ...availableHigherRoles]
  const tlCandidates = users.filter(u => u.role === 'team_lead' && (u.teamId === team.id || !u.teamId))

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

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex-1 min-w-52 max-w-xs">
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
              {canManage && (
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
            {members.length} คน
          </span>
        </div>
        {canManage && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded-lg text-gray-300 hover:text-rose-400 hover:bg-rose-50 transition-all"
            title="ลบทีม"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="mb-3 p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs">
          <p className="text-rose-700 font-bold mb-2">ลบทีมนี้?</p>
          <div className="flex gap-2">
            <button onClick={() => { onDelete(); setConfirmDelete(false) }} className="px-3 py-1 bg-rose-500 text-white rounded-lg font-normal">ยืนยัน</button>
            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg">ยกเลิก</button>
          </div>
        </div>
      )}

      {/* Team Lead */}
      <div className="mb-3 pb-3 border-b border-gray-100">
        <p className="text-xs text-gray-400 mb-1.5 font-normal">Team Lead</p>
        {teamLead ? (
          <div className="flex items-center gap-2 group/tl">
            <div className="size-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
              {teamLead.displayName.charAt(0)}
            </div>
            <span className="text-xs font-bold text-gray-700 flex-1 truncate">{teamLead.displayName}</span>
            {canManage && (
              <button
                onClick={() => onOpenVisibility(teamLead)}
                title="ตั้งค่าการมองเห็น"
                className="opacity-0 group-hover/tl:opacity-100 p-0.5 rounded text-gray-300 hover:text-freshket-600 transition-all"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 italic">ยังไม่มี Team Lead</span>
            {canManage && (
              <button
                onClick={() => setShowTLPicker(!showTLPicker)}
                className="text-xs text-freshket-600 hover:underline"
              >
                + ตั้งค่า
              </button>
            )}
          </div>
        )}
        {canManage && showTLPicker && (
          <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow text-xs overflow-hidden">
            {tlCandidates.map(u => (
              <button
                key={u.uid}
                onClick={() => { onSetTeamLead(u.uid); setShowTLPicker(false) }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
              >
                <div className="size-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">{u.displayName.charAt(0)}</div>
                {u.displayName}
              </button>
            ))}
            {tlCandidates.length === 0 && <p className="px-3 py-2 text-gray-400">ไม่มี Team Lead ว่าง</p>}
            <button onClick={() => setShowTLPicker(false)} className="w-full px-3 py-1.5 text-gray-400 hover:bg-gray-50 border-t border-gray-100">ยกเลิก</button>
          </div>
        )}
      </div>

      {/* Members list */}
      <div className="space-y-0.5 mb-2">
        {members.map(m => (
          <MemberRow
            key={m.uid}
            user={m}
            teams={[...([teamLead ? { ...team } : null]).filter(Boolean) as Team[], ...[]]}
            currentTeamId={team.id}
            canManage={canManage}
            onMove={onMoveUser}
          />
        ))}
        {members.length === 0 && (
          <p className="text-xs text-gray-400 italic py-1">ยังไม่มีสมาชิก</p>
        )}
      </div>

      {/* Add member */}
      {canManage && (
        <div>
          <button
            onClick={() => setShowAddMember(!showAddMember)}
            className="flex items-center gap-1.5 text-xs text-freshket-600 hover:text-freshket-700 font-normal mt-1 transition-colors"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            เพิ่มสมาชิก
          </button>
          {showAddMember && (
            <AddMemberDropdown
              teamId={team.id}
              availableUsers={availableForAdd}
              onAdd={handleAddMember}
              onClose={() => setShowAddMember(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Department Card ───────────────────────────────────────────────────────────

function DeptCard({
  dept,
  deptIndex,
  teams,
  users,
  allTeams,
  canManage,
  onRenameTeam,
  onDeleteTeam,
  onAddTeam,
  onMoveUser,
  onSetTeamLead,
  onOpenVisibility,
  onUpdateVisibility,
}: {
  dept: Department
  deptIndex: number
  teams: Team[]
  users: UserProfile[]
  allTeams: Team[]
  canManage: boolean
  onRenameTeam: (teamId: string, name: string) => void
  onDeleteTeam: (teamId: string) => void
  onAddTeam: (deptId: string, name: string) => void
  onMoveUser: (uid: string, teamId: string | undefined) => void
  onSetTeamLead: (teamId: string, uid: string | undefined) => void
  onOpenVisibility: (user: UserProfile) => void
  onUpdateVisibility: (uid: string, teamIds: string[] | undefined) => void
}) {
  const accent = deptAccent(deptIndex)
  const [addingTeam, setAddingTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  const manager = users.find(u => u.uid === dept.managerId)
  const deptTeams = teams.filter(t => t.departmentId === dept.id)

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
                <span className="text-xs text-gray-400">{deptTeams.length} ทีม</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-400">
                  {deptTeams.reduce((n, t) => n + users.filter(u => u.teamId === t.id && u.role === 'sale').length, 0)} คน
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
                  <p className="text-gray-700 font-bold">{manager.displayName}</p>
                </div>
                {canManage && (
                  <button
                    onClick={() => onOpenVisibility(manager)}
                    title="ตั้งค่าการมองเห็น"
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

            {canManage && (
              <button
                onClick={() => setAddingTeam(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                เพิ่มทีม
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Teams grid */}
      <div className="p-5">
        <div className="flex flex-wrap gap-4">
          {deptTeams.map(t => (
            <TeamCard
              key={t.id}
              team={t}
              users={users}
              allTeams={allTeams}
              canManage={canManage}
              accent={accent}
              onRename={name => onRenameTeam(t.id, name)}
              onDelete={() => onDeleteTeam(t.id)}
              onMoveUser={onMoveUser}
              onSetTeamLead={uid => onSetTeamLead(t.id, uid)}
              onOpenVisibility={onOpenVisibility}
              onUpdateVisibility={onUpdateVisibility}
            />
          ))}

          {/* Add team inline form */}
          {addingTeam && (
            <div className="flex-1 min-w-52 max-w-xs bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-4">
              <p className="text-xs text-gray-500 font-normal mb-2">ชื่อทีมใหม่</p>
              <input
                autoFocus
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitAddTeam(); if (e.key === 'Escape') setAddingTeam(false) }}
                placeholder="เช่น ทีม Sale C"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={commitAddTeam} className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all">เพิ่ม</button>
                <button onClick={() => setAddingTeam(false)} className="px-3 py-1.5 text-xs rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all">ยกเลิก</button>
              </div>
            </div>
          )}

          {deptTeams.length === 0 && !addingTeam && (
            <div className="flex-1 text-center py-8 text-sm text-gray-400">
              ยังไม่มีทีม — กด <span className="text-freshket-600 font-normal">เพิ่มทีม</span> เพื่อเริ่มต้น
            </div>
          )}
        </div>

        {/* Unassigned in this dept */}
        {(() => {
          const deptTL = users.filter(u => u.role === 'team_lead' && deptTeams.some(t => t.teamLeadId === u.uid))
          const deptTeamIds = deptTeams.map(t => t.id)
          const unassigned = users.filter(u => u.role === 'sale' && !u.teamId)
          if (unassigned.length === 0) return null
          return (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-normal mb-2">ยังไม่ได้จัดทีม ({unassigned.length} คน)</p>
              <div className="flex flex-wrap gap-2">
                {unassigned.map(u => (
                  <div key={u.uid} className="flex items-center gap-1.5 bg-gray-100 rounded-full px-2.5 py-1 text-xs text-gray-600">
                    <span className="size-4 rounded-full bg-gray-300 flex items-center justify-center text-gray-500 text-xs font-bold">{u.displayName.charAt(0)}</span>
                    {u.displayName}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── OrgBoard (main export) ────────────────────────────────────────────────────

export function OrgBoard({
  departments,
  teams,
  users,
  canManage,
  onRenameTeam,
  onDeleteTeam,
  onAddTeam,
  onMoveUser,
  onSetTeamLead,
  onUpdateVisibility,
}: OrgBoardProps) {
  const [visibilityUser, setVisibilityUser] = useState<UserProfile | null>(null)

  return (
    <div className="space-y-5">
      {departments.map((dept, idx) => (
        <DeptCard
          key={dept.id}
          dept={dept}
          deptIndex={idx}
          teams={teams}
          users={users}
          allTeams={teams}
          canManage={canManage}
          onRenameTeam={onRenameTeam}
          onDeleteTeam={onDeleteTeam}
          onAddTeam={onAddTeam}
          onMoveUser={onMoveUser}
          onSetTeamLead={onSetTeamLead}
          onOpenVisibility={setVisibilityUser}
          onUpdateVisibility={onUpdateVisibility}
        />
      ))}

      {departments.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          <svg className="size-10 mx-auto mb-3 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
          <p className="text-sm font-normal">ยังไม่มีแผนก</p>
        </div>
      )}

      {visibilityUser && (
        <VisibilityModal
          user={visibilityUser}
          allTeams={teams}
          onSave={onUpdateVisibility}
          onClose={() => setVisibilityUser(null)}
        />
      )}
    </div>
  )
}
