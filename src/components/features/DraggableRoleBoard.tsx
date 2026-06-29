'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import type { AppUser, UserRole } from '@/types/user'
import { ROLE_LABELS } from '@/types/user'

interface DraggableRoleBoardProps {
  users: AppUser[]
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>
}

const COLUMNS: { role: UserRole; color: string; bg: string; border: string; dot: string; viewHref?: string }[] = [
  {
    role: 'sale',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-400',
    viewHref: '/sale',
  },
  {
    role: 'team_lead',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-400',
    viewHref: '/team-lead',
  },
  {
    role: 'manager',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    dot: 'bg-purple-400',
    viewHref: '/manager',
  },
  {
    role: 'super_admin',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    dot: 'bg-orange-400',
  },
]

function UserCard({
  user,
  onDragStart,
  isDragging,
}: {
  user: AppUser
  onDragStart: (e: React.DragEvent, uid: string) => void
  isDragging: boolean
}) {
  const initials = user.displayName
    .split(' ')
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const avatarColors = [
    'bg-brand-green text-white',
    'bg-blue-500 text-white',
    'bg-purple-500 text-white',
    'bg-orange-500 text-white',
    'bg-pink-500 text-white',
    'bg-teal-500 text-white',
  ]
  const colorIndex = user.uid.charCodeAt(user.uid.length - 1) % avatarColors.length

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, user.uid)}
      className={clsx(
        'group flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:shadow-md hover:border-brand-green-100 transition-all select-none',
        isDragging && 'opacity-40 scale-95',
      )}
    >
      {/* Drag handle */}
      <div className="shrink-0 text-gray-300 group-hover:text-gray-400 transition-colors">
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </div>

      {/* Avatar */}
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt={user.displayName}
          className="size-8 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className={clsx(
            'size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            avatarColors[colorIndex],
          )}
        >
          {initials}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-normal text-brand-dark truncate">{user.displayName}</p>
        <p className="text-xs text-brand-muted truncate">{user.email.split('@')[0]}</p>
      </div>
    </div>
  )
}

function DropColumn({
  col,
  users,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  draggingId,
  updatingId,
}: {
  col: (typeof COLUMNS)[number]
  users: AppUser[]
  isOver: boolean
  onDragOver: (e: React.DragEvent, role: UserRole) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, role: UserRole) => void
  onDragStart: (e: React.DragEvent, uid: string) => void
  draggingId: string | null
  updatingId: string | null
}) {
  return (
    <div className="flex flex-col min-w-0 flex-1">
      {/* Column header */}
      <div
        className={clsx(
          'flex items-center gap-2 rounded-t-xl border-x border-t px-4 py-3',
          col.bg,
          col.border,
        )}
      >
        <span className={clsx('size-2 rounded-full shrink-0', col.dot)} />
        <span className={clsx('text-sm font-bold', col.color)}>{ROLE_LABELS[col.role]}</span>
        <span
          className={clsx(
            'ml-auto inline-flex size-5 items-center justify-center rounded-full text-xs font-bold',
            col.bg,
            col.color,
          )}
        >
          {users.length}
        </span>
        {col.viewHref && (
          <Link
            href={col.viewHref}
            target="_blank"
            title={`View ${ROLE_LABELS[col.role]} page`}
            className={clsx(
              'ml-1 inline-flex items-center gap-0.5 text-xs font-normal px-2 py-0.5 rounded-lg border transition-colors hover:opacity-80',
              col.color, col.border, 'bg-white/60',
            )}
          >
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            View
          </Link>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => onDragOver(e, col.role)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, col.role)}
        className={clsx(
          'flex flex-col gap-2 rounded-b-xl border-x border-b p-3 min-h-[200px] transition-all',
          col.border,
          isOver
            ? `${col.bg} ring-2 ring-inset ring-offset-0 ${col.border.replace('border-', 'ring-')}`
            : 'bg-gray-50',
        )}
      >
        {users.map((u) => (
          <div key={u.uid} className="relative">
            <UserCard
              user={u}
              onDragStart={onDragStart}
              isDragging={draggingId === u.uid}
            />
            {updatingId === u.uid && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80">
                <span className="size-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        ))}

        {users.length === 0 && (
          <div
            className={clsx(
              'flex flex-1 items-center justify-center rounded-lg border-2 border-dashed text-xs transition-colors',
              isOver ? col.border : 'border-gray-200',
              isOver ? col.color : 'text-gray-300',
            )}
          >
            วางที่นี่
          </div>
        )}
      </div>
    </div>
  )
}

export function DraggableRoleBoard({ users, onRoleChange }: DraggableRoleBoardProps) {
  const [localUsers, setLocalUsers] = useState<AppUser[]>(users)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overRole, setOverRole] = useState<UserRole | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ name: string; role: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when parent users change (e.g., after refetch)
  const prevUsers = useRef<AppUser[]>([])
  if (prevUsers.current !== users && users.length > 0) {
    prevUsers.current = users
    setLocalUsers(users)
  }

  function handleDragStart(e: React.DragEvent, uid: string) {
    e.dataTransfer.setData('userId', uid)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(uid)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setOverRole(null)
  }

  function handleDragOver(e: React.DragEvent, role: UserRole) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverRole(role)
  }

  function handleDragLeave() {
    setOverRole(null)
  }

  async function handleDrop(e: React.DragEvent, newRole: UserRole) {
    e.preventDefault()
    setOverRole(null)
    const uid = e.dataTransfer.getData('userId')
    setDraggingId(null)

    const user = localUsers.find((u) => u.uid === uid)
    if (!user || user.role === newRole) return

    // Optimistic update
    setLocalUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, role: newRole } : u)),
    )
    setUpdatingId(uid)

    try {
      await onRoleChange(uid, newRole)

      if (toastTimer.current) clearTimeout(toastTimer.current)
      setToast({ name: user.displayName, role: ROLE_LABELS[newRole] })
      toastTimer.current = setTimeout(() => setToast(null), 3000)
    } catch {
      // Rollback on error
      setLocalUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role: user.role } : u)),
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const byRole = (role: UserRole) => localUsers.filter((u) => u.role === role)

  return (
    <div className="relative" onDragEnd={handleDragEnd}>
      {/* Board */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <DropColumn
            key={col.role}
            col={col}
            users={byRole(col.role)}
            isOver={overRole === col.role}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            draggingId={draggingId}
            updatingId={updatingId}
          />
        ))}
      </div>

      {/* Toast notification */}
      <div
        className={clsx(
          'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-brand-dark text-white px-4 py-3 shadow-xl transition-all duration-300',
          toast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none',
        )}
      >
        <svg className="size-4 text-brand-green shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
        <span className="text-sm">
          <span className="font-bold">{toast?.name}</span> เปลี่ยนเป็น{' '}
          <span className="font-bold text-brand-green">{toast?.role}</span> แล้ว
        </span>
      </div>
    </div>
  )
}
