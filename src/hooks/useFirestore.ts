'use client'

import { useState, useEffect, useRef } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
const DEMO_MODE = getDemoMode()

import { demoStore } from '@/lib/demo/demoStore'
import {
  MOCK_TRAINING_RECORDS,
  MOCK_ASSESSMENTS,
} from '@/lib/utils/mockData'
import type { TrainingRecord } from '@/types/tracking'
import type { Course, Resource } from '@/types/course'
import type { UserProfile, Team, Department } from '@/types/user'
import type { Assessment } from '@/types/assessment'
import type { ShadowRecord } from '@/types/shadow'
import type { RoleplayAssessment } from '@/types/roleplay'

// ── Local imported-user overlay (persists CSV-imported users in localStorage) ──
const LOCAL_IMPORT_KEY = 'fk_imported_users_v1'
const LOCAL_IMPORT_EVT = 'fk-imported-users-change'

export function getLocalImportedUsers(): UserProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_IMPORT_KEY)
    return raw ? (JSON.parse(raw) as UserProfile[]) : []
  } catch { return [] }
}

export function saveLocalImportedUsers(users: UserProfile[]): void {
  if (typeof window === 'undefined') return
  const existing = getLocalImportedUsers()
  const existingKeys = new Set([
    ...existing.map((u) => u.uid),
    ...existing.map((u) => u.email?.toLowerCase()).filter(Boolean),
    ...existing.map((u) => u.employeeId).filter(Boolean),
  ] as string[])
  const newOnes = users.filter(
    (u) =>
      !existingKeys.has(u.uid) &&
      !existingKeys.has(u.email?.toLowerCase() ?? '') &&
      !(u.employeeId && existingKeys.has(u.employeeId)),
  )
  localStorage.setItem(LOCAL_IMPORT_KEY, JSON.stringify([...existing, ...newOnes]))
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVT))
}

// ── Local team store (teams created in Firebase Live mode) ──────────────────
const LOCAL_TEAM_KEY = 'fk_local_teams_v1'
const LOCAL_TEAM_EVT = 'fk-local-teams-change'

export function getLocalTeams(): Team[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_TEAM_KEY)
    return raw ? (JSON.parse(raw) as Team[]) : []
  } catch { return [] }
}

export function saveLocalTeam(team: Team): void {
  if (typeof window === 'undefined') return
  const existing = getLocalTeams()
  const idx = existing.findIndex((t) => t.id === team.id)
  if (idx >= 0) existing[idx] = team
  else existing.push(team)
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(existing))
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
}

export function deleteLocalTeam(id: string): void {
  if (typeof window === 'undefined') return
  const filtered = getLocalTeams().filter((t) => t.id !== id)
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(filtered))
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
}

// ── Local user patches (teamId / visibleTeamIds overrides) ──────────────────
const LOCAL_PATCH_KEY = 'fk_user_patches_v1'
const LOCAL_PATCH_EVT = 'fk-user-patches-change'

type UserPatch = Partial<Pick<UserProfile, 'teamId' | 'visibleTeamIds' | 'role'>>

export function getLocalUserPatches(): Record<string, UserPatch> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LOCAL_PATCH_KEY)
    return raw ? (JSON.parse(raw) as Record<string, UserPatch>) : {}
  } catch { return {} }
}

export function applyLocalUserPatch(uid: string, patch: UserPatch): void {
  if (typeof window === 'undefined') return
  const patches = getLocalUserPatches()
  patches[uid] = { ...(patches[uid] ?? {}), ...patch }
  localStorage.setItem(LOCAL_PATCH_KEY, JSON.stringify(patches))
  window.dispatchEvent(new Event(LOCAL_PATCH_EVT))
}

// ── Shared result type ────────────────────────────────────────────────────────
interface UseResult<T> {
  data: T[]
  loading: boolean
  error: string | null
}

// ── Static demo data (read-only — no CRUD for these in demo mode) ─────────────
const NOW = new Date()

const ALL_RECORDS: TrainingRecord[] = MOCK_TRAINING_RECORDS.map((r) => ({
  ...r,
  id: `${r.userId}_${r.courseId}`,
})) as TrainingRecord[]

const ALL_ASSESSMENTS: Assessment[] = MOCK_ASSESSMENTS.map((a) => ({ ...a, createdAt: NOW, updatedAt: NOW }))

// ── Helper: subscribe a hook to demoStore changes ─────────────────────────────
function useDemoSnapshot<T>(getter: () => T[], deps: unknown[] = []): T[] {
  // Always start empty — calling getter() in the initializer creates Date objects
  // at SSR time that differ from the client's evaluation → hydration mismatch.
  const [data, setData] = useState<T[]>([])

  useEffect(() => {
    if (!DEMO_MODE) return
    setData([...getter()])
    return demoStore.subscribe(() => setData([...getter()]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return data
}

// ── Generic Firestore live hook (only runs when !DEMO_MODE) ───────────────────
interface FirestoreConstraint {
  type: 'where' | 'orderBy'
  field: string
  op?: string
  value?: unknown
  direction?: 'asc' | 'desc'
}

function useFirestoreList<T>(
  collectionPath: string,
  constraints: FirestoreConstraint[],
  enabled: boolean,
): UseResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)
  // Serialize constraints so the effect re-runs when field values (e.g. userId) change
  const constraintsKey = JSON.stringify(constraints)

  useEffect(() => {
    if (!enabled) return

    setLoading(true)

    const run = async () => {
      const [firestoreMod, { getClientFirestore }] = await Promise.all([
        import('firebase/firestore'),
        import('@/lib/firebase/client'),
      ])
      const { collection, query, where, orderBy, onSnapshot } = firestoreMod
      const db = getClientFirestore()
      const ref = collection(db, collectionPath)

      const parsed: FirestoreConstraint[] = JSON.parse(constraintsKey)
      const builtConstraints = parsed.map((c) => {
        if (c.type === 'where') return where(c.field, c.op as never, c.value)
        return orderBy(c.field, c.direction ?? 'asc')
      })

      const q = builtConstraints.length > 0 ? query(ref, ...builtConstraints) : query(ref)

      unsubRef.current = onSnapshot(
        q,
        (snap) => {
          setData(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as T[])
          setLoading(false)
        },
        (err) => {
          setError(err.message)
          setLoading(false)
        },
      )
    }

    run().catch((e) => { setError(String(e)); setLoading(false) })

    return () => { unsubRef.current?.(); unsubRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, enabled, constraintsKey])

  return { data, loading, error }
}

// ── Public hooks ──────────────────────────────────────────────────────────────

export function useMyTrainingRecords(userId: string): UseResult<TrainingRecord> {
  const [demoData, setDemoData] = useState<TrainingRecord[]>([])
  useEffect(() => {
    if (!DEMO_MODE || !userId) return
    setDemoData(ALL_RECORDS.filter((r) => r.userId === userId))
  }, [userId])

  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    [
      { type: 'where', field: 'userId', op: '==', value: userId },
      { type: 'orderBy', field: 'updatedAt', direction: 'desc' },
    ],
    !DEMO_MODE && !!userId,
  )

  return DEMO_MODE ? { data: demoData, loading: false, error: null } : fbResult
}

export function useTeamTrainingRecords(teamId: string): UseResult<TrainingRecord> {
  const [demoData, setDemoData] = useState<TrainingRecord[]>([])
  useEffect(() => {
    if (!DEMO_MODE || !teamId) return
    const teamUids = demoStore.getUsers().filter((u) => u.teamId === teamId).map((u) => u.uid)
    setDemoData(ALL_RECORDS.filter((r) => teamUids.includes(r.userId)))
  }, [teamId])

  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    [
      { type: 'where', field: 'teamId', op: '==', value: teamId },
      { type: 'orderBy', field: 'updatedAt', direction: 'desc' },
    ],
    !DEMO_MODE && !!teamId,
  )

  return DEMO_MODE ? { data: demoData, loading: false, error: null } : fbResult
}

export function useAllTrainingRecords(): UseResult<TrainingRecord> {
  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    [{ type: 'orderBy', field: 'updatedAt', direction: 'desc' }],
    !DEMO_MODE,
  )

  return DEMO_MODE ? { data: ALL_RECORDS, loading: false, error: null } : fbResult
}

export function useCourses(): UseResult<Course> {
  const demoData = useDemoSnapshot(() => demoStore.getCourses())

  const fbResult = useFirestoreList<Course>(
    'courses',
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }],
    !DEMO_MODE,
  )

  return DEMO_MODE ? { data: demoData, loading: false, error: null } : fbResult
}

export function useCourse(id: string): { data: Course | null; loading: boolean; error: string | null } {
  const [demoData, setDemoData] = useState<Course | null>(null)

  useEffect(() => {
    if (!DEMO_MODE) return
    setDemoData(demoStore.getCourses().find((c) => c.id === id) ?? null)
    return demoStore.subscribe(() =>
      setDemoData(demoStore.getCourses().find((c) => c.id === id) ?? null)
    )
  }, [id])

  const fbResult = useDocument<Course>('courses', id)
  return DEMO_MODE ? { data: demoData, loading: false, error: null } : fbResult
}

export function useResources(category?: string): UseResult<Resource> {
  const [demoData, setDemoData] = useState<Resource[]>([])

  useEffect(() => {
    if (!DEMO_MODE) return
    const update = () => {
      const all = demoStore.getResources()
      setDemoData(category ? all.filter((r) => r.category === category) : [...all])
    }
    update()
    return demoStore.subscribe(update)
  }, [category])

  const fbResult = useFirestoreList<Resource>(
    'resources',
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }],
    !DEMO_MODE,
  )

  return DEMO_MODE ? { data: demoData, loading: false, error: null } : fbResult
}

export function useAssessments(): UseResult<Assessment> {
  const fbResult = useFirestoreList<Assessment>(
    'assessments',
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }],
    !DEMO_MODE,
  )
  return DEMO_MODE ? { data: ALL_ASSESSMENTS, loading: false, error: null } : fbResult
}

export function useAssessment(id: string): { data: Assessment | null; loading: boolean; error: string | null } {
  const fbResult = useDocument<Assessment>('assessments', id)
  if (DEMO_MODE) {
    const found = ALL_ASSESSMENTS.find((a) => a.id === id) ?? null
    return { data: found, loading: false, error: null }
  }
  return fbResult
}

export function useAllUsers(): UseResult<UserProfile> {
  const demoData = useDemoSnapshot(() => demoStore.getUsers())

  const [localOverlay, setLocalOverlay] = useState<UserProfile[]>([])
  const [patches, setPatches] = useState<Record<string, UserPatch>>({})
  useEffect(() => {
    if (DEMO_MODE) return
    setLocalOverlay(getLocalImportedUsers())
    setPatches(getLocalUserPatches())
    const handleOverlay = () => setLocalOverlay(getLocalImportedUsers())
    const handlePatch = () => setPatches(getLocalUserPatches())
    window.addEventListener(LOCAL_IMPORT_EVT, handleOverlay)
    window.addEventListener(LOCAL_PATCH_EVT, handlePatch)
    return () => {
      window.removeEventListener(LOCAL_IMPORT_EVT, handleOverlay)
      window.removeEventListener(LOCAL_PATCH_EVT, handlePatch)
    }
  }, [])

  const fbResult = useFirestoreList<UserProfile>(
    'users',
    [{ type: 'orderBy', field: 'displayName', direction: 'asc' }],
    !DEMO_MODE,
  )

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }

  const applyPatch = (u: UserProfile): UserProfile =>
    patches[u.uid] ? { ...u, ...patches[u.uid] } : u

  const patchedFb = fbResult.data.map(applyPatch)
  const fbKeys = new Set<string>()
  for (const u of patchedFb) {
    if (u.uid) fbKeys.add(u.uid)
    if (u.email) fbKeys.add(u.email.toLowerCase())
    if (u.employeeId) fbKeys.add(u.employeeId)
  }
  const uniqueLocal = localOverlay
    .map(applyPatch)
    .filter(
      (u) =>
        !fbKeys.has(u.uid) &&
        !fbKeys.has(u.email?.toLowerCase() ?? '') &&
        !(u.employeeId && fbKeys.has(u.employeeId)),
    )
  return { ...fbResult, data: [...patchedFb, ...uniqueLocal] }
}

export function useTeams(): UseResult<Team> {
  const demoData = useDemoSnapshot(() => demoStore.getTeams())

  const [localTeams, setLocalTeams] = useState<Team[]>([])
  useEffect(() => {
    if (DEMO_MODE) return
    setLocalTeams(getLocalTeams())
    const handler = () => setLocalTeams(getLocalTeams())
    window.addEventListener(LOCAL_TEAM_EVT, handler)
    return () => window.removeEventListener(LOCAL_TEAM_EVT, handler)
  }, [])

  const fbResult = useFirestoreList<Team>('teams', [], !DEMO_MODE)

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }

  const fbIds = new Set(fbResult.data.map((t) => t.id))
  const uniqueLocal = localTeams.filter((t) => !fbIds.has(t.id))
  return { ...fbResult, data: [...fbResult.data, ...uniqueLocal] }
}

export function useDepartments(): UseResult<Department> {
  const demoData = useDemoSnapshot(() => demoStore.getDepartments())
  return DEMO_MODE
    ? { data: demoData, loading: false, error: null }
    : { data: [], loading: false, error: null }
}

export function useDocument<T>(collectionPath: string, docId: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!DEMO_MODE && !!docId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (DEMO_MODE || !docId) return
    let unsub: (() => void) | undefined

    const run = async () => {
      const [{ doc: docFn, onSnapshot }, { getClientFirestore }] = await Promise.all([
        import('firebase/firestore'),
        import('@/lib/firebase/client'),
      ])
      const ref = docFn(getClientFirestore(), collectionPath, docId)
      unsub = onSnapshot(
        ref,
        (snap) => { setData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null); setLoading(false) },
        (err) => { setError(err.message); setLoading(false) },
      )
    }

    run().catch((e) => { setError(String(e)); setLoading(false) })
    return () => unsub?.()
  }, [collectionPath, docId])

  return { data, loading, error }
}

// ── Shadow records by user ────────────────────────────────────────────────────
export function useShadowRecordsByUser(uid: string | undefined): UseResult<ShadowRecord> {
  const result = useFirestoreList<ShadowRecord>(
    'shadowRecords',
    uid
      ? [
          { type: 'where', field: 'observerUid', op: '==', value: uid },
          { type: 'orderBy', field: 'createdAt', direction: 'desc' },
        ]
      : [],
    !DEMO_MODE && !!uid,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
}

// ── Roleplay assessments by subject user ──────────────────────────────────────
export function useRoleplayAssessmentsByUser(uid: string | undefined): UseResult<RoleplayAssessment> {
  const result = useFirestoreList<RoleplayAssessment>(
    'roleplayAssessments',
    uid
      ? [
          { type: 'where', field: 'subjectUid', op: '==', value: uid },
          { type: 'orderBy', field: 'createdAt', direction: 'desc' },
        ]
      : [],
    !DEMO_MODE && !!uid,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
}
