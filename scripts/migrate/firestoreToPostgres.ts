// One-off tooling: turn the Firestore documents into Postgres rows.
//
// PURE ON PURPOSE. Nothing in this file touches Firebase, Supabase, the network
// or the disk, and it imports nothing. That is what lets it be unit-tested
// without an Admin SDK, and it is also why Node can load it directly from the
// runner (scripts/migrate/run.mjs) with no build step. The runner does the I/O;
// every decision about what a row looks like is made here.
//
// WHAT IT DECIDES
//
//  · Who is the same person. The users collection holds some people twice — an
//    HR row (`csv-{employeeId}`) and a Firebase-login row — and some HR rows
//    twice. planUserMerge collapses them under the rules recorded in
//    supabase/migrations/005, and returns a map from every retired id to the id
//    that survives, so references elsewhere can be re-pointed.
//  · How each field is stored: a named column, or `extra` when the schema has
//    no column for it. Nothing is dropped silently; what lands in `extra` is
//    counted and reported.
//  · Which rows would be rejected by Postgres (a NOT NULL column that is
//    missing, a value outside a CHECK list), so that is discovered in a dry run
//    rather than half-way through a load.
//
// This is migration scaffolding. Delete it once the data is across.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Row = Record<string, unknown>
export type Kind = 'text' | 'int' | 'num' | 'bool' | 'ts' | 'textArr' | 'json'

export interface SourceDoc {
  id: string
  data: Record<string, unknown>
}

export interface FieldSpec {
  column: string
  kind: Kind
}

export interface TableSpec {
  /** Firestore collection this is read from (notifications: the `items` group). */
  source: string
  table: string
  /** Columns that form the primary key, in order. They are the upsert conflict target. */
  keyColumns: string[]
  /** Firestore field -> column. Anything not listed goes to `extra`. */
  fields: Record<string, FieldSpec>
  /** Whether the table has an `extra` column to catch unlisted fields. */
  hasExtra: boolean
  /** Columns that are NOT NULL with no default — a row without one is rejected. */
  required: string[]
  /** CHECK constraints: column -> the values it may hold. */
  allowed?: Record<string, readonly string[]>
  /** Firestore fields that hold ONE uid / a LIST of uids, re-pointed through the merge map. */
  uidFields?: string[]
  uidListFields?: string[]
  /** Firestore fields that merely repeat the document id; not stored. */
  selfIdFields?: string[]
  /** Reshape a document before anything else (fold legacy fields, regroup). */
  preprocess?: (data: Record<string, unknown>) => Record<string, unknown>
  /** Build the primary-key value from the (already re-pointed) document. */
  id?: (docId: string, data: Record<string, unknown>) => string
  /** Store the whole document as one jsonb column instead of mapping fields. */
  asJson?: string
  /** Column used to pick a winner when two documents collapse onto one key. */
  recency?: string
  /**
   * Combine two rows that collapse onto one key, instead of letting the more
   * recent one win outright. For tables where each row carries history that
   * the newer one does not.
   */
  merge?: (kept: Row, incoming: Row) => Row
}

// ── Values ──────────────────────────────────────────────────────────────────

/**
 * Any of the shapes a date arrives in -> an ISO string, or null.
 *
 * Needed because `users.createdAt` really does come in three: 52 Firestore
 * Timestamps, 1,605 ISO strings (the CSV importer wrote its own JSON-serialised
 * Date), and one plain `{seconds, nanoseconds}` object.
 */
export function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : new Date(t).toISOString()
  }
  if (typeof v === 'number') {
    const d = new Date(v)
    return Number.isFinite(v) && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  }
  if (typeof v === 'object') {
    const o = v as {
      toDate?: () => Date
      seconds?: unknown; nanoseconds?: unknown
      _seconds?: unknown; _nanoseconds?: unknown
    }
    if (typeof o.toDate === 'function') return toIso(o.toDate())
    const s = o.seconds ?? o._seconds
    const n = o.nanoseconds ?? o._nanoseconds
    if (typeof s === 'number') {
      return toIso(new Date(s * 1000 + Math.floor((typeof n === 'number' ? n : 0) / 1e6)))
    }
  }
  return null
}

function isTimestampLike(v: unknown): boolean {
  if (v instanceof Date) return true
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.toDate === 'function') return true
  const keys = Object.keys(o).sort().join(',')
  return keys === 'nanoseconds,seconds' || keys === '_nanoseconds,_seconds'
}

/** A value that is safe to put in jsonb: timestamps become ISO strings, undefined disappears. */
export function normalize(v: unknown): Json | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (isTimestampLike(v)) return toIso(v)
  if (Array.isArray(v)) return v.map((x) => normalize(x) ?? null)
  if (typeof v === 'object') {
    const out: { [key: string]: Json } = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const n = normalize(x)
      if (n !== undefined) out[k] = n
    }
    return out
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' || typeof v === 'boolean') return v
  return String(v)
}

/** undefined means "leave the column out" so the database default applies. */
function coerce(kind: Kind, v: unknown): unknown {
  if (v === null || v === undefined) return undefined
  switch (kind) {
    case 'text': return String(v)
    case 'int': {
      const n = Number(v)
      return Number.isFinite(n) ? Math.round(n) : undefined
    }
    case 'num': {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    case 'bool': return typeof v === 'boolean' ? v : undefined
    case 'ts': return toIso(v) ?? undefined
    case 'textArr':
      return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map(String) : undefined
    case 'json': return normalize(v)
  }
}

// ── References to people ────────────────────────────────────────────────────

export type UidRemap = (uid: string) => string

export function makeRemap(map: Record<string, string>): UidRemap {
  return (uid) => map[uid] ?? uid
}

const dedupe = <T,>(xs: T[]): T[] => Array.from(new Set(xs))

// ── One document -> one row ─────────────────────────────────────────────────

export interface TransformResult {
  row: Row
  /** Firestore fields that had no column and were kept in `extra`. */
  unmapped: string[]
}

export function transformDoc(
  spec: TableSpec,
  docId: string,
  raw: Record<string, unknown>,
  remap: UidRemap,
): TransformResult {
  let data: Record<string, unknown> = { ...raw }
  if (spec.preprocess) data = spec.preprocess(data)

  for (const f of spec.uidFields ?? []) {
    if (typeof data[f] === 'string') data[f] = remap(data[f] as string)
  }
  for (const f of spec.uidListFields ?? []) {
    const v = data[f]
    if (Array.isArray(v)) data[f] = dedupe(v.map((x) => (typeof x === 'string' ? remap(x) : x)))
  }

  const key = spec.id ? spec.id(docId, data) : docId

  if (spec.asJson) {
    const whole = normalize(data)
    return { row: { id: key, [spec.asJson]: whole ?? {} }, unmapped: [] }
  }

  const row: Row = {}
  const extra: { [key: string]: Json } = {}
  const unmapped: string[] = []

  for (const [field, value] of Object.entries(data)) {
    if (spec.selfIdFields?.includes(field)) continue
    const f = spec.fields[field]
    if (f) {
      const c = coerce(f.kind, value)
      if (c !== undefined) row[f.column] = c
    } else {
      const n = normalize(value)
      if (n !== undefined) {
        extra[field] = n
        unmapped.push(field)
      }
    }
  }

  // A key column that is also an ordinary field (notifications.uid, from the
  // parent path) is already set above; otherwise the key is the document id.
  const idColumn = spec.keyColumns[spec.keyColumns.length - 1]
  if (row[idColumn] === undefined) row[idColumn] = key
  if (spec.hasExtra && Object.keys(extra).length > 0) row.extra = extra

  return { row, unmapped }
}

// ── A whole collection ──────────────────────────────────────────────────────

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

// ── Per-collection specs ────────────────────────────────────────────────────

const fText = (column: string): FieldSpec => ({ column, kind: 'text' })
const fNum = (column: string): FieldSpec => ({ column, kind: 'num' })
const fInt = (column: string): FieldSpec => ({ column, kind: 'int' })
const fBool = (column: string): FieldSpec => ({ column, kind: 'bool' })
const fTs = (column: string): FieldSpec => ({ column, kind: 'ts' })
const fArr = (column: string): FieldSpec => ({ column, kind: 'textArr' })
const fJson = (column: string): FieldSpec => ({ column, kind: 'json' })

const ROLES = ['sale', 'team_lead', 'manager', 'super_admin'] as const
const STATUSES = ['not_started', 'in_progress', 'completed', 'failed'] as const

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export const USERS: TableSpec = {
  source: 'users', table: 'users', keyColumns: ['uid'], hasExtra: true,
  fields: {
    email: fText('email'), photoURL: fText('photo_url'), role: fText('role'),
    createdAt: fTs('created_at'), updatedAt: fTs('updated_at'),
    displayName: fText('display_name'), displayNameEN: fText('display_name_en'),
    nickname: fText('nickname'), employeeId: fText('employee_id'),
    department: fText('department'), position: fText('position'), rank: fText('rank'),
    lineManager: fText('line_manager'), startDate: fTs('start_date'),
    employmentStatus: fText('employment_status'),
    teamId: fText('team_id'), managerId: fText('manager_id'),
    visibleTeamIds: fArr('visible_team_ids'),
    mandatoryLastDepartments: fArr('mandatory_last_departments'),
  },
  selfIdFields: ['uid'],
  uidFields: ['managerId'],
  required: ['email'],
  allowed: { role: ROLES },
  recency: 'updated_at',
}

export const TEAMS: TableSpec = {
  source: 'teams', table: 'teams', keyColumns: ['id'], hasExtra: true,
  fields: {
    name: fText('name'), departmentId: fText('department_id'),
    managerIds: fArr('manager_ids'), teamLeadIds: fArr('team_lead_ids'),
  },
  selfIdFields: ['id'],
  // Older team documents carry a single managerId / teamLeadId. Every write now
  // uses the plural lists, so the singular ones are folded in and not carried over.
  preprocess: (data) => {
    const { managerId, teamLeadId, ...rest } = data
    return {
      ...rest,
      managerIds: dedupe([...asArray(data.managerIds), ...(typeof managerId === 'string' ? [managerId] : [])]),
      teamLeadIds: dedupe([...asArray(data.teamLeadIds), ...(typeof teamLeadId === 'string' ? [teamLeadId] : [])]),
    }
  },
  uidListFields: ['managerIds', 'teamLeadIds'],
  required: ['name'],
}

export const COURSES: TableSpec = {
  source: 'courses', table: 'courses', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), description: fText('description'), category: fText('category'), level: fText('level'),
    durationMinutes: fInt('duration_minutes'), thumbnailUrl: fText('thumbnail_url'),
    isRequired: fBool('is_required'), isPublished: fBool('is_published'),
    targetRoles: fArr('target_roles'), assignedUserIds: fArr('assigned_user_ids'),
    assignedDepartments: fArr('assigned_departments'), assignedTeamIds: fArr('assigned_team_ids'),
    startDate: fTs('start_date'), endDate: fTs('end_date'),
    slideUrl: fText('slide_url'), formUrl: fText('form_url'), introVideoUrl: fText('intro_video_url'),
    instructorId: fText('instructor_id'), courseAdminIds: fArr('course_admin_ids'),
    hasCertificate: fBool('has_certificate'), allowRetake: fBool('allow_retake'),
    hasKeyTakeAway: fBool('has_key_take_away'), keyTakeAwayPrompt: fText('key_take_away_prompt'),
    quizEnabled: fBool('quiz_enabled'), isChallenge: fBool('is_challenge'),
    challengeWindowStart: fTs('challenge_window_start'), challengeWindowEnd: fTs('challenge_window_end'),
    challengeMultiplier: fNum('challenge_multiplier'),
    topics: fJson('topics'), gradeBands: fJson('grade_bands'),
    createdBy: fText('created_by'), createdAt: fTs('created_at'), updatedAt: fTs('updated_at'),
  },
  uidFields: ['createdBy', 'instructorId'],
  uidListFields: ['assignedUserIds', 'courseAdminIds'],
  required: ['title', 'category', 'created_by'],
  allowed: {
    category: ['product', 'sales_skill', 'compliance', 'onboarding', 'leadership'],
    level: ['beginner', 'intermediate', 'expert'],
  },
}

export const ASSESSMENTS: TableSpec = {
  source: 'assessments', table: 'assessments', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), description: fText('description'), questions: fJson('questions'),
    googleFormUrl: fText('google_form_url'), isPublished: fBool('is_published'),
    passingScore: fInt('passing_score'), timeLimitMinutes: fInt('time_limit_minutes'),
    antiCheatEnabled: fBool('anti_cheat_enabled'), answerViewMode: fText('answer_view_mode'),
    createdBy: fText('created_by'), createdAt: fTs('created_at'), updatedAt: fTs('updated_at'),
  },
  uidFields: ['createdBy'],
  required: ['title', 'created_by'],
  allowed: { answer_view_mode: ['per_question', 'per_topic', 'all_in_one'] },
}

export const ASSESSMENT_SESSIONS: TableSpec = {
  source: 'assessmentSessions', table: 'assessment_sessions', keyColumns: ['id'], hasExtra: true,
  fields: {
    uid: fText('uid'), assessmentId: fText('assessment_id'), courseId: fText('course_id'),
    startedAt: fTs('started_at'), submittedAt: fTs('submitted_at'), timedOut: fBool('timed_out'),
    timeLimitMinutes: fInt('time_limit_minutes'), createdAt: fTs('created_at'),
  },
  uidFields: ['uid'],
  required: ['uid', 'assessment_id'],
}

export const ASSESSMENT_ATTEMPTS: TableSpec = {
  source: 'assessmentAttempts', table: 'assessment_attempts', keyColumns: ['id'], hasExtra: true,
  fields: {
    uid: fText('uid'), assessmentId: fText('assessment_id'), assessmentTitle: fText('assessment_title'),
    courseId: fText('course_id'), step: fText('step'), score: fNum('score'), passingScore: fNum('passing_score'),
    passed: fBool('passed'), pointsEarned: fNum('points_earned'), pointsPossible: fNum('points_possible'),
    attemptNumber: fInt('attempt_number'), answers: fJson('answers'),
    autoSubmitted: fBool('auto_submitted'), createdAt: fTs('created_at'),
  },
  uidFields: ['uid'],
  required: ['uid', 'assessment_id'],
  allowed: { step: ['pre', 'post'] },
}

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

export const TRAINING_RECORDS: TableSpec = {
  source: 'trainingRecords', table: 'training_records', keyColumns: ['id'], hasExtra: true,
  fields: {
    userId: fText('user_id'), memberName: fText('member_name'), courseId: fText('course_id'),
    courseTitle: fText('course_title'), status: fText('status'), score: fNum('score'),
    passScore: fNum('pass_score'), preTestScore: fNum('pre_test_score'), postTestScore: fNum('post_test_score'),
    attemptCount: fInt('attempt_count'), source: fText('source'), importBatchId: fText('import_batch_id'),
    completedLessonIds: fArr('completed_lesson_ids'), totalLessons: fInt('total_lessons'),
    startedAt: fTs('started_at'), completedAt: fTs('completed_at'), dueDate: fTs('due_date'),
    updatedAt: fTs('updated_at'),
  },
  uidFields: ['userId'],
  // The id embeds the person, so it is rebuilt from the surviving id — otherwise
  // a record kept under a retired id would no longer match the key the app
  // computes (`{uid}_{courseId}`) and the next sync would write a second one.
  id: (docId, data) =>
    typeof data.userId === 'string' && typeof data.courseId === 'string'
      ? `${data.userId}_${data.courseId}` : docId,
  required: ['user_id', 'course_id'],
  allowed: { status: STATUSES, source: ['manual', 'csv_import', 'google_form'] },
  recency: 'updated_at',
  merge: mergeTrainingRows,
}

export const USER_BUCKET_RESULTS: TableSpec = {
  source: 'userBucketResults', table: 'user_bucket_results', keyColumns: ['id'], hasExtra: true,
  fields: {
    uid: fText('uid'), definitionId: fText('definition_id'), code: fText('code'),
    courseId: fText('course_id'), takenAt: fTs('taken_at'), result: fJson('result'),
  },
  // The document carries the tallies as three loose fields; the table keeps them
  // together in one jsonb `result`, with `code` (the MBTI type) as its own column.
  preprocess: (data) => {
    const { dimensions, answered, total, ...rest } = data
    return { ...rest, result: { dimensions, answered, total } }
  },
  uidFields: ['uid'],
  id: (docId, data) =>
    typeof data.uid === 'string' && typeof data.definitionId === 'string'
      ? `${data.uid}_${data.definitionId}` : docId,
  required: ['uid', 'definition_id'],
  recency: 'taken_at',
}

export const TOOLS: TableSpec = {
  source: 'tools', table: 'tools', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), description: fText('description'), category: fText('category'), url: fText('url'),
    imageUrl: fText('image_url'), isPublished: fBool('is_published'), departments: fArr('departments'),
    createdAt: fTs('created_at'),
  },
  required: ['title'],
}

export const KNOWLEDGE_DECKS: TableSpec = {
  source: 'knowledgeDecks', table: 'knowledge_decks', keyColumns: ['id'], hasExtra: true,
  fields: { title: fText('title'), subtitle: fText('subtitle'), url: fText('url'), createdAt: fTs('created_at') },
  required: ['title'],
}

export const MANDATORY_ITEMS: TableSpec = {
  source: 'mandatoryItems', table: 'mandatory_items', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), description: fText('description'), slidesUrl: fText('slides_url'),
    weekLabel: fText('week_label'), isPublished: fBool('is_published'),
    departmentAccess: fJson('department_access'), publishedAt: fTs('published_at'),
    createdAt: fTs('created_at'), createdBy: fText('created_by'),
  },
  selfIdFields: ['id'],
  uidFields: ['createdBy'],
  required: ['title'],
}

export const RESOURCES: TableSpec = {
  source: 'resources', table: 'resources', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), description: fText('description'), type: fText('type'), category: fText('category'),
    url: fText('url'), imageUrl: fText('image_url'), tags: fArr('tags'), isPublic: fBool('is_public'),
    isPublished: fBool('is_published'), targetRoles: fArr('target_roles'),
    createdBy: fText('created_by'), createdAt: fTs('created_at'), updatedAt: fTs('updated_at'),
  },
  uidFields: ['createdBy'],
  required: ['title', 'created_by'],
  allowed: { type: ['pdf', 'video', 'link', 'document', 'playbook', 'sop'] },
}

export const CSV_IMPORTS: TableSpec = {
  source: 'csvImports', table: 'csv_imports', keyColumns: ['id'], hasExtra: true,
  fields: {
    type: fText('type'), courseId: fText('course_id'), courseTitle: fText('course_title'),
    fileName: fText('file_name'), totalRows: fInt('total_rows'), successRows: fInt('success_rows'),
    skippedRows: fInt('skipped_rows'), failedRows: fInt('failed_rows'),
    errors: fJson('errors'), importedAt: fTs('imported_at'),
  },
  selfIdFields: ['id'],
  required: [],
}

export const APP_CONFIG: TableSpec = {
  source: 'appConfig', table: 'app_config', keyColumns: ['id'], hasExtra: false,
  fields: {}, asJson: 'value', required: [],
}

/**
 * notifications live at notifications/{uid}/items/{id}. The owner is in the
 * PATH, not the document, so the runner hands it in as `__parentUid`. The
 * document id (`{type}_{refId}`) is unique only within one person's feed, which
 * is why the key is (uid, id).
 */
export const NOTIFICATIONS: TableSpec = {
  source: 'notifications', table: 'notifications', keyColumns: ['uid', 'id'], hasExtra: true,
  fields: {
    __parentUid: fText('uid'), type: fText('type'), title: fText('title'), body: fText('body'),
    read: fBool('read'), refId: fText('ref_id'), refPath: fText('ref_path'),
    createdAt: fTs('created_at'), createdByUid: fText('created_by_uid'),
  },
  uidFields: ['__parentUid', 'createdByUid'],
  required: ['uid', 'type'],
  recency: 'created_at',
}

/** In load order. users is built separately, through planUserMerge. */
export const SPECS: TableSpec[] = [
  TEAMS, COURSES, ASSESSMENTS, ASSESSMENT_SESSIONS, ASSESSMENT_ATTEMPTS, TRAINING_RECORDS,
  USER_BUCKET_RESULTS, TOOLS, KNOWLEDGE_DECKS, MANDATORY_ITEMS, RESOURCES, CSV_IMPORTS,
  APP_CONFIG, NOTIFICATIONS,
]

/** Leftovers from the cancelled PVP project; deliberately not migrated. */
export const SKIPPED_COLLECTIONS = ['pvpPrices', 'products', 'pvpSyncRuns'] as const
