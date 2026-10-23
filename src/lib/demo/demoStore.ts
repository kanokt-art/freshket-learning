// Demo mode reactive store.
// Holds mutable in-memory state seeded from mockData.
// Changes are persisted to localStorage and broadcast via a window Event
// so all subscribed hooks re-render across pages.

import { MOCK_USERS, MOCK_COURSES, MOCK_RESOURCES, MOCK_TEAMS, MOCK_DEPARTMENTS } from '@/lib/utils/mockData'
import type { UserProfile, Team, Department } from '@/types/user'
import type { Course, Resource } from '@/types/course'
import type { AppNotification } from '@/types/notification'

// ── Storage key & event name ──────────────────────────────────────────────────
const STORE_KEY = 'fk_demo_v2'
const EVT = 'fk-demo-change'

// ── State shape ───────────────────────────────────────────────────────────────

interface LiveState {
  users:       UserProfile[]
  courses:     Course[]
  resources:   Resource[]
  teams:       Team[]
  departments: Department[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function now() { return new Date() }
function freshDates() { return { createdAt: now(), updatedAt: now() } }

function defaultState(): LiveState {
  return {
    users:       MOCK_USERS.map(u => ({ ...u, ...freshDates() })),
    courses:     MOCK_COURSES.map(c => ({ ...c, ...freshDates() })),
    resources:   MOCK_RESOURCES.map(r => ({ ...r, ...freshDates() })),
    teams:       [...MOCK_TEAMS],
    departments: [...MOCK_DEPARTMENTS],
  }
}

// Re-parse dates lost during JSON serialisation
function safeDate(val: unknown): Date | undefined {
  if (!val) return undefined
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? undefined : d
}

function reviveUser(raw: Record<string, unknown>): UserProfile {
  return {
    ...(raw as unknown as UserProfile),
    startDate: safeDate(raw.startDate),
    createdAt: now(),
    updatedAt: now(),
  }
}

function reviveCourse(raw: Record<string, unknown>): Course {
  return {
    ...(raw as unknown as Course),
    startDate: safeDate(raw.startDate),
    endDate:   safeDate(raw.endDate),
    createdAt: now(),
    updatedAt: now(),
  }
}

function loadState(): LiveState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return defaultState()
    const s = JSON.parse(raw)
    const def = defaultState()

    // Merge any new resources from MOCK_RESOURCES not present in localStorage
    const storedResources: Resource[] = Array.isArray(s.resources)
      ? s.resources.map((r: Record<string, unknown>) => ({ ...r, ...freshDates() }))
      : def.resources
    const storedIds = new Set(storedResources.map(r => r.id))
    const newFromMock = def.resources.filter(r => !storedIds.has(r.id))

    return {
      users:       Array.isArray(s.users)       ? s.users.map(reviveUser)    : def.users,
      courses:     Array.isArray(s.courses)     ? s.courses.map(reviveCourse) : def.courses,
      resources:   [...newFromMock, ...storedResources],
      teams:       Array.isArray(s.teams)       ? s.teams                    : def.teams,
      departments: Array.isArray(s.departments) ? s.departments              : def.departments,
    }
  } catch {
    return defaultState()
  }
}

function saveState(s: LiveState) {
  if (typeof window === 'undefined') return
  const out = {
    users:       s.users.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    courses:     s.courses.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    resources:   s.resources.map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest),
    teams:       s.teams,
    departments: s.departments,
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(out))
}

// ── Module-level mutable state ────────────────────────────────────────────────

let _state: LiveState = defaultState()
let _hydrated = false

// Notifications are session-only (not persisted to localStorage)
const _notifications = new Map<string, AppNotification[]>()

function ensureHydrated() {
  if (!_hydrated && typeof window !== 'undefined') {
    _state = loadState()
    _hydrated = true
  }
}

function commit() {
  saveState(_state)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
}

// ── Public API ────────────────────────────────────────────────────────────────

export const demoStore = {
  // ── Reads ────────────────────────────────────────────────────────────────
  getUsers():       UserProfile[]  { ensureHydrated(); return _state.users },
  getCourses():     Course[]       { ensureHydrated(); return _state.courses },
  getResources():   Resource[]     { ensureHydrated(); return _state.resources },
  getTeams():       Team[]         { ensureHydrated(); return _state.teams },
  getDepartments(): Department[]   { ensureHydrated(); return _state.departments },

  subscribe(cb: () => void): () => void {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(EVT, cb)
    return () => window.removeEventListener(EVT, cb)
  },

  // ── Users ────────────────────────────────────────────────────────────────
  addUser(u: UserProfile) {
    ensureHydrated()
    _state = { ..._state, users: [u, ..._state.users] }
    commit()
  },
  updateUser(uid: string, patch: Partial<UserProfile>) {
    ensureHydrated()
    _state = { ..._state, users: _state.users.map(u => u.uid === uid ? { ...u, ...patch, updatedAt: now() } : u) }
    commit()
  },

  // ── Courses ──────────────────────────────────────────────────────────────
  addCourse(c: Course) {
    ensureHydrated()
    _state = { ..._state, courses: [c, ..._state.courses] }
    commit()
  },
  updateCourse(id: string, patch: Partial<Course>) {
    ensureHydrated()
    _state = { ..._state, courses: _state.courses.map(c => c.id === id ? { ...c, ...patch, updatedAt: now() } : c) }
    commit()
  },
  deleteCourse(id: string) {
    ensureHydrated()
    _state = { ..._state, courses: _state.courses.filter(c => c.id !== id) }
    commit()
  },

  // ── Resources ────────────────────────────────────────────────────────────
  addResource(r: Resource) {
    ensureHydrated()
    _state = { ..._state, resources: [r, ..._state.resources] }
    commit()
  },
  updateResource(id: string, patch: Partial<Resource>) {
    ensureHydrated()
    _state = { ..._state, resources: _state.resources.map(r => r.id === id ? { ...r, ...patch, updatedAt: now() } : r) }
    commit()
  },
  deleteResource(id: string) {
    ensureHydrated()
    _state = { ..._state, resources: _state.resources.filter(r => r.id !== id) }
    commit()
  },

  // ── Departments ──────────────────────────────────────────────────────────
  addDepartment(d: Department) {
    ensureHydrated()
    _state = { ..._state, departments: [..._state.departments, d] }
    commit()
  },
  updateDepartment(id: string, patch: Partial<Department>) {
    ensureHydrated()
    _state = { ..._state, departments: _state.departments.map(d => d.id === id ? { ...d, ...patch } : d) }
    commit()
  },
  deleteDepartment(id: string) {
    ensureHydrated()
    _state = {
      ..._state,
      departments: _state.departments.filter(d => d.id !== id),
      teams: _state.teams.filter(t => t.departmentId !== id),
      users: _state.users.map(u =>
        _state.teams.find(t => t.departmentId === id && t.id === u.teamId)
          ? { ...u, teamId: undefined, updatedAt: now() }
          : u
      ),
    }
    commit()
  },

  // ── Teams ────────────────────────────────────────────────────────────────
  addTeam(t: Team) {
    ensureHydrated()
    _state = { ..._state, teams: [..._state.teams, t] }
    commit()
  },
  updateTeam(id: string, patch: Partial<Team>) {
    ensureHydrated()
    _state = { ..._state, teams: _state.teams.map(t => t.id === id ? { ...t, ...patch } : t) }
    commit()
  },
  deleteTeam(id: string) {
    ensureHydrated()
    _state = {
      ..._state,
      teams: _state.teams.filter(t => t.id !== id),
      users: _state.users.map(u => u.teamId === id ? { ...u, teamId: undefined, updatedAt: now() } : u),
    }
    commit()
  },
  moveUserToTeam(uid: string, teamId: string | undefined) {
    demoStore.updateUser(uid, { teamId })
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications(uid: string): AppNotification[] {
    return (_notifications.get(uid) ?? []).slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },
  pushNotification(targetUid: string, notif: AppNotification) {
    const existing = _notifications.get(targetUid) ?? []
    _notifications.set(targetUid, [notif, ...existing])
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
  },
  markNotificationRead(uid: string, notifId: string) {
    const existing = _notifications.get(uid) ?? []
    _notifications.set(uid, existing.map(n => n.id === notifId ? { ...n, read: true } : n))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
  },
  markAllNotificationsRead(uid: string) {
    const existing = _notifications.get(uid) ?? []
    _notifications.set(uid, existing.map(n => ({ ...n, read: true })))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT))
  },

  // ── Reset ─────────────────────────────────────────────────────────────────
  reset() {
    _state = defaultState()
    _hydrated = true
    _notifications.clear()
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORE_KEY)
      window.dispatchEvent(new Event(EVT))
    }
  },
}
