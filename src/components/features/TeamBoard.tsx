'use client'

import { useState, useRef } from 'react'
import type { UserProfile, Team, UserRole } from '@/types/user'
import { ROLE_LABELS } from '@/types/user'

// ── Colour palette for team columns (cycles by index) ────────────────────────
const TEAM_COLORS = [
  { header: 'bg-freshket-50 border-freshket-200', dot: 'bg-freshket-500', badge: 'text-freshket-700' },
  { header: 'bg-blue-50 border-blue-200',          dot: 'bg-blue-500',     badge: 'text-blue-700' },
  { header: 'bg-purple-50 border-purple-200',      dot: 'bg-purple-500',   badge: 'text-purple-700' },
  { header: 'bg-amber-50 border-amber-200',        dot: 'bg-amber-500',    badge: 'text-amber-700' },
  { header: 'bg-teal-50 border-teal-200',          dot: 'bg-teal-500',     badge: 'text-teal-700' },
  { header: 'bg-rose-50 border-rose-200',          dot: 'bg-rose-500',     badge: 'text-rose-700' },
]
const UNASSIGNED_COLOR = { header: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400', badge: 'text-gray-500' }

function getColor(index: number) {
  return TEAM_COLORS[index % TEAM_COLORS.length]
}

const ROLE_BADGE: Record<UserRole, string> = {
  super_admin: 'bg-orange-100 text-orange-700',
  manager:     'bg-purple-100 text-purple-700',
  team_lead:   'bg-blue-100 text-blue-700',
  sale:        'bg-freshket-100 text-freshket-700',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TeamBoardProps {
  teams: Team[]
  users: UserProfile[]
  canManage: boolean
  onMoveUser:   (userId: string, teamId: string | undefined) => void
  onRenameTeam: (teamId: string, newName: string) => void
  onDeleteTeam: (teamId: string) => void
  onAddTeam:    (name: string) => void
}

// ── User card ─────────────────────────────────────────────────────────────────

function UserCard({
  user,
  isDragging,
  onDragStart,
}: {
  user: UserProfile
  isDragging: boolean
  onDragStart: (e: React.DragEvent, uid: string) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, user.uid)}
      className={`group flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm
        cursor-grab active:cursor-grabbing hover:shadow-md hover:border-freshket-200 transition-all select-none
        ${isDragging ? 'opacity-40 scale-95' : ''}`}
    >
      {/* Drag handle */}
      <svg className="size-3.5 text-gray-300 group-hover:text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>

      {/* Avatar */}
      <div className="size-7 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-xs font-bold shrink-0">
        {user.displayName.charAt(0)}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-gray-900 truncate leading-tight">
          {user.displayName}
          {user.nickname && <span className="text-gray-400 font-normal ml-1">({user.nickname})</span>}
        </p>
        <span className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  )
}

// ── Team column ───────────────────────────────────────────────────────────────

interface ColumnProps {
  teamId: string | null
  name: string
  colorIdx: number
  users: UserProfile[]
  isOver: boolean
  isDragging: boolean
  draggingId: string | null
  canManage: boolean
  onDragOver:   (e: React.DragEvent, teamId: string | null) => void
  onDragLeave:  () => void
  onDrop:       (e: React.DragEvent, teamId: string | null) => void
  onDragStart:  (e: React.DragEvent, uid: string) => void
  onRename:     (teamId: string, name: string) => void
  onDelete:     (teamId: string) => void
}

function TeamColumn({
  teamId, name, colorIdx, users, isOver, draggingId, canManage,
  onDragOver, onDragLeave, onDrop, onDragStart, onRename, onDelete,
}: ColumnProps) {
  const color = teamId !== null ? getColor(colorIdx) : UNASSIGNED_COLOR
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditName(name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 30)
  }

  function commitEdit() {
    setEditing(false)
    if (editName.trim() && editName.trim() !== name && teamId) {
      onRename(teamId, editName.trim())
    }
  }

  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      {/* Header */}
      <div className={`flex items-center gap-2 rounded-t-xl border-x border-t px-3 py-2.5 ${color.header}`}>
        <span className={`size-2 rounded-full shrink-0 ${color.dot}`} />

        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
            className="flex-1 text-sm font-bold bg-white border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-freshket-300"
          />
        ) : (
          <span
            className={`flex-1 text-sm font-bold ${color.badge} ${canManage && teamId ? 'cursor-pointer hover:underline' : ''}`}
            onClick={() => canManage && teamId && startEdit()}
            title={canManage && teamId ? 'คลิกเพื่อเปลี่ยนชื่อทีม' : undefined}
          >
            {name}
          </span>
        )}

        <span className={`ml-auto inline-flex size-5 items-center justify-center rounded-full text-xs font-bold ${color.badge} bg-white/70`}>
          {users.length}
        </span>

        {canManage && teamId && !editing && (
          <button
            onClick={() => onDelete(teamId)}
            title="ลบทีม"
            className="p-0.5 rounded text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => onDragOver(e, teamId)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, teamId)}
        className={`flex flex-col gap-1.5 rounded-b-xl border-x border-b p-2.5 min-h-[160px] transition-all
          ${color.header} ${isOver ? 'ring-2 ring-inset ring-freshket-400 bg-freshket-50' : ''}`}
      >
        {users.map((u) => (
          <UserCard
            key={u.uid}
            user={u}
            isDragging={draggingId === u.uid}
            onDragStart={onDragStart}
          />
        ))}
        {users.length === 0 && (
          <div className={`flex flex-1 min-h-[80px] items-center justify-center rounded-lg border-2 border-dashed
            text-xs transition-colors ${isOver ? 'border-freshket-400 text-freshket-500' : 'border-gray-200 text-gray-300'}`}>
            {isOver ? 'วางที่นี่' : teamId ? 'ยังไม่มีสมาชิก' : 'ลากมาวางที่นี่'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeamBoard({
  teams, users, canManage,
  onMoveUser, onRenameTeam, onDeleteTeam, onAddTeam,
}: TeamBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overTeamId, setOverTeamId] = useState<string | null | undefined>(undefined) // undefined = not over any column
  const [newTeamName, setNewTeamName] = useState('')
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Column data ──────────────────────────────────────────────────────────
  const assignedIds = new Set(teams.map((t) => t.id))
  const unassigned  = users.filter((u) => !u.teamId || !assignedIds.has(u.teamId))

  // ── Drag handlers ────────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, uid: string) {
    e.dataTransfer.setData('userId', uid)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(uid)
  }
  function handleDragEnd() { setDraggingId(null); setOverTeamId(undefined) }

  function handleDragOver(e: React.DragEvent, teamId: string | null) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverTeamId(teamId)
  }
  function handleDragLeave() { setOverTeamId(undefined) }

  function handleDrop(e: React.DragEvent, teamId: string | null) {
    e.preventDefault()
    setOverTeamId(undefined)
    const uid = e.dataTransfer.getData('userId')
    setDraggingId(null)

    const user = users.find((u) => u.uid === uid)
    if (!user) return

    const newTeamId = teamId ?? undefined
    if (user.teamId === newTeamId) return

    onMoveUser(uid, newTeamId)

    const toName = teamId ? (teams.find((t) => t.id === teamId)?.name ?? teamId) : 'ไม่มีทีม'
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(`${user.displayName} → ${toName}`)
    toastTimer.current = setTimeout(() => setToast(null), 2500)
  }

  // ── Add team ─────────────────────────────────────────────────────────────
  function commitAddTeam() {
    const n = newTeamName.trim()
    if (n) { onAddTeam(n); setNewTeamName(''); setShowAddTeam(false) }
  }

  // ── Confirm delete ────────────────────────────────────────────────────────
  function handleDeleteTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId)
    if (!team) return
    if (confirm(`ลบทีม "${team.name}" ใช่ไหม?\nสมาชิกทีมจะถูกย้ายไปที่ "ไม่มีทีม"`)) {
      onDeleteTeam(teamId)
    }
  }

  return (
    <div className="relative" onDragEnd={handleDragEnd}>
      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {/* Team columns */}
        {teams.map((team, idx) => (
          <TeamColumn
            key={team.id}
            teamId={team.id}
            name={team.name}
            colorIdx={idx}
            users={users.filter((u) => u.teamId === team.id)}
            isOver={overTeamId === team.id}
            isDragging={!!draggingId}
            draggingId={draggingId}
            canManage={canManage}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onRename={onRenameTeam}
            onDelete={handleDeleteTeam}
          />
        ))}

        {/* Unassigned column */}
        <TeamColumn
          teamId={null}
          name="ไม่มีทีม"
          colorIdx={-1}
          users={unassigned}
          isOver={overTeamId === null}
          isDragging={!!draggingId}
          draggingId={draggingId}
          canManage={false}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragStart={handleDragStart}
          onRename={() => {}}
          onDelete={() => {}}
        />

        {/* Add team column (manager / super_admin) */}
        {canManage && (
          <div className="flex flex-col min-w-[200px] justify-start">
            {showAddTeam ? (
              <div className="rounded-xl border border-dashed border-freshket-300 bg-freshket-50 p-3 space-y-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="ชื่อทีม"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitAddTeam(); if (e.key === 'Escape') setShowAddTeam(false) }}
                  className="w-full rounded-lg border border-freshket-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-freshket-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={commitAddTeam}
                    disabled={!newTeamName.trim()}
                    className="flex-1 py-1.5 rounded-lg bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 disabled:opacity-50 transition-colors"
                  >
                    สร้างทีม
                  </button>
                  <button
                    onClick={() => setShowAddTeam(false)}
                    className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddTeam(true)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-400 hover:border-freshket-300 hover:text-freshket-600 hover:bg-freshket-50 transition-all"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                เพิ่มทีม
              </button>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl bg-gray-900 text-white px-4 py-2.5 shadow-xl transition-all duration-300
        ${toast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        <svg className="size-4 text-freshket-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-normal">{toast}</span>
      </div>
    </div>
  )
}
