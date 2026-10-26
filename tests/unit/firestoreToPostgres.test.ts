import { describe, it, expect } from 'vitest'
import {
  toIso, normalize, makeRemap, transformDoc, buildTable, planUserMerge, buildUserRows,
  deriveUserStats, mergeTrainingRows, SPECS, SKIPPED_COLLECTIONS,
  USERS, TEAMS, COURSES, TRAINING_RECORDS, USER_BUCKET_RESULTS, MANDATORY_ITEMS,
  NOTIFICATIONS, APP_CONFIG,
  type SourceDoc,
} from '../../scripts/migrate/firestoreToPostgres'
import { computeUserStats } from '@/types/stats'

// The Firestore -> Postgres conversion, tested without Firestore.
//
// WHY THESE CASES. Almost every one is a thing that was found in the real data
// or decided about it, not an abstract property:
//
//  · users.createdAt arrives as a Timestamp (52), an ISO string (1,605) and a
//    plain {seconds, nanoseconds} object (1) — all three must come out the same.
//  · five courses carry legacy fields no type mentions; they must be kept, and
//    counted, rather than dropped.
//  · training-record and bucket-result ids embed the person, so they have to be
//    rebuilt when the person's id changes.
//  · notification ids are unique only per person.
//  · the merge rules for people stored twice — in particular that a merge can
//    never demote someone, because one real pair has a login row with a higher
//    role than its HR row.

const NOW = '2026-10-26T00:00:00.000Z'
const identity = makeRemap({})
const doc = (id: string, data: Record<string, unknown>): SourceDoc => ({ id, data })

// ── Values ──────────────────────────────────────────────────────────────────

describe('toIso', () => {
  const sec = Date.UTC(2026, 0, 2, 3, 4, 5) / 1000

  it('passes an ISO string through, normalised', () => {
    expect(toIso('2026-01-02T03:04:05.000Z')).toBe('2026-01-02T03:04:05.000Z')
  })

  it('reads a Date', () => {
    expect(toIso(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z')
  })

  it('reads a Firestore Timestamp through toDate()', () => {
    const ts = { toDate: () => new Date('2026-01-02T03:04:05.000Z') }
    expect(toIso(ts)).toBe('2026-01-02T03:04:05.000Z')
  })

  it('reads the plain {seconds, nanoseconds} object a Timestamp becomes after JSON', () => {
    expect(toIso({ seconds: sec, nanoseconds: 500_000_000 })).toBe('2026-01-02T03:04:05.500Z')
  })

  it('reads the underscore spelling the Admin SDK serialises to', () => {
    expect(toIso({ _seconds: sec, _nanoseconds: 0 })).toBe('2026-01-02T03:04:05.000Z')
  })

  it.each([['not a date'], [''], [null], [undefined], [NaN], [{}], [[]]])(
    'gives null for %j instead of throwing', (v) => {
      expect(toIso(v)).toBeNull()
    })
})

describe('normalize', () => {
  it('turns timestamps anywhere inside a structure into ISO strings', () => {
    const sec = Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
    expect(normalize({
      a: new Date('2026-01-02T03:04:05.000Z'),
      c: [1, { d: { seconds: sec, nanoseconds: 0 } }],
    })).toEqual({
      a: '2026-01-02T03:04:05.000Z',
      c: [1, { d: '2026-01-02T03:04:05.000Z' }],
    })
  })

  it('drops undefined keys and nulls out values JSON cannot hold', () => {
    expect(normalize({ a: undefined, b: NaN, c: 1 })).toEqual({ b: null, c: 1 })
  })
})

// ── One document -> one row ─────────────────────────────────────────────────

describe('transformDoc', () => {
  it('maps fields to columns and coerces them', () => {
    const { row, unmapped } = transformDoc(USERS, 'csv-E1', {
      uid: 'csv-E1', email: 'a@freshket.co', role: 'sale', employeeId: 'E1',
      createdAt: '2026-01-02T03:04:05.000Z', displayName: 'เอ',
    }, identity)
    expect(row).toEqual({
      uid: 'csv-E1', email: 'a@freshket.co', role: 'sale', employee_id: 'E1',
      created_at: '2026-01-02T03:04:05.000Z', display_name: 'เอ',
    })
    expect(unmapped).toEqual([])
  })

  it('does not store a field that merely repeats the document id', () => {
    const { row } = transformDoc(USERS, 'csv-E1', { uid: 'csv-E1', email: 'a@x' }, identity)
    expect(row.uid).toBe('csv-E1')            // as the key
    expect(Object.keys(row)).not.toContain('extra')
  })

  it('leaves a null out so the column default applies', () => {
    const { row } = transformDoc(USERS, 'u', { email: 'a@x', photoURL: null, teamId: null }, identity)
    expect(row).not.toHaveProperty('photo_url')
    expect(row).not.toHaveProperty('team_id')
  })

  it('keeps an empty list — for visibleTeamIds it means "sees nothing", not "unset"', () => {
    const { row } = transformDoc(USERS, 'u', { email: 'a@x', visibleTeamIds: [] }, identity)
    expect(row.visible_team_ids).toEqual([])
  })

  it('keeps a field with no column in `extra` and says which', () => {
    const { row, unmapped } = transformDoc(COURSES, 'c1', {
      title: 'T', category: 'product', createdBy: 'u1',
      hasPreAssessment: true, assessmentType: 'x',
    }, identity)
    expect(row.extra).toEqual({ hasPreAssessment: true, assessmentType: 'x' })
    expect(unmapped).toEqual(['hasPreAssessment', 'assessmentType'])
  })

  it('re-points one-uid and list-of-uid fields, de-duplicating the list', () => {
    const remap = makeRemap({ g1: 'csv-E1', g2: 'csv-E2' })
    const { row } = transformDoc(COURSES, 'c1', {
      title: 'T', category: 'product', createdBy: 'g1',
      assignedUserIds: ['g1', 'csv-E1', 'x', 'g2'],
    }, remap)
    expect(row.created_by).toBe('csv-E1')
    // g1 and csv-E1 are the same person once merged, so they must not appear twice.
    expect(row.assigned_user_ids).toEqual(['csv-E1', 'x', 'csv-E2'])
  })

  it('stores a date in whichever of the three shapes it arrived in', () => {
    const sec = Date.UTC(2026, 0, 2, 3, 4, 5) / 1000
    const shapes = [
      { toDate: () => new Date('2026-01-02T03:04:05.000Z') },
      '2026-01-02T03:04:05.000Z',
      { seconds: sec, nanoseconds: 0 },
    ]
    for (const createdAt of shapes) {
      expect(transformDoc(USERS, 'u', { email: 'a@x', createdAt }, identity).row.created_at)
        .toBe('2026-01-02T03:04:05.000Z')
    }
  })

  describe('teams', () => {
    it('folds the old single manager / team lead into the lists and drops the singulars', () => {
      const remap = makeRemap({ g1: 'csv-E1', g2: 'csv-E2' })
      const { row, unmapped } = transformDoc(TEAMS, 't1', {
        id: 't1', name: 'A', managerId: 'g1', teamLeadId: 'g2', managerIds: ['m9'],
      }, remap)
      expect(row).toEqual({
        id: 't1', name: 'A', manager_ids: ['m9', 'csv-E1'], team_lead_ids: ['csv-E2'],
      })
      expect(unmapped).toEqual([])
    })
  })

  describe('ids that embed a person', () => {
    const remap = makeRemap({ g1: 'csv-E1' })

    it('rebuilds a training record id from the surviving person id', () => {
      // Left as `g1_c1`, the next progress sync would compute `csv-E1_c1`,
      // miss this row, and write a second record for the same course.
      const { row } = transformDoc(TRAINING_RECORDS, 'g1_c1', {
        userId: 'g1', courseId: 'c1', status: 'completed', score: 80,
      }, remap)
      expect(row.id).toBe('csv-E1_c1')
      expect(row.user_id).toBe('csv-E1')
    })

    it('rebuilds a bucket-result id, regroups the tallies, and lifts the MBTI code to a column', () => {
      const { row, unmapped } = transformDoc(USER_BUCKET_RESULTS, 'g1_mbti', {
        uid: 'g1', definitionId: 'mbti', code: 'INFP', courseId: 'c1',
        dimensions: [{ id: 'ei' }], answered: 40, total: 40,
        takenAt: '2026-01-02T03:04:05.000Z',
      }, remap)
      expect(row).toEqual({
        id: 'csv-E1_mbti', uid: 'csv-E1', definition_id: 'mbti', code: 'INFP', course_id: 'c1',
        taken_at: '2026-01-02T03:04:05.000Z',
        result: { dimensions: [{ id: 'ei' }], answered: 40, total: 40 },
      })
      expect(unmapped).toEqual([])
    })
  })

  it('takes a notification owner from the path and keeps the per-person id', () => {
    const remap = makeRemap({ g1: 'csv-E1', g2: 'csv-E2' })
    const { row } = transformDoc(NOTIFICATIONS, 'new_course_c1', {
      __parentUid: 'g1', type: 'new_course', title: 'x', body: '', read: false,
      refId: 'c1', refPath: '/courses/c1', createdAt: '2026-01-02T03:04:05.000Z',
      createdByUid: 'g2',
    }, remap)
    expect(row).toEqual({
      uid: 'csv-E1', id: 'new_course_c1', type: 'new_course', title: 'x', body: '', read: false,
      ref_id: 'c1', ref_path: '/courses/c1', created_at: '2026-01-02T03:04:05.000Z',
      created_by_uid: 'csv-E2',
    })
  })

  it('keeps a mandatory item\'s department access as objects, not names', () => {
    const { row } = transformDoc(MANDATORY_ITEMS, 'm1', {
      id: 'm1', title: 'T', slidesUrl: 'u', weekLabel: 'W1',
      departmentAccess: [{ department: 'People Experience', showHistory: true }],
    }, identity)
    expect(row.department_access).toEqual([{ department: 'People Experience', showHistory: true }])
    expect(row.slides_url).toBe('u')
    expect(row.week_label).toBe('W1')
  })

  it('stores a whole config document as one jsonb value', () => {
    const { row } = transformDoc(APP_CONFIG, 'moduleAccess', { departments: { A: { lms: true } } }, identity)
    expect(row).toEqual({ id: 'moduleAccess', value: { departments: { A: { lms: true } } } })
  })
})

// ── A whole collection ──────────────────────────────────────────────────────

describe('buildTable', () => {
  it('counts rows that would break a NOT NULL column', () => {
    const { report } = buildTable(COURSES, [doc('c1', { title: 'T' })], identity)
    expect(report.missingRequired).toEqual({ category: 1, created_by: 1 })
  })

  it('counts values outside a CHECK list, by value', () => {
    const { report } = buildTable(COURSES, [
      doc('c1', { title: 'T', category: 'weird', createdBy: 'u' }),
      doc('c2', { title: 'T', category: 'weird', createdBy: 'u' }),
      doc('c3', { title: 'T', category: 'product', createdBy: 'u' }),
    ], identity)
    expect(report.badValues).toEqual({ category: { weird: 2 } })
  })

  it('counts, per field, how many documents carried a field with no column', () => {
    const { report } = buildTable(COURSES, [
      doc('c1', { title: 'T', category: 'product', createdBy: 'u', hasPreAssessment: true }),
      doc('c2', { title: 'T', category: 'product', createdBy: 'u', hasPreAssessment: false }),
    ], identity)
    expect(report.unmapped).toEqual({ hasPreAssessment: 2 })
  })

  it('collapses two records that land on one key into one, and counts it', () => {
    // The same person's record under their login id and under their HR id.
    const remap = makeRemap({ g1: 'csv-E1' })
    const { rows, report } = buildTable(TRAINING_RECORDS, [
      doc('g1_c1', { userId: 'g1', courseId: 'c1', status: 'in_progress', updatedAt: '2026-01-01T00:00:00.000Z' }),
      doc('csv-E1_c1', { userId: 'csv-E1', courseId: 'c1', status: 'completed', score: 90, updatedAt: '2026-02-01T00:00:00.000Z' }),
    ], remap)
    expect(rows).toHaveLength(1)
    expect(report.collisions).toBe(1)
    expect(rows[0].status).toBe('completed')
    expect(rows[0].score).toBe(90)
  })

  it('does not turn a finished course back into one in progress (the real collision)', () => {
    // A completed CSV result (score 90, finished in April) against a NEWER
    // in-app attempt still marked in_progress. Keeping the newer one outright
    // would have regressed the status and discarded the completion date.
    const remap = makeRemap({ g1: 'csv-E1' })
    const { rows } = buildTable(TRAINING_RECORDS, [
      doc('csv-E1_c1', {
        userId: 'csv-E1', courseId: 'c1', status: 'completed', score: 90, source: 'csv_import',
        importBatchId: 'batch-1', completedAt: '2026-04-21T03:40:07.000Z',
        updatedAt: '2026-07-20T10:16:13.000Z',
      }),
      doc('g1_c1', {
        userId: 'g1', courseId: 'c1', status: 'in_progress', score: 100, source: 'manual',
        attemptCount: 2, completedLessonIds: ['l1', 'l2', 'l3'], totalLessons: 3,
        startedAt: '2026-09-14T11:28:58.000Z', updatedAt: '2026-09-14T11:30:36.000Z',
      }),
    ], remap)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: 'completed',
      completed_at: '2026-04-21T03:40:07.000Z',
      started_at: '2026-09-14T11:28:58.000Z',
      import_batch_id: 'batch-1',
      completed_lesson_ids: ['l1', 'l2', 'l3'],
      total_lessons: 3,
      attempt_count: 2,
    })
  })

  it('keeps one row per person for the same notification id', () => {
    const { rows, report } = buildTable(NOTIFICATIONS, [
      doc('new_course_c1', { __parentUid: 'u1', type: 'new_course' }),
      doc('new_course_c1', { __parentUid: 'u2', type: 'new_course' }),
    ], identity)
    expect(rows).toHaveLength(2)
    expect(report.collisions).toBe(0)
  })
})

describe('mergeTrainingRows', () => {
  const base = { user_id: 'u', course_id: 'c' }

  it('lets the furthest progress win, whichever record is newer', () => {
    const done = { ...base, status: 'completed', updated_at: '2026-01-01T00:00:00.000Z' }
    const later = { ...base, status: 'in_progress', updated_at: '2026-02-01T00:00:00.000Z' }
    expect(mergeTrainingRows(done, later).status).toBe('completed')
    expect(mergeTrainingRows(later, done).status).toBe('completed')
  })

  it('ranks failed above in_progress and below completed', () => {
    const r = (status: string) => ({ ...base, status, updated_at: '2026-01-01T00:00:00.000Z' })
    expect(mergeTrainingRows(r('in_progress'), r('failed')).status).toBe('failed')
    expect(mergeTrainingRows(r('failed'), r('completed')).status).toBe('completed')
    expect(mergeTrainingRows(r('not_started'), r('in_progress')).status).toBe('in_progress')
  })

  it('keeps the EARLIEST start and completion — they are first-time stamps', () => {
    const a = { ...base, status: 'completed', started_at: '2026-03-01T00:00:00.000Z', completed_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-04-01T00:00:00.000Z' }
    const b = { ...base, status: 'completed', started_at: '2026-02-01T00:00:00.000Z', completed_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }
    const m = mergeTrainingRows(a, b)
    expect(m.started_at).toBe('2026-02-01T00:00:00.000Z')
    expect(m.completed_at).toBe('2026-04-01T00:00:00.000Z')
  })

  it('takes a stamp from whichever record has one', () => {
    const a = { ...base, status: 'completed', completed_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    const b = { ...base, status: 'in_progress', updated_at: '2026-02-01T00:00:00.000Z' }
    expect(mergeTrainingRows(a, b).completed_at).toBe('2026-04-01T00:00:00.000Z')
  })

  it('unions the completed lessons and keeps the larger total', () => {
    const a = { ...base, status: 'in_progress', completed_lesson_ids: ['l1', 'l2'], total_lessons: 3, updated_at: '2026-01-01T00:00:00.000Z' }
    const b = { ...base, status: 'in_progress', completed_lesson_ids: ['l2', 'l3'], total_lessons: 4, updated_at: '2026-02-01T00:00:00.000Z' }
    const m = mergeTrainingRows(a, b)
    expect(m.completed_lesson_ids).toEqual(['l1', 'l2', 'l3'])
    expect(m.total_lessons).toBe(4)
  })

  it('takes the other fields from the more recent record and fills its gaps from the older', () => {
    const older = { ...base, status: 'completed', score: 90, source: 'csv_import', import_batch_id: 'b1', updated_at: '2026-01-01T00:00:00.000Z' }
    const newer = { ...base, status: 'in_progress', score: 100, source: 'manual', attempt_count: 2, updated_at: '2026-02-01T00:00:00.000Z' }
    const m = mergeTrainingRows(older, newer)
    expect(m.score).toBe(100)
    expect(m.source).toBe('manual')
    expect(m.attempt_count).toBe(2)
    expect(m.import_batch_id).toBe('b1')                   // only the older had it
    expect(m.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('does not depend on the order the two arrive in', () => {
    const a = { ...base, status: 'completed', score: 90, completed_at: '2026-04-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    const b = { ...base, status: 'in_progress', score: 100, started_at: '2026-02-01T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z' }
    expect(mergeTrainingRows(a, b)).toEqual(mergeTrainingRows(b, a))
  })
})

// ── People stored twice ─────────────────────────────────────────────────────

describe('planUserMerge', () => {
  const hr = (extra: Record<string, unknown> = {}) => doc('csv-E1', {
    uid: 'csv-E1', email: 'Sam@freshket.co', role: 'sale', employeeId: 'E1',
    department: 'Sales Management', position: 'Exec', employmentStatus: 'Active',
    teamId: 't1', displayName: 'สม', photoURL: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', ...extra,
  })
  const login = (extra: Record<string, unknown> = {}) => doc('fbUID1', {
    uid: 'fbUID1', email: 'sam@freshket.co', role: 'sale', photoURL: 'http://p',
    displayName: 'Sam G', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    ...extra,
  })

  describe('a login row and an HR row for the same person', () => {
    const plan = planUserMerge([login({ role: 'super_admin' }), hr()])
    const u = plan.users[0]

    it('becomes one person, keyed by the HR id that never changes', () => {
      expect(plan.users).toHaveLength(1)
      expect(u.id).toBe('csv-E1')
      expect(u.data.uid).toBe('csv-E1')
    })

    it('records the Firebase uid as the way they sign in, and retires that id', () => {
      expect(u.authUid).toBe('fbUID1')
      expect(plan.uidMap).toEqual({ fbUID1: 'csv-E1' })
    })

    it('groups by email without regard to case', () => {
      // Sam@ and sam@ are one person.
      expect(plan.report.people).toBe(1)
    })

    it('takes HR facts from the HR row', () => {
      expect(u.data.displayName).toBe('สม')
      expect(u.data.department).toBe('Sales Management')
      expect(u.data.teamId).toBe('t1')
      expect(u.data.email).toBe('Sam@freshket.co')
    })

    it('takes the avatar from the login row', () => {
      expect(u.data.photoURL).toBe('http://p')
    })

    it('keeps the higher role, and reports that a role was raised', () => {
      expect(u.data.role).toBe('super_admin')
      expect(plan.report.roleRaised).toBe(1)
    })

    it('keeps the earliest createdAt and the latest updatedAt', () => {
      expect(u.data.createdAt).toBe('2026-01-01T00:00:00.000Z')
      expect(u.data.updatedAt).toBe('2026-04-01T00:00:00.000Z')
    })

    it('reports the shape', () => {
      expect(plan.report.shapes).toEqual({ '1hr+1auth': 1 })
      expect(plan.report.authUidsLinked).toBe(1)
    })
  })

  it('never demotes — the HR row can be the higher one too', () => {
    const plan = planUserMerge([login({ role: 'sale' }), hr({ role: 'manager' })])
    expect(plan.users[0].data.role).toBe('manager')
    expect(plan.report.roleRaised).toBe(0)
  })

  it('fills a gap in the HR row from the login row', () => {
    const plan = planUserMerge([hr({ department: undefined }), login({ department: 'People Experience' })])
    expect(plan.users[0].data.department).toBe('People Experience')
  })

  it('treats an empty visibleTeamIds as a value, not a gap', () => {
    // [] means "sees no teams"; letting the login row's list win would widen access.
    const plan = planUserMerge([hr({ visibleTeamIds: [] }), login({ visibleTeamIds: ['t9'] })])
    expect(plan.users[0].data.visibleTeamIds).toEqual([])
  })

  describe('the same employee imported twice', () => {
    const a = doc('csv-E2', { email: 'x@freshket.co', employeeId: 'E2', employmentStatus: 'Resigned', displayName: 'N' })
    const b = doc('csv-oldprefix', { email: 'x@freshket.co', employeeId: 'E2', employmentStatus: 'Resigned', displayName: 'N' })
    const plan = planUserMerge([b, a])

    it('keeps the row whose id is csv-{its own employeeId}', () => {
      expect(plan.users.map((u) => u.id)).toEqual(['csv-E2'])
      expect(plan.uidMap).toEqual({ 'csv-oldprefix': 'csv-E2' })
    })

    it('links no login, since neither row was one', () => {
      expect(plan.users[0].authUid).toBeUndefined()
      expect(plan.report.shapes).toEqual({ '2hr+0auth': 1 })
    })
  })

  it('prefers an active HR row when neither id is the canonical one', () => {
    const resigned = doc('csv-aaa', { email: 'x@freshket.co', employmentStatus: 'Resigned', updatedAt: '2026-05-01T00:00:00.000Z' })
    const active = doc('csv-bbb', { email: 'x@freshket.co', employmentStatus: 'Active', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(planUserMerge([resigned, active]).users[0].id).toBe('csv-bbb')
  })

  it('keeps a login-only person under their Firebase uid, and links it to itself', () => {
    // A new joiner HR has not imported yet. Their id never changes later: when
    // HR does import them, the importer matches by email and reuses this id.
    const plan = planUserMerge([doc('fb2', { email: 'new@freshket.co', role: 'sale', displayName: 'N' })])
    expect(plan.users[0].id).toBe('fb2')
    expect(plan.users[0].authUid).toBe('fb2')
    expect(plan.uidMap).toEqual({})
    expect(plan.report.duplicatePeople).toBe(0)
  })

  it('handles two login rows for one person: newest signs in, the other is kept', () => {
    const older = doc('fbOld', { email: 'sam@freshket.co', updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = doc('fbNew', { email: 'sam@freshket.co', updatedAt: '2026-06-01T00:00:00.000Z' })
    const plan = planUserMerge([older, newer, hr()])
    expect(plan.users[0].authUid).toBe('fbNew')
    expect(plan.users[0].data.otherAuthUids).toEqual(['fbOld'])
    expect(plan.report.multipleAuthDocs).toBe(1)
    expect(plan.uidMap).toEqual({ fbOld: 'csv-E1', fbNew: 'csv-E1' })
  })

  it('reports disagreements it had to settle, instead of settling them silently', () => {
    const plan = planUserMerge([hr(), login({ teamId: 't2', employeeId: 'E9' })])
    expect(plan.report.teamConflicts).toBe(1)
    expect(plan.report.employeeIdConflicts).toBe(1)
    expect(plan.users[0].data.teamId).toBe('t1')          // the HR row's
    expect(plan.users[0].data.employeeId).toBe('E1')
  })

  it('never merges two rows that have no email', () => {
    const plan = planUserMerge([doc('a', { displayName: 'A' }), doc('b', { displayName: 'B' })])
    expect(plan.users).toHaveLength(2)
  })

  it('gives the same answer whatever order the rows arrive in', () => {
    const rows = [login({ role: 'super_admin' }), hr(), doc('csv-E2', { email: 'z@freshket.co', employeeId: 'E2' })]
    expect(planUserMerge(rows)).toEqual(planUserMerge([...rows].reverse()))
  })
})

describe('buildUserRows', () => {
  it('writes auth_uid only for people with a known login', () => {
    const { rows } = buildUserRows(planUserMerge([
      doc('csv-E1', { email: 'a@freshket.co', employeeId: 'E1' }),
      doc('fb1', { email: 'a@freshket.co' }),
      doc('csv-E2', { email: 'b@freshket.co', employeeId: 'E2' }),
    ]))
    const byUid = Object.fromEntries(rows.map((r) => [String(r.uid), r]))
    expect(byUid['csv-E1'].auth_uid).toBe('fb1')
    expect(byUid['csv-E2']).not.toHaveProperty('auth_uid')
  })

  it('re-points managerId at a manager who was themselves merged', () => {
    const { rows } = buildUserRows(planUserMerge([
      doc('csv-M', { email: 'm@freshket.co', employeeId: 'M' }),
      doc('fbMgr', { email: 'm@freshket.co' }),
      doc('csv-E1', { email: 'e@freshket.co', employeeId: 'E1', managerId: 'fbMgr' }),
    ]))
    expect(rows.find((r) => r.uid === 'csv-E1')?.manager_id).toBe('csv-M')
  })
})

// ── Derived stats ───────────────────────────────────────────────────────────

describe('deriveUserStats', () => {
  it('summarises migrated records using the app\'s own definition', () => {
    const stats = deriveUserStats([
      { user_id: 'u1', status: 'completed', score: 80 },
      { user_id: 'u1', status: 'in_progress' },
      { user_id: 'u2', status: 'completed', score: 0 },
    ], computeUserStats, NOW)

    expect(stats).toEqual([
      { uid: 'u1', total_count: 2, completed_count: 1, score_sum: 80, scored_count: 1, updated_at: NOW },
      // A completed record with a zero score counts as completed but not as scored.
      { uid: 'u2', total_count: 1, completed_count: 1, score_sum: 0, scored_count: 0, updated_at: NOW },
    ])
  })
})

// ── The specs themselves ────────────────────────────────────────────────────

describe('specs', () => {
  const all = [USERS, ...SPECS]

  it.each(all.map((s) => [s.table, s] as const))('%s: no two fields share a column', (_name, spec) => {
    const cols = Object.values(spec.fields).map((f) => f.column)
    expect(new Set(cols).size).toBe(cols.length)
  })

  it.each(all.map((s) => [s.table, s] as const))(
    '%s: every required and CHECKed column is one the spec fills', (_name, spec) => {
      const filled = new Set([
        ...Object.values(spec.fields).map((f) => f.column),
        ...spec.keyColumns,
        ...(spec.asJson ? [spec.asJson] : []),
      ])
      for (const c of spec.required) expect(filled.has(c), `required ${c}`).toBe(true)
      for (const c of Object.keys(spec.allowed ?? {})) expect(filled.has(c), `allowed ${c}`).toBe(true)
    })

  it('targets each table once', () => {
    const tables = all.map((s) => s.table)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('leaves the cancelled PVP collections alone', () => {
    const sources = new Set(all.map((s) => s.source))
    for (const skipped of SKIPPED_COLLECTIONS) expect(sources.has(skipped)).toBe(false)
  })
})
