import { describe, it, expect } from 'vitest'
import {
  canRead, canWrite, classify, changedKeys, resultingDoc, validId, knownCollection,
  type Actor, type Role, type WriteOp,
} from '@/lib/server/policies'
import type { Doc } from '@/lib/server/docMap'

// These are the access rules, now enforced by the server because nothing else
// stands between a request and the database. They were ported from
// firestore.rules, and almost every rule carries the history of a hole that was
// found and closed — so the cases here are the HOLES, not just the collections:
// a learner writing their own score, a manager granting themselves
// super_admin, one user overwriting another's reflection, a learner reading the
// answer key. A rule whose reason is forgotten is the first to be "simplified"
// away, and these are what stops that.

const actor = (role: Role, uid = `${role}-1`): Actor => ({ uid, role })
const SALE = actor('sale')
const LEAD = actor('team_lead')
const MGR = actor('manager')
const ADMIN = actor('super_admin')
const roles = [SALE, LEAD, MGR, ADMIN]

const doc = (id: string, fields: Record<string, unknown>): Doc => ({ id, ...fields })

interface Attempt {
  actor: Actor
  collection: string
  id: string
  existing?: Doc | null
  /** Fields written. For an update they are merged over `existing`. */
  data?: Record<string, unknown>
  /** True when the write removes the document. */
  remove?: boolean
  merge?: boolean
  parentUid?: string
}

/** Decide a write the way the data API will: derive the result, classify it, diff it, ask. */
function write(a: Attempt): boolean {
  const existing = a.existing ?? null
  const incoming = a.remove ? null : resultingDoc(existing, { id: a.id, ...(a.data ?? {}) }, a.merge ?? true)
  return canWrite({
    actor: a.actor, collection: a.collection, id: a.id, parentUid: a.parentUid,
    op: classify(existing, incoming) as WriteOp,
    existing, incoming, changed: changedKeys(existing, incoming),
  })
}

const read = (a: Actor, collection: string, parentUid?: string) => canRead({ actor: a, collection, parentUid })

// ── The pure helpers ────────────────────────────────────────────────────────

describe('changedKeys', () => {
  it('lists every field of a create', () => {
    expect(changedKeys(null, doc('a', { x: 1, y: 2 })).sort()).toEqual(['x', 'y'])
  })

  it('lists every field of a delete', () => {
    expect(changedKeys(doc('a', { x: 1 }), null)).toEqual(['x'])
  })

  it('lists only fields whose value differs on an update', () => {
    expect(changedKeys(doc('a', { x: 1, y: 2 }), doc('a', { x: 1, y: 3 }))).toEqual(['y'])
  })

  it('does not count a field written back unchanged', () => {
    // A client that re-sends a whole document must not trip a rule about a
    // field it did not alter.
    expect(changedKeys(doc('a', { score: 90, status: 'x' }), doc('a', { score: 90, status: 'y' }))).toEqual(['status'])
  })

  it('compares lists and objects by value, not by identity', () => {
    expect(changedKeys(doc('a', { l: [1, { k: 1 }] }), doc('a', { l: [1, { k: 1 }] }))).toEqual([])
    expect(changedKeys(doc('a', { l: [1, 2] }), doc('a', { l: [2, 1] }))).toEqual(['l'])
  })

  it('counts a removed field as changed', () => {
    expect(changedKeys(doc('a', { x: 1, y: 2 }), doc('a', { x: 1 }))).toEqual(['y'])
  })

  it('ignores the id', () => {
    expect(changedKeys(doc('a', { x: 1 }), doc('b', { x: 1 }))).toEqual([])
  })
})

describe('resultingDoc', () => {
  it('a merge lays the data over what is there', () => {
    expect(resultingDoc(doc('a', { x: 1, y: 2 }), { y: 3 }, true)).toEqual({ id: 'a', x: 1, y: 3 })
  })

  it('a replace is exactly the data', () => {
    expect(resultingDoc(doc('a', { x: 1, y: 2 }), { y: 3 }, false)).toEqual({ id: 'a', y: 3 })
  })

  it('a merge onto nothing is just the data', () => {
    expect(resultingDoc(null, { id: 'a', y: 3 }, true)).toEqual({ id: 'a', y: 3 })
  })
})

describe('classify', () => {
  it('reads create, update and delete from what is there and what will be', () => {
    expect(classify(null, doc('a', {}))).toBe('create')
    expect(classify(doc('a', {}), doc('a', {}))).toBe('update')
    expect(classify(doc('a', {}), null)).toBe('delete')
  })
})

describe('validId', () => {
  it.each(['abc', 'u1_course-2', 'csv-12345', 'a.b', 'new_course_x'])('accepts %s', (id) => {
    expect(validId(id)).toBe(true)
  })
  it.each([[''], ['a/b'], ['a\\b'], ['..'], ['.'], ['a\u0000b'], ['x'.repeat(301)], [undefined], [42], [null]])(
    'refuses %j', (id) => { expect(validId(id)).toBe(false) })
})

// ── Deny by default ─────────────────────────────────────────────────────────

describe('deny by default', () => {
  it('refuses a collection it has no entry for', () => {
    expect(knownCollection('_meta')).toBe(false)
    expect(read(ADMIN, '_meta')).toBe(false)
    expect(write({ actor: ADMIN, collection: '_meta', id: 'x', data: {} })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'nope', id: 'x', data: {} })).toBe(false)
  })

  it('refuses an operation a collection has no rule for — even to super_admin', () => {
    // userBucketResults is written only by the server; nobody, not even
    // super_admin, writes it through the client path.
    for (const a of roles) expect(write({ actor: a, collection: 'userBucketResults', id: 'x', data: { code: 'INFP' } })).toBe(false)
  })

  it('knows every collection the app uses', () => {
    for (const c of ['users', 'teams', 'courses', 'assessments', 'trainingRecords', 'userStats', 'userBucketResults',
      'tools', 'knowledgeDecks', 'cuisineGuides', 'mandatoryItems', 'announcements', 'resources', 'appConfig',
      'assessmentScores', 'shadowRecords', 'shadowAcknowledgments', 'roleplayAssessments', 'takeaways',
      'courseFeedback', 'notifications']) {
      expect(knownCollection(c), c).toBe(true)
    }
  })
})

// ── Content that only super_admin authors ───────────────────────────────────

describe.each(['courses', 'tools', 'mandatoryItems', 'cuisineGuides', 'resources', 'knowledgeDecks',
  'assessmentScores', 'announcements', 'appConfig'])('%s', (collection) => {
  it('is readable by everyone signed in', () => {
    for (const a of roles) expect(read(a, collection)).toBe(true)
  })

  it('is written only by super_admin', () => {
    const existing = doc('x', { title: 'T' })
    for (const a of [SALE, LEAD, MGR]) {
      expect(write({ actor: a, collection, id: 'x', data: { title: 'T' } }), `${a.role} create`).toBe(false)
      expect(write({ actor: a, collection, id: 'x', existing, data: { title: 'U' } }), `${a.role} update`).toBe(false)
      expect(write({ actor: a, collection, id: 'x', existing, remove: true }), `${a.role} delete`).toBe(false)
    }
    expect(write({ actor: ADMIN, collection, id: 'x', data: { title: 'T' } })).toBe(true)
    expect(write({ actor: ADMIN, collection, id: 'x', existing, data: { title: 'U' } })).toBe(true)
    expect(write({ actor: ADMIN, collection, id: 'x', existing, remove: true })).toBe(true)
  })
})

// ── The answer key ──────────────────────────────────────────────────────────

describe('assessments hold the answer key', () => {
  it('are readable only by super_admin — not by a learner, a lead or a manager', () => {
    // The hole: reads were open to any employee, who could pull the key for any
    // quiz, published or draft, before answering a single question.
    expect(read(SALE, 'assessments')).toBe(false)
    expect(read(LEAD, 'assessments')).toBe(false)
    expect(read(MGR, 'assessments')).toBe(false)
    expect(read(ADMIN, 'assessments')).toBe(true)
  })

  it('are written only by super_admin', () => {
    expect(write({ actor: MGR, collection: 'assessments', id: 'a', data: { title: 'T' } })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'assessments', id: 'a', data: { title: 'T' } })).toBe(true)
  })
})

describe('server-held records', () => {
  it.each(['assessmentAttempts', 'assessmentSessions', 'slackPosts'])('%s are closed to every actor', (c) => {
    for (const a of roles) {
      expect(read(a, c), `${a.role} read`).toBe(false)
      expect(write({ actor: a, collection: c, id: 'x', data: { a: 1 } }), `${a.role} write`).toBe(false)
    }
  })
})

// ── users ───────────────────────────────────────────────────────────────────

describe('users', () => {
  const me = actor('sale', 'me')
  const them = doc('them', { uid: 'them', role: 'sale', teamId: 't1', nickname: 'N' })
  const mine = doc('me', { uid: 'me', role: 'sale', teamId: 't1', nickname: 'N' })

  it('are readable by everyone signed in', () => {
    for (const a of roles) expect(read(a, 'users')).toBe(true)
  })

  describe('role is the privilege boundary', () => {
    it('a manager cannot grant themselves super_admin', () => {
      // The hole: any manager could write any user document, including their own role.
      const mgr = actor('manager', 'mgr')
      const own = doc('mgr', { uid: 'mgr', role: 'manager' })
      expect(write({ actor: mgr, collection: 'users', id: 'mgr', existing: own, data: { role: 'super_admin' } })).toBe(false)
    })

    it('a manager cannot change anyone else\'s role either', () => {
      expect(write({ actor: MGR, collection: 'users', id: 'them', existing: them, data: { role: 'manager' } })).toBe(false)
    })

    it('a super_admin can', () => {
      expect(write({ actor: ADMIN, collection: 'users', id: 'them', existing: them, data: { role: 'manager' } })).toBe(true)
    })

    it('a team_lead cannot change a role or a team', () => {
      expect(write({ actor: LEAD, collection: 'users', id: 'them', existing: them, data: { teamId: 't2' } })).toBe(false)
    })
  })

  it('a manager may reassign org structure', () => {
    expect(write({ actor: MGR, collection: 'users', id: 'them', existing: them, data: { teamId: 't2', managerId: 'm' } })).toBe(true)
    expect(write({ actor: MGR, collection: 'users', id: 'them', existing: them, data: { visibleTeamIds: ['t1'] } })).toBe(true)
  })

  it('a manager re-sending a user with the role unchanged is not changing the role', () => {
    expect(write({ actor: MGR, collection: 'users', id: 'them', existing: them, data: { role: 'sale', teamId: 't2' } })).toBe(true)
  })

  describe('the Slack member id decides who a DM goes to', () => {
    const ID = 'U01ABCDEF2'
    it('a super_admin may set it, and clear it', () => {
      expect(write({ actor: ADMIN, collection: 'users', id: 'them', existing: them, data: { slackUserId: ID } })).toBe(true)
      expect(write({ actor: ADMIN, collection: 'users', id: 'them', existing: them, data: { slackUserId: null } })).toBe(true)
    })
    it('a manager, a team lead and the person themselves may not', () => {
      expect(write({ actor: MGR, collection: 'users', id: 'them', existing: them, data: { slackUserId: ID } })).toBe(false)
      expect(write({ actor: LEAD, collection: 'users', id: 'them', existing: them, data: { slackUserId: ID } })).toBe(false)
      expect(write({ actor: me, collection: 'users', id: 'me', existing: mine, data: { slackUserId: ID } })).toBe(false)
    })
    it('must be an id, not free text, even from a super_admin', () => {
      for (const bad of ['hello', 'C01ABCDEF2', '<script>', 'u01abcdef2', 12345])
        expect(write({ actor: ADMIN, collection: 'users', id: 'them', existing: them, data: { slackUserId: bad } })).toBe(false)
    })
  })

  describe('a person editing themselves', () => {
    it('may change ordinary profile fields', () => {
      expect(write({ actor: me, collection: 'users', id: 'me', existing: mine, data: { nickname: 'New' } })).toBe(true)
    })

    it.each(['role', 'teamId', 'managerId', 'visibleTeamIds'])('may not change %s', (field) => {
      expect(write({ actor: me, collection: 'users', id: 'me', existing: mine, data: { [field]: field === 'visibleTeamIds' ? ['x'] : 'changed' } })).toBe(false)
    })

    it('may re-send those fields unchanged', () => {
      expect(write({ actor: me, collection: 'users', id: 'me', existing: mine, data: { role: 'sale', teamId: 't1', nickname: 'New' } })).toBe(true)
    })

    it('may not edit somebody else', () => {
      expect(write({ actor: me, collection: 'users', id: 'them', existing: them, data: { nickname: 'X' } })).toBe(false)
    })
  })

  describe('creating a user', () => {
    it('a person may create only their own row, as a plain sale', () => {
      expect(write({ actor: me, collection: 'users', id: 'me', data: { uid: 'me', role: 'sale', email: 'a@x' } })).toBe(true)
    })

    it('a person may not create themselves as an admin', () => {
      expect(write({ actor: me, collection: 'users', id: 'me', data: { uid: 'me', role: 'super_admin' } })).toBe(false)
    })

    it('a person may not create somebody else\'s row', () => {
      expect(write({ actor: me, collection: 'users', id: 'other', data: { uid: 'other', role: 'sale' } })).toBe(false)
    })

    it('a person may not create a row whose uid field disagrees with its id', () => {
      expect(write({ actor: me, collection: 'users', id: 'me', data: { uid: 'other', role: 'sale' } })).toBe(false)
    })

    it('a super_admin may create anyone (the HR import)', () => {
      expect(write({ actor: ADMIN, collection: 'users', id: 'csv-1', data: { uid: 'csv-1', role: 'sale', email: 'a@x' } })).toBe(true)
    })

    it('a manager may not create a user', () => {
      expect(write({ actor: MGR, collection: 'users', id: 'csv-1', data: { uid: 'csv-1', role: 'sale' } })).toBe(false)
    })
  })

  it('only super_admin may delete', () => {
    for (const a of [SALE, LEAD, MGR]) expect(write({ actor: a, collection: 'users', id: 'them', existing: them, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'users', id: 'them', existing: them, remove: true })).toBe(true)
  })
})

// ── training records ────────────────────────────────────────────────────────

describe('trainingRecords', () => {
  const me = actor('sale', 'me')
  const mine = doc('me_c1', { userId: 'me', courseId: 'c1', status: 'in_progress', score: 90, passScore: 70, attemptCount: 1 })
  const theirs = doc('them_c1', { userId: 'them', courseId: 'c1', status: 'in_progress' })

  it('are readable by everyone signed in', () => {
    for (const a of roles) expect(read(a, 'trainingRecords')).toBe(true)
  })

  describe('a score must come from grading, never from the learner', () => {
    // The hole: the only check was `userId == me`, so a learner could write
    // {status:'completed', score:100} and the fabricated score was
    // indistinguishable from a graded one in every report.
    it.each(['score', 'passScore', 'attemptCount'])('a learner cannot create a record carrying %s', (field) => {
      expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', data: { userId: 'me', courseId: 'c1', status: 'completed', [field]: 100 } })).toBe(false)
    })

    it.each(['score', 'passScore', 'attemptCount'])('a learner cannot change %s on their own record', (field) => {
      expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', existing: mine, data: { [field]: 100 } })).toBe(false)
    })

    it('a learner CAN report progress', () => {
      expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c2', data: { userId: 'me', courseId: 'c2', status: 'in_progress', completedLessonIds: ['l1'] } })).toBe(true)
      expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', existing: mine, data: { status: 'completed', completedLessonIds: ['l1', 'l2'] } })).toBe(true)
    })

    it('a learner re-sending the server\'s score unchanged is not writing a score', () => {
      // The browser re-sends whole documents; only a CHANGED score is the hole.
      expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', existing: mine, data: { status: 'completed', score: 90, passScore: 70, attemptCount: 1 } })).toBe(true)
    })
  })

  it('a learner cannot write a record for somebody else', () => {
    expect(write({ actor: me, collection: 'trainingRecords', id: 'them_c1', data: { userId: 'them', courseId: 'c1', status: 'completed' } })).toBe(false)
  })

  it('a learner cannot edit somebody else\'s record', () => {
    expect(write({ actor: me, collection: 'trainingRecords', id: 'them_c1', existing: theirs, data: { status: 'completed' } })).toBe(false)
  })

  it('a learner cannot reassign a record to somebody else, or take over theirs', () => {
    expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', existing: mine, data: { userId: 'them' } })).toBe(false)
    expect(write({ actor: me, collection: 'trainingRecords', id: 'them_c1', existing: theirs, data: { userId: 'me' } })).toBe(false)
  })

  it('a manager has no special right to write another person\'s record', () => {
    expect(write({ actor: MGR, collection: 'trainingRecords', id: 'them_c1', existing: theirs, data: { status: 'completed' } })).toBe(false)
  })

  it('only super_admin deletes', () => {
    expect(write({ actor: me, collection: 'trainingRecords', id: 'me_c1', existing: mine, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'trainingRecords', id: 'me_c1', existing: mine, remove: true })).toBe(true)
  })
})

// ── userStats, userBucketResults ────────────────────────────────────────────

describe('userStats', () => {
  it('is readable by everyone signed in', () => {
    for (const a of roles) expect(read(a, 'userStats')).toBe(true)
  })

  it('a person maintains their own, a super_admin anyone\'s', () => {
    const me = actor('sale', 'me')
    expect(write({ actor: me, collection: 'userStats', id: 'me', data: { totalCount: 1 } })).toBe(true)
    expect(write({ actor: me, collection: 'userStats', id: 'them', data: { totalCount: 99 } })).toBe(false)
    expect(write({ actor: MGR, collection: 'userStats', id: 'them', data: { totalCount: 1 } })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'userStats', id: 'them', data: { totalCount: 1 } })).toBe(true)
  })
})

describe('userBucketResults', () => {
  it('are readable by staff and writable by nobody here — only the server writes them', () => {
    // A result the person it describes can rewrite is not a result.
    for (const a of roles) expect(read(a, 'userBucketResults')).toBe(true)
  })
})

// ── teams ───────────────────────────────────────────────────────────────────

describe('teams', () => {
  it('are readable by everyone, written by manager and above', () => {
    for (const a of roles) expect(read(a, 'teams')).toBe(true)
    for (const a of [SALE, LEAD]) expect(write({ actor: a, collection: 'teams', id: 't', data: { name: 'T' } })).toBe(false)
    for (const a of [MGR, ADMIN]) expect(write({ actor: a, collection: 'teams', id: 't', data: { name: 'T' } })).toBe(true)
  })

  it('manager and above can delete', () => {
    const existing = doc('t', { name: 'T' })
    expect(write({ actor: LEAD, collection: 'teams', id: 't', existing, remove: true })).toBe(false)
    expect(write({ actor: MGR, collection: 'teams', id: 't', existing, remove: true })).toBe(true)
  })
})

// ── shadow visits ───────────────────────────────────────────────────────────

describe('shadowRecords', () => {
  const me = actor('sale', 'me')
  const mine = doc('s1', { observerUid: 'me', storeName: 'S' })
  const theirs = doc('s2', { observerUid: 'them', storeName: 'S' })

  it('an observation is authored BY the observer', () => {
    // The hole: any employee could create or edit an evaluation attributed to
    // someone else — including rewriting their own assessment.
    expect(write({ actor: me, collection: 'shadowRecords', id: 's1', data: { observerUid: 'me' } })).toBe(true)
    expect(write({ actor: me, collection: 'shadowRecords', id: 's1', data: { observerUid: 'them' } })).toBe(false)
  })

  it('the observer may edit their own, and may not hand it to someone else', () => {
    expect(write({ actor: me, collection: 'shadowRecords', id: 's1', existing: mine, data: { storeName: 'New' } })).toBe(true)
    expect(write({ actor: me, collection: 'shadowRecords', id: 's1', existing: mine, data: { observerUid: 'them' } })).toBe(false)
  })

  it('nobody edits another person\'s observation except super_admin', () => {
    expect(write({ actor: me, collection: 'shadowRecords', id: 's2', existing: theirs, data: { storeName: 'X' } })).toBe(false)
    expect(write({ actor: MGR, collection: 'shadowRecords', id: 's2', existing: theirs, data: { storeName: 'X' } })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'shadowRecords', id: 's2', existing: theirs, data: { storeName: 'X' } })).toBe(true)
  })

  it('only super_admin deletes', () => {
    expect(write({ actor: me, collection: 'shadowRecords', id: 's1', existing: mine, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'shadowRecords', id: 's1', existing: mine, remove: true })).toBe(true)
  })
})

describe('shadowAcknowledgments', () => {
  // A visit can have a review from each reviewer; the id names the visit AND the reviewer.
  const col = 'shadowAcknowledgments'
  const review = (reviewer: typeof LEAD, over: Record<string, unknown> = {}) => ({
    recordId: 'v1', reviewerUid: reviewer.uid, reviewerRole: reviewer.role, rating: 4, comment: 'good', ...over,
  })
  const idOf = (reviewer: typeof LEAD, recordId = 'v1') => `${recordId}__${reviewer.uid}`

  it('a team lead reviews a visit in their own name', () => {
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), data: review(LEAD) })).toBe(true)
  })

  it('and so does a manager — a second review of the same visit, not a replacement', () => {
    expect(write({ actor: MGR, collection: col, id: idOf(MGR), data: review(MGR) })).toBe(true)
    expect(idOf(MGR)).not.toBe(idOf(LEAD))
  })

  it('a learner cannot review, not even their own visit', () => {
    expect(write({ actor: SALE, collection: col, id: idOf(SALE), data: review(SALE) })).toBe(false)
  })

  it('a reviewer cannot sign as someone else', () => {
    expect(write({ actor: LEAD, collection: col, id: idOf(MGR), data: review(MGR) })).toBe(false)
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), data: review(LEAD, { reviewerUid: MGR.uid }) })).toBe(false)
  })

  it('the id must name the reviewer, so one cannot write over another’s review', () => {
    // Under the old scheme the id was just the visit, which is how a second review replaced the first.
    expect(write({ actor: MGR, collection: col, id: 'v1', data: review(MGR) })).toBe(false)
    expect(write({ actor: MGR, collection: col, id: idOf(LEAD), data: review(MGR) })).toBe(false)
  })

  it('the id must name the visit the review says it is for', () => {
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD, 'v2'), data: review(LEAD) })).toBe(false)
  })

  it('a review must say which visit it is for', () => {
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), data: review(LEAD, { recordId: undefined }) })).toBe(false)
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD, ''), data: review(LEAD, { recordId: '' }) })).toBe(false)
  })

  it.each([0, 6, -1, 3.5, '4', null])('stars must be a whole number from one to five, not %s', (rating) => {
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), data: review(LEAD, { rating }) })).toBe(false)
  })

  it.each([1, 2, 3, 4, 5])('accepts %s stars', (rating) => {
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), data: review(LEAD, { rating }) })).toBe(true)
  })

  it('a reviewer edits their own review', () => {
    const existing = doc(idOf(LEAD), review(LEAD))
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), existing, data: { rating: 5, comment: 'better' } })).toBe(true)
  })

  it('and cannot edit someone else’s', () => {
    const existing = doc(idOf(LEAD), review(LEAD))
    expect(write({ actor: MGR, collection: col, id: idOf(LEAD), existing, data: { rating: 1 } })).toBe(false)
  })

  it('only super_admin deletes', () => {
    const existing = doc(idOf(LEAD), review(LEAD))
    expect(write({ actor: LEAD, collection: col, id: idOf(LEAD), existing, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: col, id: idOf(LEAD), existing, remove: true })).toBe(true)
  })

  it('everyone signed in can read the reviews', () => {
    for (const a of roles) expect(read(a, col)).toBe(true)
  })
})

// ── roleplay ────────────────────────────────────────────────────────────────

describe('roleplayAssessments', () => {
  const lead = actor('team_lead', 'lead')
  const mine = doc('r1', { assessorUid: 'lead', subjectUid: 'learner' })
  const others = doc('r2', { assessorUid: 'someone-else', subjectUid: 'learner' })

  it('a learner cannot score anyone', () => {
    expect(write({ actor: SALE, collection: 'roleplayAssessments', id: 'r', data: { assessorUid: SALE.uid, subjectUid: 'x' } })).toBe(false)
  })

  it('nobody grades themselves', () => {
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r', data: { assessorUid: 'lead', subjectUid: 'lead' } })).toBe(false)
  })

  it('a lead scores in their own name', () => {
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r', data: { assessorUid: 'lead', subjectUid: 'learner' } })).toBe(true)
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r', data: { assessorUid: 'someone-else', subjectUid: 'learner' } })).toBe(false)
  })

  it('a lead edits only their own evaluation', () => {
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r1', existing: mine, data: { overallNote: 'x' } })).toBe(true)
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r2', existing: others, data: { overallNote: 'x' } })).toBe(false)
  })

  it('a lead cannot turn their own evaluation into a self-grade by editing it', () => {
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r1', existing: mine, data: { subjectUid: 'lead' } })).toBe(false)
  })

  it('a lead deletes only their own; super_admin anyone\'s', () => {
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r1', existing: mine, remove: true })).toBe(true)
    expect(write({ actor: lead, collection: 'roleplayAssessments', id: 'r2', existing: others, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'roleplayAssessments', id: 'r2', existing: others, remove: true })).toBe(true)
  })

  it('super_admin may create on anyone\'s behalf (the CSV import)', () => {
    expect(write({ actor: ADMIN, collection: 'roleplayAssessments', id: 'r', data: { assessorUid: 'import', subjectUid: 'x' } })).toBe(true)
  })
})

// ── notifications ───────────────────────────────────────────────────────────

describe('notifications', () => {
  const me = actor('sale', 'me')
  const feed = doc('new_course_c1', { type: 'new_course', read: false })

  it('a person reads their own feed, not someone else\'s', () => {
    expect(read(me, 'notifications', 'me')).toBe(true)
    expect(read(me, 'notifications', 'them')).toBe(false)
  })

  it('a manager has no right to read another person\'s feed; super_admin does', () => {
    expect(read(MGR, 'notifications', 'them')).toBe(false)
    expect(read(ADMIN, 'notifications', 'them')).toBe(true)
  })

  it('a feed cannot be read without naming whose it is', () => {
    expect(read(ADMIN, 'notifications', undefined)).toBe(false)
  })

  it('NOBODY creates a notification through this path, not even into their own feed', () => {
    // The hole: any employee could write into any other employee's feed with
    // arbitrary text and link — a ready-made internal phishing channel.
    // Creating is server-only (POST /api/notifications/push).
    for (const a of roles) {
      expect(write({ actor: a, collection: 'notifications', id: 'n', parentUid: a.uid, data: { type: 'x' } })).toBe(false)
      expect(write({ actor: a, collection: 'notifications', id: 'n', parentUid: 'someone-else', data: { type: 'x' } })).toBe(false)
    }
  })

  it('a person marks their own read and deletes their own', () => {
    expect(write({ actor: me, collection: 'notifications', id: 'n', parentUid: 'me', existing: feed, data: { read: true } })).toBe(true)
    expect(write({ actor: me, collection: 'notifications', id: 'n', parentUid: 'me', existing: feed, remove: true })).toBe(true)
  })

  it('a person cannot touch somebody else\'s', () => {
    expect(write({ actor: me, collection: 'notifications', id: 'n', parentUid: 'them', existing: feed, data: { read: true } })).toBe(false)
    expect(write({ actor: me, collection: 'notifications', id: 'n', parentUid: 'them', existing: feed, remove: true })).toBe(false)
  })

  it('super_admin may update and delete anyone\'s', () => {
    expect(write({ actor: ADMIN, collection: 'notifications', id: 'n', parentUid: 'them', existing: feed, data: { read: true } })).toBe(true)
  })
})

// ── takeaways ───────────────────────────────────────────────────────────────

describe('takeaways', () => {
  const me = actor('sale', 'me')

  it('are readable by staff — a lead reads their team\'s', () => {
    for (const a of roles) expect(read(a, 'takeaways')).toBe(true)
  })

  it('a person writes their own reflection', () => {
    expect(write({ actor: me, collection: 'takeaways', id: 'me_c1', data: { uid: 'me', text: 'x' } })).toBe(true)
  })

  it('a person cannot write into another person\'s document, even stamping their own uid inside', () => {
    // The hole: validating only `data.uid == me` let user A write to
    // `userB_course1` with their own uid inside, and destroy B's reflection.
    expect(write({ actor: me, collection: 'takeaways', id: 'them_c1', data: { uid: 'me', text: 'overwritten' } })).toBe(false)
  })

  it('a person cannot write their own id with someone else\'s uid inside', () => {
    expect(write({ actor: me, collection: 'takeaways', id: 'me_c1', data: { uid: 'them', text: 'x' } })).toBe(false)
  })

  it('an id that merely starts with the same letters is not theirs', () => {
    // 'me' must not unlock 'merchant_c1'.
    expect(write({ actor: me, collection: 'takeaways', id: 'merchant_c1', data: { uid: 'me', text: 'x' } })).toBe(false)
  })

  it('nobody deletes one', () => {
    for (const a of roles) {
      expect(write({ actor: a, collection: 'takeaways', id: `${a.uid}_c1`, existing: doc('x', { uid: a.uid }), remove: true })).toBe(false)
    }
  })

  it('an edit is held to the same rule', () => {
    expect(write({ actor: me, collection: 'takeaways', id: 'me_c1', existing: doc('me_c1', { uid: 'me', text: 'a' }), data: { text: 'b' } })).toBe(true)
    expect(write({ actor: me, collection: 'takeaways', id: 'them_c1', existing: doc('them_c1', { uid: 'them', text: 'a' }), data: { text: 'b' } })).toBe(false)
  })
})

// ── courseFeedback ──────────────────────────────────────────────────────────

describe('courseFeedback', () => {
  const lead = actor('team_lead', 'lead')

  it('a lead signs their own feedback', () => {
    expect(write({ actor: lead, collection: 'courseFeedback', id: 'm_c1', data: { leadUid: 'lead', comment: 'x' } })).toBe(true)
  })

  it('a lead cannot sign as another lead, so one cannot silently overwrite another\'s review', () => {
    expect(write({ actor: lead, collection: 'courseFeedback', id: 'm_c1', data: { leadUid: 'other-lead', comment: 'x' } })).toBe(false)
  })

  it('a learner writes none', () => {
    expect(write({ actor: SALE, collection: 'courseFeedback', id: 'm_c1', data: { leadUid: SALE.uid } })).toBe(false)
  })

  it('super_admin is unrestricted, because impersonation writes as the viewed user', () => {
    expect(write({ actor: ADMIN, collection: 'courseFeedback', id: 'm_c1', data: { leadUid: 'anyone' } })).toBe(true)
  })

  it('only super_admin deletes', () => {
    const existing = doc('m_c1', { leadUid: 'lead' })
    expect(write({ actor: lead, collection: 'courseFeedback', id: 'm_c1', existing, remove: true })).toBe(false)
    expect(write({ actor: ADMIN, collection: 'courseFeedback', id: 'm_c1', existing, remove: true })).toBe(true)
  })
})
