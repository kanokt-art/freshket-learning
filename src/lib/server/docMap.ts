// How a Firestore-shaped document maps to a Postgres row, and back.
//
// THE REASON THIS EXISTS. The whole app speaks in documents: camelCase fields,
// an `id`, dates as Dates, optional fields simply absent. Rather than rewrite
// every page and type for Postgres, the data layer keeps presenting documents
// and this module is the one place that knows they are stored as rows. A page
// that asks for `courses` still gets `{ id, title, createdAt, ... }`.
//
// PURE, AND IT IMPORTS NOTHING. No database, no network, no framework. That is
// what lets it be unit-tested exhaustively, and it is also why the one-off
// migration script (scripts/migrate) can load it directly under Node. Anything
// that talks to Postgres lives in store.ts; every decision about what a
// document or a row looks like lives here.
//
// Each table has a TableSpec: which document field is which column, what kind
// of value it holds, which fields name a person, and what Postgres will refuse.
// Fields with no column are not lost: they are kept in the table's `extra`
// jsonb and put back on the way out.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Row = Record<string, unknown>
export type Kind = 'text' | 'int' | 'num' | 'bool' | 'ts' | 'textArr' | 'json'

/** A document as the app sees it: its id, plus fields. */
export interface Doc {
  id: string
  [field: string]: unknown
}

export interface SourceDoc {
  id: string
  data: Record<string, unknown>
}

export interface FieldSpec {
  column: string
  kind: Kind
}

export interface TableSpec {
  /** The Firestore collection name the app uses for this table. */
  source: string
  table: string
  /** Columns that form the primary key, in order. They are the upsert conflict target. */
  keyColumns: string[]
  /** Document field -> column. Anything not listed goes to `extra`. */
  fields: Record<string, FieldSpec>
  /** Whether the table has an `extra` column to catch unlisted fields. */
  hasExtra: boolean
  /** Columns that are NOT NULL with no default — a row without one is rejected. */
  required: string[]
  /** CHECK constraints: column -> the values it may hold. */
  allowed?: Record<string, readonly string[]>
  /** Document fields that hold ONE uid / a LIST of uids, re-pointed through a merge map. */
  uidFields?: string[]
  uidListFields?: string[]
  /** Document fields that merely repeat the id; not stored, and put back on the way out. */
  selfIdFields?: string[]
  /** Reshape a document before anything else (fold legacy fields, regroup). */
  preprocess?: (data: Record<string, unknown>) => Record<string, unknown>
  /** Reshape a document on the way OUT (undo what preprocess regrouped). */
  postprocess?: (doc: Doc) => Doc
  /** Build the primary-key value from the (already re-pointed) document. */
  id?: (docId: string, data: Record<string, unknown>) => string
  /** Store the whole document as one jsonb column instead of mapping fields. */
  asJson?: string
  /** Column used to pick a winner when two documents collapse onto one key. */
  recency?: string
  /** Combine two rows that collapse onto one key (migration only). */
  merge?: (kept: Row, incoming: Row) => Row
}

// ── Values ──────────────────────────────────────────────────────────────────

/**
 * Any of the shapes a date arrives in -> an ISO string, or null.
 *
 * Needed because `users.createdAt` really does come in three: Firestore
 * Timestamps, ISO strings (the CSV importer wrote its own JSON-serialised
 * Date), and a plain `{seconds, nanoseconds}` object.
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

export const identityRemap: UidRemap = (uid) => uid

export const dedupe = <T,>(xs: T[]): T[] => Array.from(new Set(xs))

// ── Document -> row ─────────────────────────────────────────────────────────

export interface TransformResult {
  row: Row
  /** Document fields that had no column and were kept in `extra`. */
  unmapped: string[]
}

export function transformDoc(
  spec: TableSpec,
  docId: string,
  raw: Record<string, unknown>,
  remap: UidRemap = identityRemap,
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

// ── Row -> document ─────────────────────────────────────────────────────────

/** column -> document field, the inverse of spec.fields. */
function inverseFields(spec: TableSpec): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, f] of Object.entries(spec.fields)) out[f.column] = field
  return out
}

/**
 * A stored row back into the document the app expects.
 *
 *  · nulls are left out. Firestore documents simply lacked a field that was
 *    unset, and the app tests for absence; a null column is the same thing.
 *  · fields kept in `extra` are put back at the top level, without overriding a
 *    real column.
 *  · fields that only repeat the id (users.uid, teams.id) are restored.
 *  · timestamps stay ISO strings. The caller is told which fields are dates
 *    (dateFieldsOf) so the browser can turn them into Dates — JSON cannot
 *    carry one.
 */
export function rowToDoc(spec: TableSpec, row: Row): Doc {
  const idColumn = spec.keyColumns[spec.keyColumns.length - 1]
  const id = String(row[idColumn])

  if (spec.asJson) {
    const value = row[spec.asJson]
    const body = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
    return { ...body, id }
  }

  const inverse = inverseFields(spec)
  const doc: Doc = { id }

  for (const [column, value] of Object.entries(row)) {
    if (value === null || value === undefined || column === 'extra') continue
    const field = inverse[column]
    if (field !== undefined) doc[field] = value
  }
  for (const f of spec.selfIdFields ?? []) doc[f] = id

  const extra = row.extra
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
      if (!(k in doc)) doc[k] = v
    }
  }

  return spec.postprocess ? spec.postprocess(doc) : doc
}

/** Document fields whose values are dates, so a caller can revive them after JSON. */
export function dateFieldsOf(spec: TableSpec): string[] {
  return Object.entries(spec.fields).filter(([, f]) => f.kind === 'ts').map(([field]) => field)
}

/**
 * The column a document field lives in, for building a query. `id` is the key,
 * and so is a self-id field like users.uid. Returns null for a field the table
 * does not store — a caller must refuse the query, not guess.
 */
export function columnFor(spec: TableSpec, field: string): string | null {
  const keyColumn = spec.keyColumns[spec.keyColumns.length - 1]
  if (field === 'id' || spec.selfIdFields?.includes(field)) return keyColumn
  return spec.fields[field]?.column ?? null
}

/** Every column a full replace must name, so anything not supplied reverts to its default. */
export function allColumns(spec: TableSpec): string[] {
  const cols = new Set<string>([...spec.keyColumns, ...Object.values(spec.fields).map((f) => f.column)])
  if (spec.hasExtra) cols.add('extra')
  if (spec.asJson) cols.add(spec.asJson)
  return Array.from(cols)
}

// ── Per-collection specs ────────────────────────────────────────────────────

const fText = (column: string): FieldSpec => ({ column, kind: 'text' })
const fNum = (column: string): FieldSpec => ({ column, kind: 'num' })
const fInt = (column: string): FieldSpec => ({ column, kind: 'int' })
const fBool = (column: string): FieldSpec => ({ column, kind: 'bool' })
const fTs = (column: string): FieldSpec => ({ column, kind: 'ts' })
const fArr = (column: string): FieldSpec => ({ column, kind: 'textArr' })
const fJson = (column: string): FieldSpec => ({ column, kind: 'json' })

export const ROLES = ['sale', 'team_lead', 'manager', 'super_admin'] as const
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
  // Each list is only touched when the document mentions it: a partial update
  // that sets managerIds must not blank teamLeadIds.
  preprocess: (data) => {
    const { managerId, teamLeadId, ...rest } = data
    const out: Record<string, unknown> = { ...rest }
    if (data.managerIds !== undefined || managerId !== undefined) {
      out.managerIds = dedupe([...asArray(data.managerIds), ...(typeof managerId === 'string' ? [managerId] : [])])
    }
    if (data.teamLeadIds !== undefined || teamLeadId !== undefined) {
      out.teamLeadIds = dedupe([...asArray(data.teamLeadIds), ...(typeof teamLeadId === 'string' ? [teamLeadId] : [])])
    }
    return out
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
}

export const USER_STATS: TableSpec = {
  source: 'userStats', table: 'user_stats', keyColumns: ['uid'], hasExtra: false,
  fields: {
    totalCount: fInt('total_count'), completedCount: fInt('completed_count'),
    scoreSum: fNum('score_sum'), scoredCount: fInt('scored_count'), updatedAt: fTs('updated_at'),
  },
  selfIdFields: ['uid'],
  required: [],
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
  postprocess: (doc) => {
    const { result, ...rest } = doc
    return { ...rest, ...(result && typeof result === 'object' ? (result as Record<string, unknown>) : {}) } as Doc
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

export const CUISINE_GUIDES: TableSpec = {
  source: 'cuisineGuides', table: 'cuisine_guides', keyColumns: ['id'], hasExtra: true,
  fields: {
    name: fText('name'), description: fText('description'), coverUrl: fText('cover_url'),
    isPublished: fBool('is_published'), skus: fJson('skus'),
    createdAt: fTs('created_at'), updatedAt: fTs('updated_at'), createdBy: fText('created_by'),
  },
  uidFields: ['createdBy'],
  required: [],
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

export const ANNOUNCEMENTS: TableSpec = {
  source: 'announcements', table: 'announcements', keyColumns: ['id'], hasExtra: true,
  fields: {
    title: fText('title'), body: fText('body'), imageUrl: fText('image_url'),
    isPublished: fBool('is_published'), targetRoles: fArr('target_roles'),
    targetDepartments: fArr('target_departments'), authorName: fText('author_name'),
    createdBy: fText('created_by'), createdAt: fTs('created_at'),
    updatedAt: fTs('updated_at'), updatedBy: fText('updated_by'),
  },
  uidFields: ['createdBy', 'updatedBy'],
  required: ['title', 'created_by'],
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

export const ASSESSMENT_SCORES: TableSpec = {
  source: 'assessmentScores', table: 'assessment_scores', keyColumns: ['id'], hasExtra: true,
  fields: {
    uid: fText('uid'), email: fText('email'), subject: fText('subject'), type: fText('type'),
    score: fNum('score'), total: fNum('total'), pct: fNum('pct'),
    takenAt: fTs('taken_at'), createdAt: fTs('created_at'),
  },
  uidFields: ['uid'],
  required: ['uid', 'email', 'subject', 'type', 'taken_at'],
  allowed: { type: ['pre', 'post'] },
}

export const SHADOW_RECORDS: TableSpec = {
  source: 'shadowRecords', table: 'shadow_records', keyColumns: ['id'], hasExtra: true,
  fields: {
    observerUid: fText('observer_uid'), observerEmail: fText('observer_email'),
    observerName: fText('observer_name'), mentorName: fText('mentor_name'),
    mentorPosition: fText('mentor_position'), storeName: fText('store_name'),
    segment: fText('segment'), persona: fText('persona'),
    opening: fText('opening'), interestPoint: fText('interest_point'),
    customerPain: fText('customer_pain'), diagnosticApproach: fText('diagnostic_approach'),
    closingNextStep: fText('closing_next_step'), bestPractice: fText('best_practice'),
    beyondClassroom: fText('beyond_classroom'), evaluatorEmail: fText('evaluator_email'),
    ratingScore: fNum('rating_score'), evaluationFeedback: fText('evaluation_feedback'),
    createdAt: fTs('created_at'), updatedAt: fTs('updated_at'),
  },
  uidFields: ['observerUid'],
  required: ['observer_uid'],
}

export const SHADOW_ACKNOWLEDGMENTS: TableSpec = {
  source: 'shadowAcknowledgments', table: 'shadow_acknowledgments', keyColumns: ['id'], hasExtra: true,
  fields: {
    reviewerUid: fText('reviewer_uid'), reviewerName: fText('reviewer_name'),
    rating: fInt('rating'), comment: fText('comment'), reviewedAt: fTs('reviewed_at'),
  },
  uidFields: ['reviewerUid'],
  required: ['reviewer_uid'],
}

export const ROLEPLAY_ASSESSMENTS: TableSpec = {
  source: 'roleplayAssessments', table: 'roleplay_assessments', keyColumns: ['id'], hasExtra: true,
  fields: {
    assessorUid: fText('assessor_uid'), assessorName: fText('assessor_name'),
    assessorRole: fText('assessor_role'), subjectUid: fText('subject_uid'),
    subjectName: fText('subject_name'), subjectTeam: fText('subject_team'),
    round: fInt('round'), type: fText('type'), overallNote: fText('overall_note'),
    topics: fJson('topics'), createdAt: fTs('created_at'),
  },
  uidFields: ['assessorUid', 'subjectUid'],
  required: ['assessor_uid', 'subject_uid'],
  allowed: { type: ['pre', 'post'] },
}

export const TAKEAWAYS: TableSpec = {
  source: 'takeaways', table: 'takeaways', keyColumns: ['id'], hasExtra: true,
  fields: {
    uid: fText('uid'), courseId: fText('course_id'), courseTitle: fText('course_title'),
    text: fText('text'), updatedAt: fTs('updated_at'),
  },
  uidFields: ['uid'],
  required: ['uid', 'course_id'],
}

export const COURSE_FEEDBACK: TableSpec = {
  source: 'courseFeedback', table: 'course_feedback', keyColumns: ['id'], hasExtra: true,
  fields: {
    memberUid: fText('member_uid'), courseId: fText('course_id'), comment: fText('comment'),
    score: fNum('score'), leadUid: fText('lead_uid'), leadName: fText('lead_name'),
    updatedAt: fTs('updated_at'),
  },
  uidFields: ['memberUid', 'leadUid'],
  required: ['course_id'],
}

export const SLACK_POSTS: TableSpec = {
  source: 'slackPosts', table: 'slack_posts', keyColumns: ['id'], hasExtra: false,
  fields: {
    kind: fText('kind'), refId: fText('ref_id'), channel: fText('channel'),
    postedAt: fTs('posted_at'), payload: fJson('payload'),
  },
  required: [],
}

/**
 * notifications live at notifications/{uid}/items/{id}. The owner is in the
 * PATH, not the document, so callers hand it in as `__parentUid`. The document
 * id (`{type}_{refId}`) is unique only within one person's feed, which is why
 * the key is (uid, id).
 */
export const NOTIFICATIONS: TableSpec = {
  source: 'notifications', table: 'notifications', keyColumns: ['uid', 'id'], hasExtra: true,
  fields: {
    __parentUid: fText('uid'), type: fText('type'), title: fText('title'), body: fText('body'),
    read: fBool('read'), refId: fText('ref_id'), refPath: fText('ref_path'),
    createdAt: fTs('created_at'), createdByUid: fText('created_by_uid'),
  },
  // The owner is the path, not a field of the document the app sees.
  postprocess: (doc) => {
    const { __parentUid, ...rest } = doc
    void __parentUid
    return rest as Doc
  },
  uidFields: ['__parentUid', 'createdByUid'],
  required: ['uid', 'type'],
  recency: 'created_at',
}

/** Every table except users, in load order. */
export const SPECS: TableSpec[] = [
  TEAMS, COURSES, ASSESSMENTS, ASSESSMENT_SESSIONS, ASSESSMENT_ATTEMPTS, TRAINING_RECORDS,
  USER_STATS, USER_BUCKET_RESULTS, TOOLS, KNOWLEDGE_DECKS, CUISINE_GUIDES, MANDATORY_ITEMS,
  ANNOUNCEMENTS, RESOURCES, CSV_IMPORTS, APP_CONFIG, ASSESSMENT_SCORES, SHADOW_RECORDS,
  SHADOW_ACKNOWLEDGMENTS, ROLEPLAY_ASSESSMENTS, TAKEAWAYS, COURSE_FEEDBACK, SLACK_POSTS, NOTIFICATIONS,
]

const BY_COLLECTION = new Map<string, TableSpec>([USERS, ...SPECS].map((s) => [s.source, s]))

/**
 * Resolve a collection path the app uses to its spec. `notifications/{uid}/items`
 * is a subcollection: the first segment names the table and the second is the
 * owner. Anything else with a slash is refused rather than guessed at.
 */
export function resolveCollection(path: string): { spec: TableSpec; parentUid?: string } | null {
  const parts = path.split('/')
  if (parts.length === 1) {
    const spec = BY_COLLECTION.get(parts[0])
    return spec && spec !== NOTIFICATIONS ? { spec } : null
  }
  if (parts.length === 3 && parts[0] === 'notifications' && parts[2] === 'items' && parts[1]) {
    return { spec: NOTIFICATIONS, parentUid: parts[1] }
  }
  return null
}
