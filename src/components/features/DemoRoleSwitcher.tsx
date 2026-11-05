'use client'

import { formatPersonName } from '@/lib/users/displayName'
import { isActiveEmployee } from '@/lib/users/active'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { isDepartmentHead } from '@/lib/users/departmentHead'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers } from '@/hooks/useFirestore'
import { getDemoMode, toggleDemoMode, DEMO_MODE_ALLOWED } from '@/lib/demo/demoMode'
import { ROLE_LABELS, ROLE_HIERARCHY, type UserRole, type UserProfile } from '@/types/user'
import { MOCK_USERS } from '@/lib/utils/mockData'

const ROLES: {
  role: UserRole
  href: string
  activeClass: string
  hoverClass: string
  dotClass: string
  labelClass: string
  ringClass: string
}[] = [
  {
    role: 'sale',
    href: '/sale',
    activeClass: 'bg-freshket-500 text-white shadow-sm',
    hoverClass: 'hover:bg-freshket-50 hover:text-freshket-700',
    dotClass: 'bg-freshket-500',
    labelClass: 'text-freshket-600',
    ringClass: 'ring-freshket-200',
  },
  {
    role: 'team_lead',
    href: '/team-lead',
    activeClass: 'bg-blue-500 text-white shadow-sm',
    hoverClass: 'hover:bg-blue-50 hover:text-blue-700',
    dotClass: 'bg-blue-500',
    labelClass: 'text-blue-600',
    ringClass: 'ring-blue-200',
  },
  {
    role: 'manager',
    href: '/manager',
    activeClass: 'bg-purple-500 text-white shadow-sm',
    hoverClass: 'hover:bg-purple-50 hover:text-purple-700',
    dotClass: 'bg-purple-500',
    labelClass: 'text-purple-600',
    ringClass: 'ring-purple-200',
  },
  {
    role: 'super_admin',
    href: '/users',
    activeClass: 'bg-orange-500 text-white shadow-sm',
    hoverClass: 'hover:bg-orange-50 hover:text-orange-700',
    dotClass: 'bg-orange-500',
    labelClass: 'text-orange-600',
    ringClass: 'ring-orange-200',
  },
]

// Roles that support user-picking (super_admin has only one user so no picker)
const PICKABLE_ROLES: UserRole[] = ['sale', 'team_lead', 'manager']

const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.role, r])) as Record<UserRole, typeof ROLES[0]>

// "Head of" is not an app role: it is whoever is Head of Department / VP or above (JG11+) in the
// rollout. It gets its own picker so the admin can see what a department head sees.
type PickerKey = UserRole | 'head'
const PICKERS: PickerKey[] = ['sale', 'team_lead', 'manager', 'head']
const HEAD_STYLE = {
  activeClass: 'bg-indigo-500 text-white shadow-sm',
  hoverClass: 'hover:bg-indigo-50 hover:text-indigo-700',
  dotClass: 'bg-indigo-500',
}

const SWITCHER_KEY = 'fk_role_switcher'

// Where the bar sits, if it has been dragged (top-left, px); null = the default spot, bottom centre.
type Pos = { x: number; y: number } | null

function clampTo(pos: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - w)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, window.innerHeight - h)),
  }
}

export function DemoRoleSwitcher() {
  const router = useRouter()
  const { user, demoRole, setDemoUser, realRole } = useAuth()
  const isDemoMode = getDemoMode()
  const [openDropdown, setOpenDropdown] = useState<UserRole | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // The bar can be folded down to a small pill and dragged anywhere; both are remembered.
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [pos, setPos] = useState<Pos>(null)
  // The latest position, for the pointer-up that saves it (the state from the render before it can be a step behind).
  const posRef = useRef<Pos>(null)
  const [dragging, setDragging] = useState(false)
  // True once what was remembered has been read, so the keep-on-screen check measures the bar as it will be shown.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SWITCHER_KEY)
      if (!raw) return
      const v = JSON.parse(raw) as { collapsed?: boolean; pos?: Pos }
      if (typeof v.collapsed === 'boolean') setCollapsed(v.collapsed)
      if (v.pos && Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y)) { posRef.current = v.pos; setPos(v.pos) }
    } catch { /* nothing remembered, or storage blocked */ }
    setReady(true)
  }, [])
  function remember(next: { collapsed: boolean; pos: Pos }) {
    try { localStorage.setItem(SWITCHER_KEY, JSON.stringify(next)) } catch { /* the bar just opens in its default place next time */ }
  }
  // Folding or a smaller window changes the bar's size: keep it on screen. (Measured here, after the render
  // that changed the size, never inside a state updater, which would measure the bar as it was.)
  useEffect(() => {
    if (!ready) return
    function keepOnScreen() {
      const el = wrapRef.current
      const cur = posRef.current
      if (!el || !cur) return
      const r = el.getBoundingClientRect()
      const next = clampTo(cur, r.width, r.height)
      if (next.x === cur.x && next.y === cur.y) return
      posRef.current = next
      setPos(next)
    }
    keepOnScreen()
    window.addEventListener('resize', keepOnScreen)
    return () => window.removeEventListener('resize', keepOnScreen)
  }, [collapsed, ready])

  function onGripDown(e: React.PointerEvent<HTMLElement>) {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setOpenDropdown(null)
  }
  function onGripMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current
    const el = wrapRef.current
    if (!d || !el) return
    const r = el.getBoundingClientRect()
    const next = clampTo({ x: e.clientX - d.dx, y: e.clientY - d.dy }, r.width, r.height)
    posRef.current = next
    setPos(next)
  }
  function onGripUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    remember({ collapsed, pos: posRef.current })
  }
  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    setOpenDropdown(null)
    remember({ collapsed: next, pos: posRef.current })
  }
  // Near the top of the screen the dropdowns open downward instead of up.
  const flip = pos !== null && pos.y < 340

  // Per-role: track which user is currently "displayed" in each role pill.
  // Initialise to the first user of each role.
  const [pickerUser, setPickerUser] = useState<Record<UserRole, string>>(() => {
    const map: Partial<Record<UserRole, string>> = {}
    for (const r of ROLES) {
      const u = MOCK_USERS.find(m => m.role === r.role)
      if (u) map[r.role] = u.uid
    }
    return map as Record<UserRole, string>
  })

  // Keep pickerUser in sync when the active user changes externally
  useEffect(() => {
    if (user) {
      setPickerUser(prev => ({ ...prev, [user.role]: user.uid }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [openDropdown])

  // In production Firebase mode, only real super_admins get the switcher (for
  // previewing other roles' UI). Everyone else sees nothing.
  if (process.env.NODE_ENV === 'production' && !isDemoMode && realRole !== 'super_admin') return null

  function handleSelectUser(uid: string, roleHref: string) {
    setDemoUser(uid)
    setPickerUser(prev => {
      const u = MOCK_USERS.find(m => m.uid === uid)
      if (!u) return prev
      return { ...prev, [u.role]: uid }
    })
    setOpenDropdown(null)
    router.push(roleHref)
  }

  function handleSelectRole(r: typeof ROLES[0]) {
    const uid = pickerUser[r.role]
    setDemoUser(uid)
    router.push(r.href)
  }

  return (
    <div
      ref={wrapRef}
      className={`fixed z-50 pointer-events-none ${pos ? '' : 'bottom-5 left-1/2 -translate-x-1/2'}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div
        ref={containerRef}
        className={`pointer-events-auto flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-xl ${collapsed ? 'rounded-full p-1.5' : 'rounded-2xl px-3 py-2'}`}
      >
        {/* ── Drag handle + fold button, on the left ─────────────────────── */}
        <button
          type="button"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          aria-label="ลากเพื่อย้าย"
          title="ลากเพื่อย้าย"
          className={`touch-none flex items-center justify-center px-1 py-1.5 -ml-1 rounded-lg text-gray-300 hover:text-gray-500 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ขยายแถบสลับ role' : 'ย่อแถบสลับ role'}
          title={collapsed ? 'ขยายแถบสลับ role' : 'ย่อแถบสลับ role'}
          className="flex items-center gap-1.5 size-7 justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
        >
          {collapsed ? (
            <span className="relative flex items-center justify-center">
              <span className={`absolute -top-1.5 -right-1.5 size-2 rounded-full ${isDemoMode ? 'bg-amber-400' : 'bg-freshket-500'}`} />
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </span>
          ) : (
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
          )}
        </button>

        {!collapsed && (<>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        {/* ── Demo mode toggle: development only (a deployed build never runs demo mode) ───── */}
        {DEMO_MODE_ALLOWED && (<button
          type="button"
          onClick={toggleDemoMode}
          title={isDemoMode ? 'ปิด Demo Mode → ใช้ Firebase จริง' : 'เปิด Demo Mode → ใช้ Mock Data'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            isDemoMode
              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}
        >
          <span className="relative flex size-2 shrink-0">
            {isDemoMode && <span className="animate-ping absolute inline-flex size-full rounded-full bg-amber-400 opacity-75" />}
            <span className={`relative inline-flex size-2 rounded-full ${isDemoMode ? 'bg-amber-500' : 'bg-gray-300'}`} />
          </span>
          Demo
          <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ${isDemoMode ? 'bg-amber-400' : 'bg-gray-200'}`}>
            <span className={`inline-block size-3 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${isDemoMode ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </span>
        </button>)}

        {/* ── Demo mode: role cards ─────────────────────────────────────────── */}
        {isDemoMode && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            {ROLES.map((r) => {
              const isActive = demoRole === r.role
              const usersForRole = MOCK_USERS.filter(u => u.role === r.role)
              const hasPicker = PICKABLE_ROLES.includes(r.role) && usersForRole.length > 1
              const isDropOpen = openDropdown === r.role
              const displayUser = MOCK_USERS.find(u => u.uid === pickerUser[r.role])

              return (
                <div key={r.role} className="relative">
                  <div
                    className={`flex items-center rounded-xl overflow-hidden transition-all duration-150 ${
                      isActive ? r.activeClass : `border border-gray-100 ${r.hoverClass}`
                    }`}
                  >
                    {/* Role name + user avatar */}
                    <button
                      type="button"
                      onClick={() => handleSelectRole(r)}
                      className={`flex items-center gap-1.5 pl-2.5 py-1.5 text-xs font-bold transition-all duration-150 ${
                        isActive ? 'text-white pr-1.5' : `text-gray-500 pr-2.5 rounded-xl`
                      }`}
                    >
                      {/* Dot indicator */}
                      <span className={`size-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/60' : r.dotClass}`} />

                      {/* Role label */}
                      <span>{ROLE_LABELS[r.role]}</span>

                      {/* Current user avatar + name (show always) */}
                      {displayUser && (
                        <>
                          <span className={`${isActive ? 'text-white/50' : 'text-gray-300'}`}>·</span>
                          <span
                            className={`size-4 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isActive ? 'bg-white/25 text-white' : `bg-gray-100 ${r.labelClass}`
                            }`}
                          >
                            {(displayUser.nickname ?? displayUser.displayName).charAt(0)}
                          </span>
                          <span className={`text-xs max-w-[56px] truncate leading-none ${
                            isActive ? 'text-white/90' : 'text-gray-500'
                          }`}>
                            {displayUser.nickname ?? displayUser.displayName.split(' ')[0]}
                          </span>
                        </>
                      )}
                    </button>

                    {/* User picker chevron — always visible for pickable roles */}
                    {hasPicker && (
                      <button
                        type="button"
                        onClick={() => setOpenDropdown(isDropOpen ? null : r.role)}
                        className={`flex items-center pr-2 py-1.5 transition-colors ${
                          isActive ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        <svg
                          className={`size-3 transition-transform duration-150 ${isDropOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* User dropdown — opens above the bar */}
                  {isDropOpen && (
                    <div
                      className={`absolute ${flip ? 'top-[calc(100%+10px)]' : 'bottom-[calc(100%+10px)]'} left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden min-w-52`}
                      style={{ animation: 'dropUp 0.14s ease-out' }}
                    >
                      <style>{`@keyframes dropUp { from { opacity:0; transform:translateX(-50%) translateY(8px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>

                      <div className="px-3 pt-3 pb-1">
                        <p className="text-xs font-bold text-gray-400">
                          {ROLE_LABELS[r.role]}
                        </p>
                      </div>

                      <div className="py-1">
                        {usersForRole.map(u => {
                          const isSelected = user?.uid === u.uid
                          return (
                            <button
                              key={u.uid}
                              type="button"
                              onClick={() => handleSelectUser(u.uid, r.href)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                                isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              {/* Avatar */}
                              <div
                                className={`size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isSelected ? r.activeClass : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {u.nickname?.charAt(0) ?? u.displayName.charAt(0)}
                              </div>

                              {/* Name */}
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs font-bold leading-tight truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                  {u.displayName}
                                </p>
                                {(u.nickname || u.position) && (
                                  <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">
                                    {u.nickname ? `${u.nickname}` : ''}{u.nickname && u.position ? ' · ' : ''}{u.position ?? ''}
                                  </p>
                                )}
                              </div>

                              {/* Check mark */}
                              {isSelected && (
                                <svg className="size-3.5 shrink-0 text-freshket-500" viewBox="0 0 24 24" fill="currentColor">
                                  <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── Firebase live mode ────────────────────────────────────────────── */}
        {!isDemoMode && (
          <>
            <div className="w-px h-5 bg-gray-200 mx-1" />
            <span className="flex items-center gap-1.5 text-xs text-freshket-600 font-bold px-1">
              <span className="relative flex size-2 shrink-0">
                <span className="animate-ping absolute inline-flex size-full rounded-full bg-freshket-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-freshket-500" />
              </span>
              Firebase Live
            </span>

            {/* Super-admin only: impersonate a specific real user (UI-only) */}
            {realRole === 'super_admin' && (
              <>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <LiveImpersonator flip={flip} />
              </>
            )}
          </>
        )}
        </>)}
      </div>
    </div>
  )
}

// ── Firebase-live user impersonation (super_admin only) ────────────────────────
// Rendered only for real super_admins, so useAllUsers() never subscribes for
// anyone else. Lets the admin render the app as any real user to verify that the
// back-end logic (module access per department, team visibility, etc.) lines up.
function LiveImpersonator({ flip }: { flip: boolean }) {
  const router = useRouter()
  const { userOverride, setUserOverride } = useAuth()
  const { data: allUsers } = useAllUsers()
  const [open, setOpen] = useState<PickerKey | null>(null)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Group real users by the role they hold, once. Only people still employed (someone who has
  // resigned keeps their role on file but is not someone to view the app as) and only in the
  // departments of the current rollout, like every other people list.
  // Sorted by the name as it is shown (Firstname (Nickname) Lastname, in English).
  const usersByRole = useMemo(() => {
    const map: Record<string, UserProfile[]> = {}
    for (const u of allUsers) {
      if (isActiveEmployee(u) && !!u.department && PHASE1_DEPARTMENTS.has(u.department)) (map[u.role] ??= []).push(u)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => formatPersonName(a).localeCompare(formatPersonName(b)))
    }
    return map
  }, [allUsers])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(null); setQuery('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // The people the Head of picker offers: active heads of a rollout department.
  const heads = useMemo(
    () => allUsers
      .filter((u) => isActiveEmployee(u) && isDepartmentHead(u))
      .sort((a, b) => formatPersonName(a).localeCompare(formatPersonName(b))),
    [allUsers],
  )

  function pick(u: UserProfile, asHead = false) {
    // A head oversees their department's teams, which lives on the manager pages — so they are
    // shown at manager level at least, even if the account's stored role is lower.
    const shown = asHead && ROLE_HIERARCHY[u.role] < ROLE_HIERARCHY.manager ? { ...u, role: 'manager' as UserRole } : u
    setUserOverride(shown)
    setOpen(null)
    setQuery('')
    router.push(asHead ? '/manager' : (ROLE_BY_ID[u.role]?.href ?? '/sale'))
  }

  function reset() {
    setUserOverride(null)
    setOpen(null)
    router.push('/users')
  }

  return (
    <div ref={ref} className="flex items-center gap-1">
      {PICKERS.map((role) => {
        const isHead = role === 'head'
        const r = isHead ? { ...ROLE_BY_ID.manager, ...HEAD_STYLE } : ROLE_BY_ID[role]
        const label = isHead ? 'Head of' : ROLE_LABELS[role]
        const overrideIsHead = !!userOverride && isDepartmentHead(userOverride)
        // Someone who is a head shows under Head of, not also under their stored role.
        const isActive = isHead ? overrideIsHead : userOverride?.role === role && !overrideIsHead
        const isOpen = open === role
        const pool = isHead ? heads : (usersByRole[role] ?? [])
        const q = query.trim().toLowerCase()
        const filtered = q
          ? pool.filter((u) =>
              formatPersonName(u).toLowerCase().includes(q) ||
              (u.displayName ?? '').toLowerCase().includes(q) ||
              (u.nickname ?? '').toLowerCase().includes(q) ||
              (u.department ?? '').toLowerCase().includes(q))
          : pool

        return (
          <div key={role} className="relative">
            <button
              type="button"
              onClick={() => { setOpen(isOpen ? null : role); setQuery('') }}
              title={isHead ? 'สวมเป็น Head of Department / VP คนใดคนหนึ่ง (ดูว่าเห็นอะไร)' : `สวมเป็น ${label} คนใดคนหนึ่ง`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isActive ? r.activeClass : `border border-gray-100 text-gray-500 ${r.hoverClass}`
              }`}
            >
              <span className={`size-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/60' : r.dotClass}`} />
              {label}
              {isActive && userOverride && (
                <>
                  <span className="text-white/50">·</span>
                  <span className="max-w-[64px] truncate text-white/90">
                    {userOverride.nickname ?? userOverride.displayName?.split(' ')[0]}
                  </span>
                </>
              )}
              <svg className={`size-3 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''} ${isActive ? 'text-white/70' : 'text-gray-400'}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {isOpen && (
              <div
                className={`absolute ${flip ? 'top-[calc(100%+10px)]' : 'bottom-[calc(100%+10px)]'} left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden w-64`}
                style={{ animation: 'dropUp 0.14s ease-out' }}
              >
                <style>{`@keyframes dropUp { from { opacity:0; transform:translateX(-50%) translateY(8px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }`}</style>

                <div className="px-3 pt-3 pb-2 border-b border-gray-50">
                  <p className="text-xs font-bold text-gray-400 mb-2">{label} · {pool.length} คน</p>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ชื่อ หรือ แผนก"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-200 placeholder:text-gray-300"
                  />
                </div>

                <div className="py-1 max-h-64 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-gray-400 text-center">{isHead && pool.length === 0 ? 'ยังไม่มี Head / VP ที่ Active ในแผนก target' : 'ไม่พบผู้ใช้'}</p>
                  ) : (
                    filtered.map((u) => {
                      const selected = userOverride?.uid === u.uid
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => pick(u, isHead)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                        >
                          <div className={`size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${selected ? r.activeClass : 'bg-gray-100 text-gray-500'}`}>
                            {u.photoURL
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={u.photoURL} alt={formatPersonName(u)} className="size-full object-cover" />
                              : (formatPersonName(u).charAt(0) || '?')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-bold leading-tight truncate ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{formatPersonName(u)}</p>
                            <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">{u.department ?? 'ไม่ระบุแผนก'}</p>
                          </div>
                          {selected && (
                            <svg className="size-3.5 shrink-0 text-freshket-500" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Super Admin — back to the real account */}
      <button
        type="button"
        onClick={reset}
        title="กลับเป็น Super Admin (ตัวจริง)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
          !userOverride ? ROLE_BY_ID.super_admin.activeClass : `border border-gray-100 text-gray-500 ${ROLE_BY_ID.super_admin.hoverClass}`
        }`}
      >
        <span className={`size-1.5 rounded-full shrink-0 ${!userOverride ? 'bg-white/60' : ROLE_BY_ID.super_admin.dotClass}`} />
        {ROLE_LABELS.super_admin}
      </button>

      {userOverride && (
        <button type="button" onClick={reset} className="text-xs font-bold text-gray-400 hover:text-gray-600 px-2 py-1.5">
          รีเซ็ต
        </button>
      )}
    </div>
  )
}
