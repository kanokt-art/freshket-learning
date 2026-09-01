'use client'

import { useState, useEffect, useMemo } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'

const DEMO_MODE = getDemoMode()
import {
  MOCK_TRAINING_RECORDS,
  MOCK_ASSESSMENTS,
} from '@/lib/utils/mockData'
import type { TrainingRecord } from '@/types/tracking'
import type { Course } from '@/types/course'
import type { UserProfile, Team, Department } from '@/types/user'
import type { Assessment } from '@/types/assessment'
import type { ShadowRecord, ShadowAcknowledgment } from '@/types/shadow'
import type { RoleplayAssessment } from '@/types/roleplay'
import type { Announcement } from '@/types/announcement'
import { SEED_TOOLS, type SaleTool } from '@/lib/tools'
import type { AssessmentScore } from '@/types/assessmentScore'
import { computeUserStats, type UserStats } from '@/types/stats'

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

  // Upsert: update existing records matched by email or employeeId, insert new ones
  const byEmail = new Map<string, UserProfile>(existing.map(u => [u.email?.toLowerCase() ?? '', u]))
  const byEmpId = new Map<string, UserProfile>(existing.filter(u => u.employeeId).map(u => [u.employeeId!, u]))
  const result = [...existing]
  const toWrite: UserProfile[] = []

  for (const u of users) {
    const emailKey = u.email?.toLowerCase() ?? ''
    const existingByEmail = emailKey ? byEmail.get(emailKey) : undefined
    const existingByEmpId = u.employeeId ? byEmpId.get(u.employeeId) : undefined
    const match = existingByEmail ?? existingByEmpId

    if (match) {
      const idx = result.findIndex(r => r.uid === match.uid)
      if (idx >= 0) {
        const updated: UserProfile = {
          ...match,
          displayName:   u.displayName   || match.displayName,
          displayNameEN: u.displayNameEN ?? match.displayNameEN,
          nickname:      u.nickname      ?? match.nickname,
          department:    u.department    ?? match.department,
          position:      u.position      ?? match.position,
          rank:          u.rank          ?? match.rank,
          lineManager:   u.lineManager   ?? match.lineManager,
          startDate:     u.startDate     ?? match.startDate,
          employeeId:    u.employeeId    ?? match.employeeId,
          employmentStatus: u.employmentStatus ?? match.employmentStatus,
          updatedAt:     new Date(),
        }
        result[idx] = updated
        toWrite.push(updated)
      }
    } else {
      result.push(u)
      toWrite.push(u)
    }
  }

  localStorage.setItem(LOCAL_IMPORT_KEY, JSON.stringify(result))
  window.dispatchEvent(new Event(LOCAL_IMPORT_EVT))

  // Batch-write to Firestore (upsert: overwrite csv docs with latest data)
  if (!DEMO_MODE && toWrite.length > 0) {
    import('@/lib/firebase/client').then(({ getClientFirestore, writeBatch, doc: fbDoc }) => {
      const db = getClientFirestore()
      const batch = writeBatch(db)
      for (const u of toWrite) {
        const data: Record<string, unknown> = {
          uid: u.uid, email: u.email, displayName: u.displayName,
          role: u.role, photoURL: u.photoURL ?? null,
          ...(u.displayNameEN && { displayNameEN: u.displayNameEN }),
          ...(u.nickname      && { nickname:      u.nickname }),
          ...(u.employeeId    && { employeeId:    u.employeeId }),
          ...(u.department    && { department:    u.department }),
          ...(u.position      && { position:      u.position }),
          ...(u.lineManager   && { lineManager:   u.lineManager }),
          ...(u.rank          && { rank:          u.rank }),
          ...(u.startDate     && { startDate:     u.startDate }),
          ...(u.employmentStatus && { employmentStatus: u.employmentStatus }),
          createdAt: u.createdAt, updatedAt: u.updatedAt,
        }
        batch.set(fbDoc(db, 'users', u.uid), data, { merge: true })
      }
      batch.commit().catch(console.error)
    })
  }
}

// ── Local team store (teams created in Firebase Live mode) ──────────────────
const LOCAL_TEAM_KEY = 'fk_local_teams_v1'
const LOCAL_TEAM_EVT = 'fk-local-teams-change'
// Optimistic delete: track IDs deleted locally so useTeams() can hide them
// immediately, before the Firestore onSnapshot confirms the deletion.
const LOCAL_DELETED_TEAM_IDS_KEY = 'fk_deleted_team_ids_v1'

export function getLocalTeams(): Team[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_TEAM_KEY)
    return raw ? (JSON.parse(raw) as Team[]) : []
  } catch { return [] }
}

function getDeletedTeamIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_TEAM_IDS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}

export function clearDeletedTeamIds(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LOCAL_DELETED_TEAM_IDS_KEY)
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
}

export function saveLocalTeam(team: Team): void {
  if (typeof window === 'undefined') return
  const existing = getLocalTeams()
  const idx = existing.findIndex((t) => t.id === team.id)
  if (idx >= 0) existing[idx] = team
  else existing.push(team)
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(existing))
  // Remove from deleted set in case this is an undo-after-delete
  const deleted = getDeletedTeamIds()
  if (deleted.has(team.id)) {
    deleted.delete(team.id)
    localStorage.setItem(LOCAL_DELETED_TEAM_IDS_KEY, JSON.stringify(Array.from(deleted)))
  }
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
  if (!DEMO_MODE) {
    import('@/lib/firebase/client').then(({ getClientFirestore, setDoc, doc: fbDoc }) => {
      const data = Object.fromEntries(Object.entries(team).filter(([, v]) => v !== undefined))
      setDoc(fbDoc(getClientFirestore(), 'teams', team.id), data).catch(console.error)
    })
  }
}

export function deleteLocalTeam(id: string): void {
  if (typeof window === 'undefined') return
  const filtered = getLocalTeams().filter((t) => t.id !== id)
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(filtered))
  const deleted = getDeletedTeamIds()
  deleted.add(id)
  localStorage.setItem(LOCAL_DELETED_TEAM_IDS_KEY, JSON.stringify(Array.from(deleted)))
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
  if (!DEMO_MODE) {
    import('@/lib/firebase/client').then(({ getClientFirestore, deleteDoc, doc: fbDoc }) => {
      deleteDoc(fbDoc(getClientFirestore(), 'teams', id)).catch(console.error)
    })
  }
}

export function deleteLocalTeams(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return
  const filtered = getLocalTeams().filter((t) => !ids.includes(t.id))
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(filtered))
  const deleted = getDeletedTeamIds()
  for (const id of ids) deleted.add(id)
  localStorage.setItem(LOCAL_DELETED_TEAM_IDS_KEY, JSON.stringify(Array.from(deleted)))
  window.dispatchEvent(new Event(LOCAL_TEAM_EVT))
  if (!DEMO_MODE) {
    import('@/lib/firebase/client').then(({ getClientFirestore, writeBatch, doc: fbDoc }) => {
      const db = getClientFirestore()
      const batch = writeBatch(db)
      for (const id of ids) batch.delete(fbDoc(db, 'teams', id))
      batch.commit().catch(console.error)
    })
  }
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
  // JSON.stringify silently drops `undefined` values, so { teamId: undefined }
  // becomes {} and the teamId is never actually cleared. Convert undefined → null
  // so the clearance survives serialization. null is falsy, so all `!u.teamId`
  // guards treat it correctly as "no team".
  const normalized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    normalized[k] = v === undefined ? null : v
  }
  patches[uid] = { ...(patches[uid] ?? {}), ...(normalized as UserPatch) }
  localStorage.setItem(LOCAL_PATCH_KEY, JSON.stringify(patches))
  window.dispatchEvent(new Event(LOCAL_PATCH_EVT))
  // Only write to Firestore for Google Auth users (non-csv-).
  // csv- users are managed via server API (/api/users/save-assignments) to avoid
  // Firestore permission issues and snapshot rollback loops.
  if (!DEMO_MODE && !uid.startsWith('csv-')) {
    import('@/lib/firebase/client').then(({ getClientFirestore, updateDoc, doc: fbDoc }) => {
      // Use normalized (undefined→null) so Firestore actually writes the value
      // instead of silently ignoring it.
      // updateDoc (not setDoc+merge): setDoc+merge silently CREATES a doc if `uid`
      // no longer exists (e.g. merged away by dedup, or a stale client-side id) —
      // that produced empty ghost docs. updateDoc rejects instead, so a stale
      // write surfaces as a visible error rather than phantom data.
      updateDoc(fbDoc(getClientFirestore(), 'users', uid), normalized)
        .catch((err) => {
          // A rejected write here previously failed silently: the optimistic
          // localStorage patch kept the UI looking correct until the next
          // Firestore snapshot rolled it back, which read as "member vanished".
          console.error(err)
          // Imported lazily: this module is pulled in by nearly every page, so a
          // static import would put SweetAlert2 in the shared first-load bundle
          // for a dialog that only ever appears when a write fails.
          void import('@/lib/ui/alert').then(({ alertError }) =>
            alertError(
              'บันทึกการย้ายพนักงานไม่สำเร็จ',
              `${err?.message ?? err} — พนักงานคนนี้อาจถูกรวม/ลบไปแล้ว กรุณารีเฟรชหน้าเว็บ`,
            ))
        })
    })
  }
}

// Migrate patches from old UIDs to new canonical UIDs (call after dedup)
export function migrateLocalUserPatches(uidMap: Record<string, string>): void {
  if (typeof window === 'undefined') return
  const patches = getLocalUserPatches()
  let changed = false
  for (const [oldUid, newUid] of Object.entries(uidMap)) {
    if (oldUid === newUid || !patches[oldUid]) continue
    // Merge: canonical uid patch takes precedence over migrated old-uid patch
    patches[newUid] = { ...patches[oldUid], ...(patches[newUid] ?? {}) }
    delete patches[oldUid]
    changed = true
  }
  if (changed) {
    localStorage.setItem(LOCAL_PATCH_KEY, JSON.stringify(patches))
    window.dispatchEvent(new Event(LOCAL_PATCH_EVT))
  }
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

// ── Snapshot cache — survives navigation, eliminates loading flash on return ───
const snapshotCache = new Map<string, unknown[]>()

// ── Generic Firestore live hook (only runs when !DEMO_MODE) ───────────────────
interface FirestoreConstraint {
  type: 'where' | 'orderBy' | 'limit'
  field?: string
  op?: string
  value?: unknown
  direction?: 'asc' | 'desc'
  count?: number
}

// ── Shared live-listener registry ─────────────────────────────────────────────
// One Firestore onSnapshot per unique query, shared across every hook instance
// and kept alive for a short grace period after the last subscriber unmounts.
//
// This is the core navigation-speed fix: the dashboard layout remounts its page
// subtree on every route change (key={pathname}), which previously tore down and
// re-created a listener — plus a fresh Firestore read — on EVERY navigation.
// Sharing + ref-counting means re-mounting a page (or navigating away and back)
// reattaches to the existing warm listener and its data instantly, with no
// teardown/re-subscribe churn and no duplicate listeners for the same query.
interface LiveListener {
  data: unknown[]
  error: string | null
  loaded: boolean
  refCount: number
  subs: Set<() => void>
  unsub?: () => void
  idle?: ReturnType<typeof setTimeout>
}
const liveListeners = new Map<string, LiveListener>()
// Keep a listener alive this long after its last subscriber leaves, so a quick
// navigation away-and-back reuses it instead of re-reading from Firestore.
// 5 min (not 60s): with the persistent IndexedDB cache a re-attach resumes via
// resume-token (only changed docs are billed), but keeping the stream warm
// avoids even that round-trip during a normal browsing session.
const LISTENER_GRACE_MS = 300_000

function acquireListener(cacheKey: string, collectionPath: string, constraintsKey: string): LiveListener {
  const existing = liveListeners.get(cacheKey)
  if (existing) {
    if (existing.idle) { clearTimeout(existing.idle); existing.idle = undefined }
    return existing
  }

  const listener: LiveListener = {
    data: (snapshotCache.get(cacheKey) as unknown[] | undefined) ?? [],
    error: null,
    loaded: snapshotCache.has(cacheKey),
    refCount: 0,
    subs: new Set(),
  }
  liveListeners.set(cacheKey, listener)

  // Attach the real Firestore listener (client-only, so this never runs on SSR).
  import('@/lib/firebase/client')
    .then((fb) => {
      // Bail if it was torn down before the dynamic import resolved.
      if (liveListeners.get(cacheKey) !== listener) return
      const db = fb.getClientFirestore()
      const ref = fb.collection(db, collectionPath)
      const parsed: FirestoreConstraint[] = JSON.parse(constraintsKey)
      const built = parsed.map((c) =>
        c.type === 'where'
          ? fb.where(c.field!, c.op as never, c.value)
          : c.type === 'limit'
          ? fb.limit(c.count ?? 100)
          : fb.orderBy(c.field!, c.direction ?? 'asc'),
      )
      const q = built.length > 0 ? fb.query(ref, ...built) : fb.query(ref)
      listener.unsub = fb.onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map((d) => convertTimestamps({ id: d.id, ...d.data() }))
          snapshotCache.set(cacheKey, rows)
          listener.data = rows
          listener.error = null
          listener.loaded = true
          listener.subs.forEach((cb) => cb())
        },
        (err) => {
          listener.error = err.message
          listener.loaded = true
          listener.subs.forEach((cb) => cb())
        },
      )
    })
    .catch((e) => {
      listener.error = String(e)
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    })

  return listener
}

function releaseListener(cacheKey: string): void {
  const listener = liveListeners.get(cacheKey)
  if (!listener || listener.refCount > 0 || listener.idle) return
  listener.idle = setTimeout(() => {
    listener.unsub?.()
    liveListeners.delete(cacheKey)
  }, LISTENER_GRACE_MS)
}

// Firestore Timestamp fields (createdAt, updatedAt, startDate, ...) come back
// from onSnapshot as Timestamp objects, not JS Dates — every type in this app
// declares them as `Date`, so left unconverted, `new Date(timestampObj)`
// downstream (e.g. fmtDate) silently produces "Invalid Date". Convert once,
// generically, for every collection read through useFirestoreList rather than
// special-casing each collection's date fields.
function convertTimestamps<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...row }
  for (const [key, value] of Object.entries(out)) {
    if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
      out[key] = (value as { toDate: () => Date }).toDate()
    }
  }
  return out as T
}

// Exported so feature hooks outside this file (useNotifications, ...) share
// the same warm-listener registry instead of each
// opening private per-mount onSnapshot subscriptions — the private ones re-read
// from Firestore and flash a loading state on EVERY navigation, because the
// dashboard layout remounts the page subtree (key={pathname}) on route change.
export function useFirestoreList<T>(
  collectionPath: string,
  constraints: FirestoreConstraint[],
  enabled: boolean,
): UseResult<T> {
  const constraintsKey = JSON.stringify(constraints)
  const cacheKey = `${collectionPath}:${constraintsKey}`

  const [state, setState] = useState<UseResult<T>>(() => {
    const cached = enabled ? (snapshotCache.get(cacheKey) as T[] | undefined) : undefined
    return { data: cached ?? [], loading: enabled && !cached, error: null }
  })

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], loading: false, error: null })
      return
    }

    // Attach to (or create) the shared listener for this exact query.
    const listener = acquireListener(cacheKey, collectionPath, constraintsKey)
    listener.refCount++
    // Bail when nothing actually changed. `sync` built a fresh {data,loading,error}
    // object every call, which is never reference-equal to the one useState's
    // initializer already produced from the warm cache — so every mount forced a
    // second full re-render of the page tree even when the cached data was
    // byte-identical. On the biggest pages that doubled the mount cost of a
    // navigation for no visible change.
    const sync = () => setState((prev) => {
      const loading = !listener.loaded
      if (prev.data === (listener.data as T[]) && prev.loading === loading && prev.error === listener.error) {
        return prev
      }
      return { data: listener.data as T[], loading, error: listener.error }
    })
    listener.subs.add(sync)
    sync() // pick up whatever the warm listener already holds

    return () => {
      listener.subs.delete(sync)
      listener.refCount--
      if (listener.refCount <= 0) releaseListener(cacheKey)
    }
    // collectionPath + constraintsKey are both encoded in cacheKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled])

  return state
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

// Records for a whole team.
//
// This used to query `where('teamId','==',teamId)` on trainingRecords — but
// TrainingRecord has NO teamId field and no writer ever set one (neither
// lib/progress.ts nor api/csv/course-results). The deployed composite index made
// the query legal, so it silently returned ZERO documents forever and the entire
// team-lead dashboard rendered empty with no error.
//
// Fixed by querying the members directly. `in` accepts up to 30 values, which
// covers a normal sales team; larger teams fall back to a client-side filter so
// they degrade in cost rather than silently truncating to the first 30.
const IN_QUERY_LIMIT = 30

export function useTeamTrainingRecords(memberUids: string[]): UseResult<TrainingRecord> {
  const [demoData, setDemoData] = useState<TrainingRecord[]>([])
  // Stable primitive key so the effect/queries don't re-fire on a new array identity.
  const uidsKey = useMemo(() => [...memberUids].sort().join(','), [memberUids])

  useEffect(() => {
    if (!DEMO_MODE) return
    const uids = uidsKey ? uidsKey.split(',') : []
    setDemoData(ALL_RECORDS.filter((r) => uids.includes(r.userId)))
  }, [uidsKey])

  const uids = useMemo(() => (uidsKey ? uidsKey.split(',') : []), [uidsKey])
  const withinInLimit = uids.length > 0 && uids.length <= IN_QUERY_LIMIT

  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    withinInLimit
      ? [
          { type: 'where', field: 'userId', op: 'in', value: uids },
          { type: 'orderBy', field: 'updatedAt', direction: 'desc' },
        ]
      : [{ type: 'orderBy', field: 'updatedAt', direction: 'desc' }],
    !DEMO_MODE && uids.length > 0,
  )

  const scoped = useMemo(() => {
    if (withinInLimit) return fbResult.data
    const set = new Set(uids)
    return fbResult.data.filter((r) => set.has(r.userId))
  }, [fbResult.data, withinInLimit, uids])

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }
  return { ...fbResult, data: scoped }
}

// `enabled` lets aggregate pages skip this whole-collection read once the light
// userStats summary is available (they only fall back to raw records when stats
// haven't been built yet).
export function useAllTrainingRecords(enabled = true): UseResult<TrainingRecord> {
  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    [{ type: 'orderBy', field: 'updatedAt', direction: 'desc' }],
    !DEMO_MODE && enabled,
  )

  if (DEMO_MODE) return enabled ? { data: ALL_RECORDS, loading: false, error: null } : { data: [], loading: false, error: null }
  return fbResult
}

// Records for ONE user — for per-member history views that previously filtered
// the whole collection. Equality-only filter → no composite index needed.
export function useUserTrainingRecords(uid: string | undefined): UseResult<TrainingRecord> {
  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    uid ? [{ type: 'where', field: 'userId', op: '==', value: uid }] : [],
    !DEMO_MODE && !!uid,
  )

  if (DEMO_MODE) return { data: ALL_RECORDS.filter((r) => r.userId === uid), loading: false, error: null }
  return fbResult
}

// Per-user aggregate summaries (one small doc per user). Backs the leaderboard
// and team-score cards without reading the raw trainingRecords collection.
export function useUserStats(): UseResult<UserStats> {
  const fbResult = useFirestoreList<UserStats>('userStats', [], !DEMO_MODE)

  if (DEMO_MODE) {
    // Derive on the fly from the mock records so demo mode matches live shape.
    const byUid = new Map<string, { status: string; score?: number | null }[]>()
    for (const r of ALL_RECORDS) {
      if (!byUid.has(r.userId)) byUid.set(r.userId, [])
      byUid.get(r.userId)!.push({ status: r.status, score: r.score })
    }
    const data = Array.from(byUid.entries()).map(([uid, recs]) => ({ ...computeUserStats(uid, recs), updatedAt: NOW }))
    return { data, loading: false, error: null }
  }
  return fbResult
}

// Records for ONE course — for the course-detail page, which otherwise pulled
// the ENTIRE trainingRecords collection just to filter down to a single course.
// Equality-only filter (no orderBy) so it needs no composite index; callers that
// want ordering sort client-side.
export function useCourseTrainingRecords(courseId: string | undefined): UseResult<TrainingRecord> {
  const fbResult = useFirestoreList<TrainingRecord>(
    'trainingRecords',
    courseId ? [{ type: 'where', field: 'courseId', op: '==', value: courseId }] : [],
    !DEMO_MODE && !!courseId,
  )

  if (DEMO_MODE) return { data: ALL_RECORDS.filter((r) => r.courseId === courseId), loading: false, error: null }
  return fbResult
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

// `enabled` defaults to false: assessment documents carry the answer key, and
// firestore.rules now restricts reads to super_admin. Only the authoring
// surfaces should pass true — a learner-facing page that subscribes here would
// both leak keys and get permission-denied. Learners take a quiz through
// GET /api/assessment/[id]/take, which strips the key server-side.
export function useAssessments(enabled = false): UseResult<Assessment> {
  const fbResult = useFirestoreList<Assessment>(
    'assessments',
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }],
    !DEMO_MODE && enabled,
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

// `enabled` lets learner-facing pages skip this whole-collection subscription —
// the full users roster is an admin/lead concern; a plain sale user's pages
// shouldn't pay ~users-collection reads for it.
export function useAllUsers(enabled = true): UseResult<UserProfile> {
  const demoData = useDemoSnapshot(() => demoStore.getUsers())

  const [localOverlay, setLocalOverlay] = useState<UserProfile[]>([])
  const [patches, setPatches] = useState<Record<string, UserPatch>>({})
  useEffect(() => {
    if (DEMO_MODE || !enabled) return
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
  }, [enabled])

  const fbResult = useFirestoreList<UserProfile>(
    'users',
    [{ type: 'orderBy', field: 'displayName', direction: 'asc' }],
    !DEMO_MODE && enabled,
  )

  // Garbage-collect patches whose uid no longer matches any live Firestore doc.
  // Patches never expired before this: a teamId/role override saved months ago
  // for a uid later deleted or replaced (dedup, restart, re-import) kept being
  // re-applied on every load forever, silently hiding/misplacing people whose
  // live Firestore data was actually correct. Skip while loading/erroring so a
  // transient empty snapshot doesn't wipe out valid patches by mistake.
  // Also skip when !enabled — the empty gated result would otherwise read as
  // "no live uids" and wipe every valid patch.
  useEffect(() => {
    if (DEMO_MODE || !enabled || fbResult.loading || fbResult.error) return
    const liveUids = new Set(fbResult.data.map(u => u.uid))
    const current = getLocalUserPatches()
    const cleaned: Record<string, UserPatch> = {}
    let changed = false
    for (const [uid, patch] of Object.entries(current)) {
      if (liveUids.has(uid)) cleaned[uid] = patch
      else changed = true
    }
    if (changed) {
      localStorage.setItem(LOCAL_PATCH_KEY, JSON.stringify(cleaned))
      setPatches(cleaned)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fbResult.data, fbResult.loading, fbResult.error])

  // The full patch → csv/auth email-merge → dedup pipeline below is O(n) over the
  // whole users collection and previously ran on EVERY render. Memoize it so it
  // only recomputes when the Firestore data, patches, or local overlay actually
  // change — not on every parent re-render or navigation remount.
  const mergedData = useMemo(() => {
    if (DEMO_MODE) return [] as UserProfile[]

    // Build email-level patch map: consolidate patches from ALL csv- docs with same email.
    // Needed because duplicate CSV imports create multiple docs per email with different UIDs;
    // patches saved at one UID must apply to whichever doc wins the email-dedup below.
    const emailPatchMap = new Map<string, UserPatch>()
    for (const u of fbResult.data) {
      if (!u.uid.startsWith('csv-') || !u.email) continue
      const p = patches[u.uid]
      if (!p) continue
      const key = u.email.toLowerCase()
      const prev = emailPatchMap.get(key) ?? {}
      emailPatchMap.set(key, {
        teamId:          p.teamId          ?? prev.teamId,
        visibleTeamIds:  p.visibleTeamIds  ?? prev.visibleTeamIds,
      })
    }

    const applyPatch = (u: UserProfile): UserProfile => {
      const byUid   = patches[u.uid]
      const byEmail = u.email && u.uid.startsWith('csv-')
        ? emailPatchMap.get(u.email.toLowerCase())
        : undefined
      if (!byUid && !byEmail) return u
      // uid-specific patch takes precedence over email-level patch.
      // role is deliberately NOT taken from the patch: nothing in the app currently
      // writes a role patch through any UI action, so any `role` sitting in a cached
      // patch is leftover garbage from old testing — and it silently excluded ~65
      // legitimate sale/team_lead employees from every role-eligible filter, since
      // stale-uid garbage collection only prunes patches for uids that no longer
      // exist, not patches with wrong field values on uids that still exist. Always
      // trust the live Firestore role.
      return { ...u, ...(byEmail ?? {}), ...(byUid ?? {}), role: u.role }
    }

    const patchedFb = fbResult.data.map(applyPatch)

    // Merge csv-prefixed docs into their matching auth docs by email.
    // Auth doc (non csv-) is base; csv doc provides supplemental fields.
    const authDocs = new Map<string, UserProfile>()   // key: lowercase email
    const csvDocs  = new Map<string, UserProfile>()   // key: lowercase email
    const noEmail: UserProfile[] = []
    for (const u of patchedFb) {
      const key = u.email?.toLowerCase()
      if (!key) { noEmail.push(u); continue }
      if (u.uid.startsWith('csv-')) csvDocs.set(key, u)
      else authDocs.set(key, u)
    }
    const mergedFb: UserProfile[] = noEmail.slice()
    for (const [email, authUser] of Array.from(authDocs.entries())) {
      const csv = csvDocs.get(email)
      if (csv) {
        mergedFb.push({
          ...authUser,
          displayNameEN:  authUser.displayNameEN  ?? csv.displayNameEN,
          lineManager:    authUser.lineManager    ?? csv.lineManager,
          department:     authUser.department     ?? csv.department,
          position:       authUser.position       ?? csv.position,
          employeeId:     authUser.employeeId     ?? csv.employeeId,
          nickname:       authUser.nickname       ?? csv.nickname,
          rank:           authUser.rank           ?? csv.rank,
          startDate:      authUser.startDate      ?? csv.startDate,
          // teamId/role/visibleTeamIds: a drag-and-drop or admin action can land its
          // patch on either doc (whichever one was rendered/dragged at the time), so
          // falling back to authUser alone silently discards an assignment written
          // to the csv doc. Prefer whichever side actually has a value.
          teamId:         authUser.teamId         ?? csv.teamId,
          role:           authUser.role           ?? csv.role,
          visibleTeamIds: authUser.visibleTeamIds ?? csv.visibleTeamIds,
        })
        csvDocs.delete(email)
      } else {
        mergedFb.push(authUser)
      }
    }
    // Remaining csv docs = employees who haven't logged in yet
    for (const csvUser of Array.from(csvDocs.values())) mergedFb.push(csvUser)

    const fbKeys = new Set<string>()
    for (const u of mergedFb) {
      if (u.uid)       fbKeys.add(u.uid)
      if (u.email)     fbKeys.add(u.email.toLowerCase())
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
    return [...mergedFb, ...uniqueLocal]
  }, [fbResult.data, patches, localOverlay])

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }

  return { ...fbResult, data: mergedData }
}

export function useTeams(enabled = true): UseResult<Team> {
  const demoData = useDemoSnapshot(() => demoStore.getTeams())

  const [localTeams, setLocalTeams] = useState<Team[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (DEMO_MODE || !enabled) return
    setLocalTeams(getLocalTeams())
    setDeletedIds(getDeletedTeamIds())
    const handler = () => {
      setLocalTeams(getLocalTeams())
      setDeletedIds(getDeletedTeamIds())
    }
    window.addEventListener(LOCAL_TEAM_EVT, handler)
    return () => window.removeEventListener(LOCAL_TEAM_EVT, handler)
  }, [enabled])

  const fbResult = useFirestoreList<Team>('teams', [], !DEMO_MODE && enabled)

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }

  // Optimistically hide teams deleted locally (Firestore snapshot may lag)
  const filteredFb = fbResult.data.filter((t) => !deletedIds.has(t.id))
  const fbIds = new Set(filteredFb.map((t) => t.id))
  const uniqueLocal = localTeams.filter((t) => !fbIds.has(t.id))
  return { ...fbResult, data: [...filteredFb, ...uniqueLocal] }
}

export function useDepartments(enabled = true): UseResult<Department> {
  const demoData = useDemoSnapshot(() => demoStore.getDepartments())
  // Same query key as useAllUsers so both share ONE users listener instead of
  // opening a second full-collection subscription.
  const fbUsers = useFirestoreList<UserProfile>(
    'users',
    [{ type: 'orderBy', field: 'displayName', direction: 'asc' }],
    !DEMO_MODE && enabled,
  )

  // Derive unique departments from users' department field. Memoized so a huge
  // users list isn't re-scanned on every render.
  const derived = useMemo(() => {
    const seen = new Map<string, Department>()
    for (const u of fbUsers.data) {
      const name = u.department?.trim()
      if (!name) continue
      const id = `dept-${name.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '-')}`
      if (!seen.has(id)) seen.set(id, { id, name } as Department)
    }
    return Array.from(seen.values())
  }, [fbUsers.data])

  if (DEMO_MODE) return { data: demoData, loading: false, error: null }

  return { data: derived, loading: fbUsers.loading, error: fbUsers.error }
}

export function useAnnouncements(): UseResult<Announcement> {
  const fbResult = useFirestoreList<Announcement>(
    'announcements',
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }],
    !DEMO_MODE,
  )
  if (DEMO_MODE) {
    const now = new Date()
    return {
      data: [
        { id: 'demo-1', title: 'ยินดีต้อนรับสู่ Freshket Sale Tracking', body: 'แพลตฟอร์มติดตามการอบรมและพัฒนาทีมขาย — เริ่มเรียนคอร์สแรกของคุณได้เลย', isPublished: true, createdAt: now, createdBy: 'system', authorName: 'Freshket Team' },
      ],
      loading: false,
      error: null,
    }
  }
  return fbResult
}

// Tools shown on /tools. Firestore-backed so a super_admin's publish reaches
// every user; SEED_TOOLS is only a read-only fallback while the collection is
// still empty (the admin can import them for real from the page).
export function useTools(): UseResult<SaleTool> {
  const fbResult = useFirestoreList<SaleTool>(
    'tools',
    [{ type: 'orderBy', field: 'createdAt', direction: 'asc' }],
    !DEMO_MODE,
  )
  if (DEMO_MODE) return { data: SEED_TOOLS, loading: false, error: null }
  return fbResult
}

// Department knowledge decks (Google Slides links) shown on Tools → Q&A.
// Firestore-backed so a super_admin's edit reaches every user; DEFAULT_KNOWLEDGE_DECKS
// is a read-only fallback the admin can import while the collection is still empty.
export interface KnowledgeDeck {
  id: string
  title: string
  subtitle: string
  url: string
  createdAt?: Date
}

export const DEFAULT_KNOWLEDGE_DECKS: KnowledgeDeck[] = [
  {
    id: 'deck-customer-success',
    title: 'ความรู้แผนก Customer Success',
    subtitle: 'สไลด์แนะนำงานทีม CS',
    url: 'https://docs.google.com/presentation/d/1JqCyoAUCys1_kO0qMpq3-MQIFQDMSaFBM4ps36iLpOc/edit?usp=sharing',
  },
  {
    id: 'deck-logistic',
    title: 'ความรู้แผนก Logistic',
    subtitle: 'สไลด์แนะนำงานทีมโลจิสติกส์',
    url: 'https://docs.google.com/presentation/d/1b530MPw3RQ2xgKsfBwxZXpED1kmWwk2uyST1dXxbH4Y/edit',
  },
]

export function useKnowledgeDecks(): UseResult<KnowledgeDeck> {
  const fbResult = useFirestoreList<KnowledgeDeck>(
    'knowledgeDecks',
    [{ type: 'orderBy', field: 'createdAt', direction: 'asc' }],
    !DEMO_MODE,
  )
  if (DEMO_MODE) return { data: DEFAULT_KNOWLEDGE_DECKS, loading: false, error: null }
  return fbResult
}

// ── Shared doc-level live listeners ───────────────────────────────────────────
// Same warm registry idea as acquireListener, but for single documents. Every
// detail page (course/[id], assessment/[id]) and per-user doc hook (points,
// heart allowance) previously opened its own onSnapshot per mount, so each
// navigation re-read the doc and flashed a loading state. One listener per doc
// path, ref-counted, kept warm through the same grace period.
interface DocListener {
  data: unknown | null
  error: string | null
  loaded: boolean
  refCount: number
  subs: Set<() => void>
  unsub?: () => void
  idle?: ReturnType<typeof setTimeout>
}
const docListeners = new Map<string, DocListener>()
const docSnapshotCache = new Map<string, unknown | null>()

function acquireDocListener(docPath: string): DocListener {
  const existing = docListeners.get(docPath)
  if (existing) {
    if (existing.idle) { clearTimeout(existing.idle); existing.idle = undefined }
    return existing
  }

  const listener: DocListener = {
    data: docSnapshotCache.has(docPath) ? docSnapshotCache.get(docPath) : null,
    error: null,
    loaded: docSnapshotCache.has(docPath),
    refCount: 0,
    subs: new Set(),
  }
  docListeners.set(docPath, listener)

  import('@/lib/firebase/client')
    .then((fb) => {
      if (docListeners.get(docPath) !== listener) return
      const segments = docPath.split('/')
      const ref = fb.doc(fb.getClientFirestore(), segments[0], ...segments.slice(1))
      listener.unsub = fb.onSnapshot(
        ref,
        (snap) => {
          const value = snap.exists() ? convertTimestamps<unknown>({ id: snap.id, ...snap.data() }) : null
          docSnapshotCache.set(docPath, value)
          listener.data = value
          listener.error = null
          listener.loaded = true
          listener.subs.forEach((cb) => cb())
        },
        (err) => {
          listener.error = err.message
          listener.loaded = true
          listener.subs.forEach((cb) => cb())
        },
      )
    })
    .catch((e) => {
      listener.error = String(e)
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    })

  return listener
}

function releaseDocListener(docPath: string): void {
  const listener = docListeners.get(docPath)
  if (!listener || listener.refCount > 0 || listener.idle) return
  listener.idle = setTimeout(() => {
    listener.unsub?.()
    docListeners.delete(docPath)
  }, LISTENER_GRACE_MS)
}

interface UseDocResult<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useFirestoreDoc<T>(docPath: string | undefined, enabled: boolean): UseDocResult<T> {
  const key = docPath ?? ''
  const on = enabled && !!docPath

  const [state, setState] = useState<UseDocResult<T>>(() => {
    const cached = on && docSnapshotCache.has(key) ? (docSnapshotCache.get(key) as T | null) : null
    return { data: cached, loading: on && !docSnapshotCache.has(key), error: null }
  })

  useEffect(() => {
    if (!on) {
      setState({ data: null, loading: false, error: null })
      return
    }
    const listener = acquireDocListener(key)
    listener.refCount++
    const sync = () => setState({ data: listener.data as T | null, loading: !listener.loaded, error: listener.error })
    listener.subs.add(sync)
    sync()

    return () => {
      listener.subs.delete(sync)
      listener.refCount--
      if (listener.refCount <= 0) releaseDocListener(key)
    }
  }, [key, on])

  return state
}

export function useDocument<T>(collectionPath: string, docId: string) {
  return useFirestoreDoc<T>(docId ? `${collectionPath}/${docId}` : undefined, !DEMO_MODE && !!docId)
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

// ── All shadow records (team_lead+ views: /shadow, /manager) ─────────────────
// The /shadow page previously never read this collection at all — it seeded
// its list from a hardcoded DEMO_RECORDS array unconditionally (not gated by
// demo mode) and new submissions only ever touched local React state, so every
// shadow visit a real user logged vanished on refresh. Capped like the other
// whole-collection reads in this file (roleplayAssessments, notifications).
export function useAllShadowRecords(enabled = true): UseResult<ShadowRecord> {
  const result = useFirestoreList<ShadowRecord>(
    'shadowRecords',
    [
      { type: 'orderBy', field: 'createdAt', direction: 'desc' },
      { type: 'limit', count: 2000 },
    ],
    !DEMO_MODE && enabled,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
}

// ── Shadow acknowledgments (lead/manager sign-off on a member's visit) ───────
// Doc id = the shadowRecords id it acknowledges (one ack per visit), written
// by the reviewing lead — see firestore.rules `shadowAcknowledgments` for the
// reviewerUid == uid() check that enforces that.
export type ShadowAcknowledgmentDoc = ShadowAcknowledgment & { id: string }

export function useAllShadowAcknowledgments(enabled = true): UseResult<ShadowAcknowledgmentDoc> {
  const result = useFirestoreList<ShadowAcknowledgmentDoc>(
    'shadowAcknowledgments',
    [{ type: 'limit', count: 2000 }],
    !DEMO_MODE && enabled,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
}

export async function saveShadowRecord(record: Omit<ShadowRecord, 'id'>): Promise<string> {
  const { getClientFirestore } = await import('@/lib/firebase/client')
  const { addDoc, collection, Timestamp } = await import('firebase/firestore')
  const db = getClientFirestore()
  const ref = await addDoc(collection(db, 'shadowRecords'), {
    ...record,
    createdAt: Timestamp.fromDate(record.createdAt),
    updatedAt: Timestamp.fromDate(record.updatedAt),
  })
  return ref.id
}

export async function saveShadowAcknowledgment(recordId: string, ack: ShadowAcknowledgment): Promise<void> {
  const { getClientFirestore } = await import('@/lib/firebase/client')
  const { doc, setDoc, Timestamp } = await import('firebase/firestore')
  const db = getClientFirestore()
  await setDoc(doc(db, 'shadowAcknowledgments', recordId), {
    ...ack,
    reviewedAt: Timestamp.fromDate(ack.reviewedAt),
  })
}

// ── Assessment (Pre/Post) scores by user ──────────────────────────────────────
export function useAssessmentScoresByUser(uid: string | undefined): UseResult<AssessmentScore> {
  const result = useFirestoreList<AssessmentScore>(
    'assessmentScores',
    uid
      ? [
          { type: 'where', field: 'uid', op: '==', value: uid },
          { type: 'orderBy', field: 'takenAt', direction: 'asc' },
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

// All roleplay assessments (manager / super_admin datatable + CSV-imported data).
// createdAt comes back as a JS Date via convertTimestamps. In demo mode returns
// empty so the page keeps its local DEMO_ASSESSMENTS.
export function useAllRoleplayAssessments(enabled = true): UseResult<RoleplayAssessment> {
  const result = useFirestoreList<RoleplayAssessment>(
    'roleplayAssessments',
    // Capped like other feed reads (notifications: 100, pointsLedger: 300) instead
    // of an unbounded read. 2000 is generous headroom above current volume; if
    // roleplay history ever needs to exceed this, the fix is a userStats-style
    // per-member rollup (as already done for trainingRecords), not a higher cap —
    // per-member round-numbering here reads the full client-side array, so a cap
    // that's actually hit would silently under-count rounds for older members.
    [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }, { type: 'limit', count: 2000 }],
    !DEMO_MODE && enabled,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
}
