// One-off tooling: the parts of the Firestore -> Postgres move that are about
// the MOVE, not about how documents and rows relate afterwards.
//
// How a document maps to a row (the specs, the coercions, the id rules) lives in
// src/lib/server/docMap.ts, because the running app needs it too. What stays
// here is what only a one-time load needs:
//
//  · Who is the same person. The users collection holds some people twice — an
//    HR row (`csv-{employeeId}`) and a Firebase-login row — and some HR rows
//    twice. planUserMerge collapses them under the rules recorded in
//    supabase/migrations/005, and returns a map from every retired id to the id
//    that survives, so references elsewhere can be re-pointed.
//  · What to do when two records land on one key (mergeTrainingRows).
//  · The report: which fields fell into `extra`, which rows Postgres would
//    reject, how many documents collapsed.
//  · Recomputing user_stats instead of copying it.
//
// PURE, like docMap — no Firebase, Supabase or I/O — so every decision here is
// unit-tested. The runner (run.mjs) does the reading and writing.
//
// Delete this folder once the data is across and the app is running on Postgres.

import type { Row, SourceDoc, TableSpec, UidRemap } from '../../src/lib/server/docMap.ts'
import {
  USERS, SPECS as SHARED_SPECS, TRAINING_RECORDS as SHARED_TRAINING_RECORDS,
  transformDoc, toIso, dedupe, makeRemap,
} from '../../src/lib/server/docMap.ts'

// The shared pieces the tests and the runner reach for, under their old home.
export type { Row, SourceDoc, TableSpec, UidRemap }
export {
  toIso, normalize, makeRemap, transformDoc,
  USERS, TEAMS, COURSES, ASSESSMENTS, ASSESSMENT_SESSIONS, ASSESSMENT_ATTEMPTS,
  USER_BUCKET_RESULTS, TOOLS, KNOWLEDGE_DECKS, MANDATORY_ITEMS, RESOURCES, CSV_IMPORTS,
  APP_CONFIG, NOTIFICATIONS,
} from '../../src/lib/server/docMap.ts'

// ── A whole collection, with a report ───────────────────────────────────────

export interface TableReport {
  table: string
  source: number
  rows: number
  /** Documents that collapsed onto an existing key, and so were merged or dropped. */
  collisions: number
  /** Fields with no column, with how many documents carried each. */
  unmapped: Record<string, number>
  missingRequired: Record<string, number>
  badValues: Record<string, Record<string, number>>
}

export function buildTable(
  spec: TableSpec,
  docs: SourceDoc[],
  remap: UidRemap,
): { rows: Row[]; report: TableReport } {
  const report: TableReport = {
    table: spec.table,
    source: docs.length,
    rows: 0,
    collisions: 0,
    unmapped: {},
    missingRequired: {},
    badValues: {},
  }
  const byKey = new Map<string, Row>()

  for (const d of docs) {
    const { row, unmapped } = transformDoc(spec, d.id, d.data, remap)

    for (const f of unmapped) report.unmapped[f] = (report.unmapped[f] ?? 0) + 1

    for (const col of spec.required) {
      if (row[col] === undefined || row[col] === null) {
        report.missingRequired[col] = (report.missingRequired[col] ?? 0) + 1
      }
    }
    for (const [col, ok] of Object.entries(spec.allowed ?? {})) {
      const v = row[col]
      if (v !== undefined && v !== null && !ok.includes(String(v))) {
        const bucket = (report.badValues[col] ??= {})
        bucket[String(v)] = (bucket[String(v)] ?? 0) + 1
      }
    }

    const key = spec.keyColumns.map((c) => String(row[c])).join('\u0000')
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, row)
    } else {
      report.collisions++
      if (spec.merge) {
        byKey.set(key, spec.merge(existing, row))
      } else {
        // The more recently touched document wins; with no recency column the
        // first one seen stays.
        const col = spec.recency
        if (col && String(row[col] ?? '') > String(existing[col] ?? '')) byKey.set(key, row)
      }
    }
  }

  const rows = Array.from(byKey.values())
  report.rows = rows.length
  return { rows, report }
}

// ── Merging the people who exist twice ──────────────────────────────────────

const ROLE_RANK: Record<string, number> = { sale: 1, team_lead: 2, manager: 3, super_admin: 4 }
const rankOf = (r: unknown) => ROLE_RANK[String(r)] ?? 1
const isHr = (id: string) => id.startsWith('csv-')
const lc = (s: unknown) => String(s ?? '').trim().toLowerCase()
const ms = (v: unknown): number | null => {
  const iso = toIso(v)
  return iso === null ? null : Date.parse(iso)
}
const present = (v: unknown) => v !== undefined && v !== null && v !== ''

/** Only the literal "Active" (or no status at all) counts as active — same rule the app uses. */
const isActive = (d: SourceDoc) => {
  const s = d.data.employmentStatus
  return s === undefined || s === null || s === '' || s === 'Active'
}

/** Best first: an active record, then the most recently updated, then the lowest id (so the order is stable). */
function ranked(docs: SourceDoc[]): SourceDoc[] {
  return [...docs].sort(
    (x, y) =>
      Number(isActive(y)) - Number(isActive(x)) ||
      (ms(y.data.updatedAt) ?? 0) - (ms(x.data.updatedAt) ?? 0) ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
  )
}
const best = (docs: SourceDoc[]): SourceDoc => ranked(docs)[0]

function pickCanonical(group: SourceDoc[]): SourceDoc {
  // The HR row whose id is exactly csv-{its own employeeId} is the one every
  // import has always converged on, so it is the key that never needs changing.
  const exact = group.filter(
    (d) => isHr(d.id) && typeof d.data.employeeId === 'string' && d.data.employeeId !== '' &&
      d.id === `csv-${d.data.employeeId}`,
  )
  if (exact.length) return best(exact)
  const hr = group.filter((d) => isHr(d.id))
  if (hr.length) return best(hr)
  return best(group)
}

export interface UserMergeReport {
  docs: number
  people: number
  /** People who had more than one document. */
  duplicatePeople: number
  /** e.g. { "1hr+1auth": 5, "2hr+0auth": 11 } */
  shapes: Record<string, number>
  authUidsLinked: number
  /** Merged role is higher than the surviving row's own — somebody had been promoted on the other row. */
  roleRaised: number
  teamConflicts: number
  employeeIdConflicts: number
  /** More than one login row for one person; the extras are kept in extra.otherAuthUids. */
  multipleAuthDocs: number
  retiredIds: number
}

export interface MergedUser extends SourceDoc {
  /** The Firebase uid this person signs in with, when one is known. */
  authUid?: string
}

export interface UserMergePlan {
  users: MergedUser[]
  /** Every retired document id -> the id that survives. */
  uidMap: Record<string, string>
  report: UserMergeReport
}

export function planUserMerge(docs: SourceDoc[]): UserMergePlan {
  const groups = new Map<string, SourceDoc[]>()
  for (const d of docs) {
    const e = lc(d.data.email)
    const key = e || `\u0000noemail:${d.id}`
    const g = groups.get(key)
    if (g) g.push(d)
    else groups.set(key, [d])
  }

  const report: UserMergeReport = {
    docs: docs.length, people: groups.size, duplicatePeople: 0, shapes: {},
    authUidsLinked: 0, roleRaised: 0, teamConflicts: 0, employeeIdConflicts: 0,
    multipleAuthDocs: 0, retiredIds: 0,
  }
  const uidMap: Record<string, string> = {}
  const users: MergedUser[] = []

  for (const group of Array.from(groups.values())) {
    const canonical = pickCanonical(group)
    const authDocs = group.filter((d) => !isHr(d.id))
    const hrOthers = group.filter((d) => isHr(d.id) && d.id !== canonical.id)
    const authOthers = group.filter((d) => !isHr(d.id) && d.id !== canonical.id)

    // HR-owned fields: the surviving row speaks first, then other HR rows, then login rows.
    const hrFirst = [canonical, ...ranked(hrOthers), ...ranked(authOthers)]
    // Login-owned (the avatar): the login row speaks first.
    const loginFirst = [...ranked(authDocs), ...hrFirst]

    const first = (order: SourceDoc[], key: string): unknown => {
      for (const d of order) if (present(d.data[key])) return d.data[key]
      return undefined
    }

    const merged: Record<string, unknown> = {}
    const keys = Array.from(new Set(group.flatMap((d) => Object.keys(d.data))))
    for (const key of keys) {
      if (key === 'uid') continue
      if (key === 'role') {
        merged.role = group.map((d) => d.data.role).filter(present)
          .sort((a, b) => rankOf(b) - rankOf(a))[0]
      } else if (key === 'photoURL') {
        merged.photoURL = first(loginFirst, key)
      } else if (key === 'createdAt') {
        const all = group.map((d) => ms(d.data.createdAt)).filter((x): x is number => x !== null)
        merged.createdAt = all.length ? new Date(Math.min(...all)).toISOString() : undefined
      } else if (key === 'updatedAt') {
        const all = group.map((d) => ms(d.data.updatedAt)).filter((x): x is number => x !== null)
        merged.updatedAt = all.length ? new Date(Math.max(...all)).toISOString() : undefined
      } else {
        merged[key] = first(hrFirst, key)
      }
    }
    merged.uid = canonical.id

    let authUid: string | undefined
    if (authDocs.length > 0) {
      const chosen = best(authDocs)
      authUid = chosen.id
      report.authUidsLinked++
      if (authDocs.length > 1) {
        report.multipleAuthDocs++
        merged.otherAuthUids = authDocs.filter((d) => d.id !== chosen.id).map((d) => d.id)
      }
    }

    // Reporting.
    const nHr = group.filter((d) => isHr(d.id)).length
    const shape = `${nHr}hr+${authDocs.length}auth`
    if (group.length > 1) {
      report.duplicatePeople++
      report.shapes[shape] = (report.shapes[shape] ?? 0) + 1
    }
    if (rankOf(merged.role) > rankOf(canonical.data.role)) report.roleRaised++
    const distinct = (key: string) => new Set(group.map((d) => d.data[key]).filter(present)).size
    if (distinct('teamId') > 1) report.teamConflicts++
    if (distinct('employeeId') > 1) report.employeeIdConflicts++

    for (const d of group) {
      if (d.id !== canonical.id) {
        uidMap[d.id] = canonical.id
        report.retiredIds++
      }
    }
    users.push({ id: canonical.id, data: merged, authUid })
  }

  users.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { users, uidMap, report }
}

// ── Derived: per-user stats ─────────────────────────────────────────────────

/**
 * user_stats is a summary of training_records and is never authored directly,
 * so it is recomputed from the migrated records instead of being copied. Copying
 * would also have collided wherever two ids for one person each had a summary.
 * The aggregation itself is passed in so the app's own definition
 * (computeUserStats in src/types/stats.ts) stays the only one.
 */
export function deriveUserStats(
  trainingRows: Row[],
  compute: (uid: string, records: { status: string; score?: number | null }[]) => {
    uid: string; totalCount: number; completedCount: number; scoreSum: number; scoredCount: number
  },
  nowIso: string,
): Row[] {
  const byUser = new Map<string, { status: string; score?: number | null }[]>()
  for (const r of trainingRows) {
    const uid = String(r.user_id)
    const list = byUser.get(uid) ?? []
    list.push({
      status: String(r.status ?? 'not_started'),
      score: typeof r.score === 'number' ? r.score : null,
    })
    byUser.set(uid, list)
  }
  return Array.from(byUser, ([uid, records]) => {
    const s = compute(uid, records)
    return {
      uid: s.uid,
      total_count: s.totalCount,
      completed_count: s.completedCount,
      score_sum: s.scoreSum,
      scored_count: s.scoredCount,
      updated_at: nowIso,
    }
  })
}

// ── The users table ─────────────────────────────────────────────────────────

export function buildUserRows(plan: UserMergePlan): { rows: Row[]; report: TableReport } {
  const { rows, report } = buildTable(USERS, plan.users, makeRemap(plan.uidMap))
  const authByUid = new Map(plan.users.map((u) => [u.id, u.authUid] as const))
  for (const row of rows) {
    const a = authByUid.get(String(row.uid))
    if (a) row.auth_uid = a
  }
  return { rows, report }
}

// ── Two training records for one person and course ──────────────────────────

const PROGRESS_RANK: Record<string, number> = { not_started: 0, in_progress: 1, failed: 2, completed: 3 }
const earliest = (x: unknown, y: unknown): unknown =>
  x == null ? y : y == null ? x : String(x) <= String(y) ? x : y

/**
 * Two training records for one person and course, which happens when progress
 * was recorded under both the HR id (a CSV import) and the Firebase id (the
 * learner's own work). They are usually NOT the same record twice. The one
 * collision in the real data was a completed CSV result (score 90, finished in
 * April) against a newer in-app attempt still marked in_progress with every
 * lesson done — and keeping "the newer" would have turned a finished course
 * back into one in progress and discarded the date HR reports on.
 *
 * So each field is settled on its own meaning rather than by recency alone:
 *  · status — the furthest progress wins (completed over in_progress);
 *  · startedAt / completedAt — the EARLIEST, since both are first-time stamps
 *    (see src/lib/progress.ts: they must not creep forward on later activity);
 *  · completed lessons — the union; total lessons — the larger;
 *  · everything else (score, attempts, source, …) — the more recent record's,
 *    with the other filling any field it lacks, so import provenance survives.
 */
export function mergeTrainingRows(a: Row, b: Row): Row {
  const bNewer = String(b.updated_at ?? '') > String(a.updated_at ?? '')
  const newer = bNewer ? b : a
  const older = bNewer ? a : b
  const merged: Row = { ...older, ...newer }

  const rank = (r: Row) => PROGRESS_RANK[String(r.status)] ?? 0
  merged.status = (rank(b) > rank(a) ? b : a).status

  for (const col of ['started_at', 'completed_at']) {
    const v = earliest(a[col], b[col])
    if (v != null) merged[col] = v
  }

  const lessons = dedupe([
    ...(Array.isArray(a.completed_lesson_ids) ? (a.completed_lesson_ids as string[]) : []),
    ...(Array.isArray(b.completed_lesson_ids) ? (b.completed_lesson_ids as string[]) : []),
  ])
  if (lessons.length > 0) merged.completed_lesson_ids = lessons

  const totals = [a.total_lessons, b.total_lessons].filter((x): x is number => typeof x === 'number')
  if (totals.length > 0) merged.total_lessons = Math.max(...totals)

  return merged
}

/** The training-records spec, with the collision rule above attached. */
export const TRAINING_RECORDS: TableSpec = { ...SHARED_TRAINING_RECORDS, merge: mergeTrainingRows }

/**
 * Every table the load copies, in order. user_stats is not among them — it is
 * recomputed — and users is built separately, through planUserMerge.
 */
export const SPECS: TableSpec[] = SHARED_SPECS
  .filter((s) => s.table !== 'user_stats')
  .map((s) => (s.table === 'training_records' ? TRAINING_RECORDS : s))

/** Leftovers from the cancelled PVP project; deliberately not migrated. */
export const SKIPPED_COLLECTIONS = ['pvpPrices', 'products', 'pvpSyncRuns'] as const
