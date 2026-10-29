// Who may read and write what.
//
// WHERE THIS CAME FROM. firestore.rules used to be the gate: the browser talked
// to Firestore directly and the rules decided, per document, whether it was
// allowed. Postgres sits behind the server instead — every table has Row Level
// Security on with no policy, so nothing but the server's own key can touch it
// — which means the decision has to be made HERE, in code the server runs on
// every request. Nothing else stands between a request and the data.
//
// So this is a port, rule for rule, not a redesign. Several of those rules carry
// the history of a hole that was found and closed (a learner writing their own
// score, a manager granting themselves super_admin, one user overwriting
// another's reflection), and the comments below keep that reasoning, because a
// rule whose reason is lost is the first one to be "simplified" away.
//
// PURE: no database, no network. A decision is a function of who is asking, what
// they are asking for, and — for a write — what the document looked like before
// and what it would look like after. The callers (the data API) fetch the
// "before"; this file never does.
//
// DENY BY DEFAULT. A collection with no entry, an operation with no rule, and
// anything a rule does not explicitly allow is refused.

import type { Doc } from './docMap'

export type Role = 'sale' | 'team_lead' | 'manager' | 'super_admin'

/** The person making the request, already resolved from a verified token. */
export interface Actor {
  /** The stable person id — users.uid, NOT the Firebase uid. */
  uid: string
  role: Role
}

const RANK: Record<Role, number> = { sale: 1, team_lead: 2, manager: 3, super_admin: 4 }
const isSuper = (a: Actor) => a.role === 'super_admin'
const isManagerUp = (a: Actor) => RANK[a.role] >= RANK.manager
const isLeadUp = (a: Actor) => RANK[a.role] >= RANK.team_lead

// ── What a write does ───────────────────────────────────────────────────────

export type WriteOp = 'create' | 'update' | 'delete'

export interface WriteRequest {
  actor: Actor
  /** The collection name the app uses (`trainingRecords`, `notifications`, …). */
  collection: string
  /** For a notification, whose feed it is. */
  parentUid?: string
  id: string
  op: WriteOp
  /** The document before the write; null when there is none. */
  existing: Doc | null
  /** The document after the write; null for a delete. */
  incoming: Doc | null
  /** The fields this write actually changes (see changedKeys). */
  changed: string[]
}

export interface ReadRequest {
  actor: Actor
  collection: string
  parentUid?: string
}

/** The document that results from applying `data` to what is there. */
export function resultingDoc(existing: Doc | null, data: Record<string, unknown>, merge: boolean): Doc {
  const id = existing?.id ?? String(data.id ?? '')
  return merge ? ({ ...(existing ?? {}), ...data, id } as Doc) : ({ ...data, id } as Doc)
}

export function classify(existing: Doc | null, incoming: Doc | null): WriteOp {
  if (incoming === null) return 'delete'
  return existing === null ? 'create' : 'update'
}

/** Order-independent equality for JSON-shaped values. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((x, i) => same(x, bb[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
  return Array.from(keys).every((k) => same(ao[k], bo[k]))
}

/**
 * The fields a write changes — Firestore's `diff(resource.data).affectedKeys()`.
 * For a create that is every field supplied; for a delete, every field there was;
 * for an update, only the ones whose value is different (a field written back
 * unchanged is not a change, which matters: a client that re-sends a whole
 * document must not trip a rule about fields it did not alter).
 */
export function changedKeys(existing: Doc | null, incoming: Doc | null): string[] {
  const before = existing ?? {}
  const after = incoming ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  keys.delete('id')
  return Array.from(keys).filter((k) => !same((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k]))
}

const touches = (changed: string[], fields: string[]) => changed.some((k) => fields.includes(k))

// ── The rules ───────────────────────────────────────────────────────────────

interface Policy {
  /** May this actor read the collection? (Reads are by collection, not document.) */
  read: (a: Actor, r: ReadRequest) => boolean
  create?: (w: WriteRequest) => boolean
  update?: (w: WriteRequest) => boolean
  delete?: (w: WriteRequest) => boolean
}

const staffRead = () => true                     // every actor here is already verified staff
const never = () => false

/** Everyone signed in reads; only super_admin authors. (tools, courses, …) */
const superWrites: Pick<Policy, 'create' | 'update' | 'delete'> = {
  create: (w) => isSuper(w.actor),
  update: (w) => isSuper(w.actor),
  delete: (w) => isSuper(w.actor),
}

/** Fields the server owns on a training record: a score must come from grading, not from the learner. */
const SERVER_OWNED_RECORD_FIELDS = ['score', 'passScore', 'attemptCount']

/** Fields only a super_admin may change on a user. */
const SELF_PROTECTED_USER_FIELDS = ['role', 'teamId', 'managerId', 'visibleTeamIds']

const POLICIES: Record<string, Policy> = {
  // `role` is the privilege boundary of the whole app — ONLY super_admin may
  // change it. A manager may reassign org structure (teamId / managerId /
  // visibleTeamIds) but must not be able to grant a role, including their own:
  // the earlier rule let any manager write any user document unrestricted, which
  // let a manager set their own role to super_admin.
  users: {
    read: staffRead,
    create: (w) => isSuper(w.actor) ||
      (w.id === w.actor.uid && w.incoming?.role === 'sale' && w.incoming?.uid === w.id),
    update: (w) => isSuper(w.actor) ||
      (isManagerUp(w.actor) && !w.changed.includes('role')) ||
      (w.id === w.actor.uid && !touches(w.changed, SELF_PROTECTED_USER_FIELDS)),
    delete: (w) => isSuper(w.actor),
  },

  courses: { read: staffRead, ...superWrites },
  tools: { read: staffRead, ...superWrites },
  mandatoryItems: { read: staffRead, ...superWrites },
  cuisineGuides: { read: staffRead, ...superWrites },
  resources: { read: staffRead, ...superWrites },
  knowledgeDecks: { read: staffRead, ...superWrites },
  assessmentScores: { read: staffRead, ...superWrites },
  announcements: { read: staffRead, ...superWrites },
  appConfig: { read: staffRead, ...superWrites },

  // Answer keys live in these documents (`choices[].isCorrect`, the `dragPairs`
  // pairing itself), so reading is super_admin only — the authoring UI. This used
  // to be open to any employee, which meant anyone could pull the key for any
  // quiz, published or draft, before answering a single question. Learners never
  // read this collection: they take a quiz through GET /api/assessment/[id]/take,
  // which strips the key, and submit to POST /api/assessment/submit, which grades
  // on the server.
  assessments: { read: (a) => isSuper(a), ...superWrites },

  // Server-held records. The attempt audit trail stores the submitted answers
  // next to the grade, and the person being graded must not read the key
  // indirectly or rewrite their own history; the session is the server's clock
  // for a timed attempt, and if a learner could rewrite it the limit would be
  // advisory again. Only the server's own routes, which use the store directly,
  // ever touch these.
  assessmentAttempts: { read: never },
  assessmentSessions: { read: never },
  slackPosts: { read: never },

  trainingRecords: {
    read: staffRead,
    // A learner may report their own lesson progress (status, completedLessonIds)
    // but must never write `score`, `passScore` or `attemptCount` — those come
    // from POST /api/assessment/submit after the server grades the answers.
    // Without this the only check was `userId == me`: a learner could write
    // {status:'completed', score:100} directly and the fabricated score would be
    // indistinguishable from a graded one in every report.
    //
    // Still open, and unchanged by the move: `status` is client-attested, because
    // course completion is assembled from lesson ticks only the browser sees. A
    // learner can still mark a course complete, but cannot award themselves a score.
    create: (w) => w.incoming?.userId === w.actor.uid &&
      !Object.keys(w.incoming ?? {}).some((k) => SERVER_OWNED_RECORD_FIELDS.includes(k)),
    update: (w) => w.existing?.userId === w.actor.uid && w.incoming?.userId === w.actor.uid &&
      !touches(w.changed, SERVER_OWNED_RECORD_FIELDS),
    delete: (w) => isSuper(w.actor),
  },

  // Results of bucket assessments (MBTI, selling style). Written ONLY by the
  // server in POST /api/personality/submit: a result the person it describes
  // can rewrite is not a result. Readable by staff so a manager can see their
  // team's results beside the learner's own profile card.
  userBucketResults: { read: staffRead },

  // A user maintains only their own summary; super_admin (the rebuild) any.
  userStats: {
    read: staffRead,
    create: (w) => w.id === w.actor.uid || isSuper(w.actor),
    update: (w) => w.id === w.actor.uid || isSuper(w.actor),
    delete: (w) => w.id === w.actor.uid || isSuper(w.actor),
  },

  teams: {
    read: staffRead,
    create: (w) => isManagerUp(w.actor),
    update: (w) => isManagerUp(w.actor),
    delete: (w) => isManagerUp(w.actor),
  },

  // An observation is authored BY the observer, so the writer must stamp itself
  // as observerUid. Previously any employee could create or edit an evaluation
  // attributed to someone else — including rewriting their own assessment.
  shadowRecords: {
    read: staffRead,
    create: (w) => w.incoming?.observerUid === w.actor.uid,
    update: (w) => isSuper(w.actor) ||
      (w.existing?.observerUid === w.actor.uid && w.incoming?.observerUid === w.actor.uid),
    delete: (w) => isSuper(w.actor),
  },

  // A team_lead/manager's sign-off on a member's shadow visit; the id is the
  // record it acknowledges. The reviewer must stamp themselves as reviewerUid —
  // the same self-attribution guard as observerUid above.
  shadowAcknowledgments: {
    read: staffRead,
    create: (w) => isLeadUp(w.actor) && w.incoming?.reviewerUid === w.actor.uid,
    update: (w) => isLeadUp(w.actor) && w.incoming?.reviewerUid === w.actor.uid,
    delete: (w) => isSuper(w.actor),
  },

  // Scored assessments, from two sources: the super_admin CSV import (which goes
  // through the server directly) and the in-app assessor form. Opening the form
  // to writes carries the risk of a learner scoring their own roleplay, so three
  // things are enforced rather than one: the writer is team_lead or above; the
  // `assessorUid` is the caller, so a score is always attributable; and the
  // assessor is not the subject, so nobody grades themselves. Edits are limited
  // to the assessor who made the record; only a super_admin can rewrite or
  // remove someone else's.
  roleplayAssessments: {
    read: staffRead,
    create: (w) => isSuper(w.actor) ||
      (isLeadUp(w.actor) && w.incoming?.assessorUid === w.actor.uid && w.incoming?.subjectUid !== w.actor.uid),
    update: (w) => isSuper(w.actor) ||
      (isLeadUp(w.actor) && w.existing?.assessorUid === w.actor.uid &&
        w.incoming?.assessorUid === w.actor.uid && w.incoming?.subjectUid !== w.actor.uid),
    delete: (w) => isSuper(w.actor) || (isLeadUp(w.actor) && w.existing?.assessorUid === w.actor.uid),
  },

  // A per-person feed. Creating a notification is SERVER-ONLY (POST
  // /api/notifications/push): this used to be open to any employee, so anyone
  // could write into anyone's feed with arbitrary text and link — a ready-made
  // internal phishing channel. Recipients keep read, mark-read and delete on
  // their own feed.
  //
  // Every notification belongs to a feed, so a request that does not say whose
  // is refused outright rather than treated as "everyone's" — the path layer
  // already refuses one, and this does not rely on that.
  notifications: {
    read: (a, r) => r.parentUid !== undefined && (r.parentUid === a.uid || isSuper(a)),
    create: never,
    update: (w) => w.parentUid !== undefined && (w.parentUid === w.actor.uid || isSuper(w.actor)),
    delete: (w) => w.parentUid !== undefined && (w.parentUid === w.actor.uid || isSuper(w.actor)),
  },

  // The learner writes their own reflection, and the id must be checked as well
  // as the payload: checking only `uid` inside the document let user A write to
  // `userB_course1` (with their own uid inside) and destroy B's reflection.
  takeaways: {
    read: staffRead,
    create: (w) => w.incoming?.uid === w.actor.uid && w.id.startsWith(`${w.actor.uid}_`),
    update: (w) => w.incoming?.uid === w.actor.uid && w.id.startsWith(`${w.actor.uid}_`),
  },

  // A lead's comment and score on a member. A lead must sign their own feedback
  // (leadUid is the caller), so one lead cannot silently overwrite another's.
  // super_admin stays unrestricted because impersonation writes as the viewed user.
  courseFeedback: {
    read: staffRead,
    create: (w) => isSuper(w.actor) || (isLeadUp(w.actor) && w.incoming?.leadUid === w.actor.uid),
    update: (w) => isSuper(w.actor) || (isLeadUp(w.actor) && w.incoming?.leadUid === w.actor.uid),
    delete: (w) => isSuper(w.actor),
  },
}

// ── Decisions ───────────────────────────────────────────────────────────────

export function canRead(r: ReadRequest): boolean {
  const policy = POLICIES[r.collection]
  return policy ? policy.read(r.actor, r) : false
}

export function canWrite(w: WriteRequest): boolean {
  const rule = POLICIES[w.collection]?.[w.op]
  return rule ? rule(w) : false
}

// ── What a reader gets to see of a document they may read ───────────────────
//
// canRead says whether a collection can be read at all. A learner (role `sale`) may
// read the employee list — leaderboards, picking a mentor — but not everything HR
// holds about their colleagues, so what comes back is cut down on the server. Hiding
// a field in the page would leave it in the response.

/** What a learner sees of someone else. Everything else on the profile is withheld. */
export const COLLEAGUE_PROFILE_FIELDS = [
  'id', 'uid', 'displayName', 'displayNameEN', 'nickname', 'photoURL',
  'department', 'position', 'teamId', 'role', 'employmentStatus',
] as const

const isLearner = (a: Actor) => a.role === 'sale'

/**
 * The view of one document this actor may have, or null when they may not have it.
 * Teams, courses and the rest pass through untouched.
 */
export function viewOf(actor: Actor, collection: string, doc: Record<string, unknown> & { id: string }): (Record<string, unknown> & { id: string }) | null {
  if (!isLearner(actor)) return doc

  if (collection === 'users' && doc.id !== actor.uid) {
    const slim: Record<string, unknown> = {}
    for (const f of COLLEAGUE_PROFILE_FIELDS) if (doc[f] !== undefined) slim[f] = doc[f]
    return slim as Record<string, unknown> & { id: string }
  }

  // Imported scores: a learner sees only their own.
  if (collection === 'assessmentScores') return doc.uid === actor.uid ? doc : null

  return doc
}

/**
 * Can this actor filter or sort a query on these fields? For a learner reading the
 * employee list, only on what they can see: otherwise `email == x` would confirm
 * who has an address they are not allowed to read.
 */
export function queryFieldsAllowed(actor: Actor, collection: string, fields: string[]): boolean {
  if (!isLearner(actor) || collection !== 'users') return true
  const visible = new Set<string>(COLLEAGUE_PROFILE_FIELDS)
  return fields.every((f) => visible.has(f))
}

/** A document id is a path segment and a key: refuse anything that could be neither. */
export function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 300 &&
    !/[\u0000-\u001f/\\]/.test(id) && id !== '.' && id !== '..'
}

/** The collections a client may name at all — anything else is refused before any rule is consulted. */
export function knownCollection(name: string): boolean {
  return name in POLICIES
}
