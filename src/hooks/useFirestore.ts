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
import { DEMO_MANDATORY_ITEMS, type MandatoryItem } from '@/lib/mandatory'
import { MOCK_CUISINE_GUIDES, type CuisineGuideItem } from '@/lib/cuisineGuide'
import type { AssessmentScore } from '@/types/assessmentScore'
import type { UserBucketResult } from '@/types/bucketAssessment'
import { computeUserStats, type UserStats } from '@/types/stats'
import { save, patch as patchDoc, remove, removeMany, saveMany } from '@/lib/data/collection'
import { queryDocs, getDocument } from '@/lib/data/client'
import { attachLive } from '@/lib/data/live'
import { pollIntervalFor } from '@/lib/data/pollInterval'
import { reviewId } from '@/lib/shadow/reviews'
import { isExcludedPosition } from '@/lib/users/excludedPositions'

// ── Local imported-user overlay (persists CSV-imported users in localStorage) ──
/**
 * Surface a failed background write instead of swallowing it.
 *
 * Several mutations here write to localStorage first and fire the Firestore
 * write without awaiting it, so the UI already shows the change as done. When
 * that write was rejected (permissions, a stale id, offline) the only trace was
 * a console line: the optimistic state stayed on screen until the next snapshot
 * silently rolled it back, which users read as "it saved, then undid itself".
 *
 * SweetAlert2 is imported lazily — this module is pulled in by nearly every
 * page, and a static import would put the dialog in the shared first-load
 * bundle for something that only renders when a write fails.
 */
function reportWriteFailure(title: string, detail: string) {
  return (err: unknown) => {
    console.error(title, err)
    const message = err instanceof Error ? err.message : String(err)
    void import('@/lib/ui/alert').then(({ alertError }) =>
      alertError(title, `${message} — ${detail}`))
  }
}

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
    void saveMany('users', toWrite.map((u) => ({
      id: u.uid,
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
    })), { merge: true }).catch(reportWriteFailure(
      'นำเข้าข้อมูลพนักงานไม่สำเร็จ',
      'ข้อมูลที่นำเข้ายังไม่ถูกบันทึกขึ้นระบบ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่',
    ))
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
    // replace: a team is stored whole — a member dropped from the array has to
    // actually disappear, which a merge would leave behind.
    void save('teams', { ...team }, { replace: true }).catch(reportWriteFailure(
      'บันทึกทีมไม่สำเร็จ',
      'การเปลี่ยนแปลงยังไม่ถูกบันทึกขึ้นระบบ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่',
    ))
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
    void remove('teams', id).catch(reportWriteFailure(
      'ลบทีมไม่สำเร็จ',
      'ทีมนี้อาจยังอยู่ในระบบ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่',
    ))
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
    void removeMany('teams', ids).catch(reportWriteFailure(
      'ลบทีมไม่สำเร็จ',
      'บางทีมอาจยังอยู่ในระบบ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่',
    ))
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
    // Use normalized (undefined→null) so the store actually writes the value
    // instead of silently ignoring it.
    //
    // mustExist: a plain upsert silently CREATES a doc when `uid` no longer
    // exists (merged away by dedup, or a stale client-side id) — that produced
    // empty ghost docs. This rejects instead, so a stale write surfaces as a
    // visible error rather than phantom data.
    void patchDoc('users', uid, normalized, { mustExist: true })
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

// ── Shared live-query registry ────────────────────────────────────────────────
// One live query per unique query, shared across every hook instance and kept
// alive for a short grace period after the last subscriber unmounts.
//
// This is the core navigation-speed fix: the dashboard layout remounts the page
// subtree on every route change (key={pathname}), which previously tore down and
// re-created a query — plus a fresh read — on EVERY navigation. Sharing +
// ref-counting means re-mounting a page (or navigating away and back) reattaches
// to the existing warm query and its data instantly, with no teardown/re-read
// churn and no duplicate queries for the same data.
//
// "Live" now means: read once, read again when the app says something changed,
// and poll while the tab is visible (see lib/data/live.ts). There is no push.
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
// Keep a query alive this long after its last subscriber leaves, so a quick
// navigation away-and-back reuses it instead of reading again. 5 min.
const LISTENER_GRACE_MS = 300_000

// How often to look for OTHER people's changes is chosen per collection (see
// lib/data/pollInterval.ts). A person's own saves do not wait for it — they invalidate.
const pollFor = pollIntervalFor

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** True when a read brought back exactly what was already held — nothing to re-render. */
function sameData(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

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

  const constraints: FirestoreConstraint[] = JSON.parse(constraintsKey)
  listener.unsub = attachLive({
    path: collectionPath,
    pollMs: pollFor(collectionPath),
    load: () => queryDocs(collectionPath, constraints),
    apply: (rows) => {
      // A poll that finds nothing new must not hand the page a new array: that
      // re-renders the whole tree once a minute for no visible change.
      if (listener.loaded && listener.error === null && sameData(listener.data, rows)) return
      snapshotCache.set(cacheKey, rows)
      listener.data = rows
      listener.error = null
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    },
    fail: (e) => {
      listener.error = errorMessage(e)
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    },
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
    // Maids and masseuses are not target: dropped here so no screen lists them.
    return [...mergedFb, ...uniqueLocal].filter((u) => !isExcludedPosition(u.position))
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

// Mandatory Reading slides (tools/mandatory admin page, courses/mandatory
// learner page). Firestore-backed so a publish reaches every user; DEMO_MANDATORY_ITEMS
// is only the demo-mode dataset, not a client-visible fallback (unlike SEED_TOOLS)
// since there's no meaningful "import defaults" action for weekly content.
export function useMandatoryItems(): UseResult<MandatoryItem> {
  const fbResult = useFirestoreList<MandatoryItem>(
    'mandatoryItems',
    [{ type: 'orderBy', field: 'publishedAt', direction: 'desc' }],
    !DEMO_MODE,
  )
  if (DEMO_MODE) return { data: DEMO_MANDATORY_ITEMS, loading: false, error: null }
  return fbResult
}

// Cuisine Guide (tools/cuisine-guide) — which SKUs to pitch per restaurant
// cuisine. Firestore-backed so a super_admin's edit reaches every user;
// MOCK_CUISINE_GUIDES is a read-only fallback the admin can import while the
// collection is still empty (same "import defaults" pattern as SEED_TOOLS),
// since this ships with placeholder SKU data rather than starting blank.
export function useCuisineGuides(): UseResult<CuisineGuideItem> {
  const fbResult = useFirestoreList<CuisineGuideItem>(
    'cuisineGuides',
    [{ type: 'orderBy', field: 'createdAt', direction: 'asc' }],
    !DEMO_MODE,
  )
  if (DEMO_MODE) return { data: MOCK_CUISINE_GUIDES, loading: false, error: null }
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
// heart allowance) previously opened its own read per mount, so each
// navigation re-read the doc and flashed a loading state. One live read per doc
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

/** 'courses/c1' → path 'courses', id 'c1'; 'notifications/u1/items/n1' → path 'notifications/u1/items'. */
function splitDocPath(docPath: string): { path: string; id: string } {
  const i = docPath.lastIndexOf('/')
  return { path: docPath.slice(0, i), id: docPath.slice(i + 1) }
}

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

  const { path, id } = splitDocPath(docPath)
  listener.unsub = attachLive({
    path,
    pollMs: pollFor(path),
    load: () => getDocument(path, id),
    apply: (value) => {
      if (listener.loaded && listener.error === null && sameData(listener.data, value)) return
      docSnapshotCache.set(docPath, value)
      listener.data = value
      listener.error = null
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    },
    fail: (e) => {
      listener.error = errorMessage(e)
      listener.loaded = true
      listener.subs.forEach((cb) => cb())
    },
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
  // No id → the seam mints one, so two assessors saving at the same moment
  // can't collide.
  const { id } = await save('shadowRecords', { ...record, id: '' })
  return id
}

// One review per reviewer per visit: the id names both, so a manager's review does not
// replace the team lead's, and re-saving edits the reviewer's own.
export async function saveShadowAcknowledgment(recordId: string, ack: ShadowAcknowledgment): Promise<void> {
  await save('shadowAcknowledgments', { ...ack, recordId, id: reviewId(recordId, ack.reviewerUid) }, { replace: true })
}

// ── Roleplay assessments ──────────────────────────────────────────────────────
// The assessor form on /courses/roleplay had no write path at all: saving only
// touched local state, which the live listener then overwrote on its next
// snapshot, so every evaluation was silently lost. These are the missing writes.
// firestore.rules requires assessorUid == the caller, so the record is always
// attributable to whoever scored it.

export async function saveRoleplayAssessment(assessment: RoleplayAssessment): Promise<string> {
  const { id, ...rest } = assessment

  // An edit keeps its id; a new evaluation passes none so the seam mints one,
  // so two assessors filling in the same member at once can't collide on a
  // local id.
  const written = await save('roleplayAssessments', {
    ...rest,
    id: id && !id.startsWith('local-') ? id : '',
  })
  return written.id
}

export async function deleteRoleplayAssessment(id: string): Promise<void> {
  await remove('roleplayAssessments', id)
}

// ── Bucket assessment results (one doc per uid per questionnaire) ─────────────
// Written only by POST /api/personality/submit; read here to render the result
// cards on the learner's profile.
export function useMyBucketResult(
  uid: string | undefined,
  definitionId: string,
): UseDocResult<UserBucketResult> {
  const result = useFirestoreDoc<UserBucketResult>(
    uid ? `userBucketResults/${uid}_${definitionId}` : undefined,
    !DEMO_MODE && !!uid,
  )
  if (DEMO_MODE) return { data: null, loading: false, error: null }
  return result
}

/** Everyone's result for one questionnaire, in one query (a roster column, instead of one read per row). */
export function useBucketResultsFor(definitionId: string, enabled = true): UseResult<UserBucketResult> {
  const result = useFirestoreList<UserBucketResult>(
    'userBucketResults',
    [{ type: 'where', field: 'definitionId', op: '==', value: definitionId }],
    !DEMO_MODE && enabled,
  )
  if (DEMO_MODE) return { data: [], loading: false, error: null }
  return result
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
// createdAt comes back as a JS Date (the data client revives it). In demo mode returns
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

// ── New Joiner Hub content (team cards + problem routing guide) ───────────────
// Stored as two documents under appConfig rather than a collection per kind:
// the lists are short, always read together with the page, and a doc read is
// one billed read instead of one per card. appConfig already carries exactly
// the access this needs (staff read, super_admin write) — see firestore.rules.
//
// Before this, the Hub rendered from hardcoded INIT_TEAMS/INIT_PROBLEMS arrays
// and the admin "แก้ไขเนื้อหา" mode only mutated React state, so every edit was
// gone on the next refresh and nobody but the editor ever saw it.
export interface NewJoinerListDoc<T> {
  items: T[]
  updatedAt?: unknown
}

/**
 * Live content list for the New Joiner Hub.
 *
 * Returns `null` data when the document doesn't exist yet, which the page
 * distinguishes from an empty list: a missing doc falls back to the built-in
 * seed content, while an explicitly empty list means an admin deleted
 * everything and must stay empty.
 */
export function useNewJoinerList<T>(docId: 'newJoinerTeams' | 'newJoinerProblems') {
  return useFirestoreDoc<NewJoinerListDoc<T>>(`appConfig/${docId}`, !DEMO_MODE)
}

export async function saveNewJoinerList<T>(
  docId: 'newJoinerTeams' | 'newJoinerProblems',
  items: T[],
): Promise<void> {
  // patch, not a whole-document write, so we only touch these two fields —
  // matching the convention the moduleAccess save in /admin/settings uses.
  //
  // The stamp is the client's clock rather than the server's: this is an admin
  // editing a config list, with no concurrent writer to order against, and the
  // field is only ever read back as "last edited around then".
  await patchDoc('appConfig', docId, { items, updatedAt: new Date() })
}
