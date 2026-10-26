import { describe, it, expect } from 'vitest'
import {
  transformDoc, rowToDoc, dateFieldsOf, columnFor, allColumns, resolveCollection,
  USERS, TEAMS, COURSES, TRAINING_RECORDS, USER_BUCKET_RESULTS, MANDATORY_ITEMS,
  NOTIFICATIONS, APP_CONFIG, CSV_IMPORTS, TOOLS, SPECS,
} from '@/lib/server/docMap'

// The running app speaks in documents; Postgres stores rows. docMap is the one
// place that translates, and a mistake in it does not fail loudly — a page just
// shows slightly wrong data. So the property worth pinning is the round trip: a
// document written and read back must be the document that was written.
//
// The fixtures below are shaped like the real documents (they were taken from
// the inventory of the live collections), not invented, because the interesting
// failures come from real quirks — a list of objects where a list of strings was
// assumed, a legacy field with no column, a field that repeats the id.

const ISO = '2026-01-02T03:04:05.000Z'

/** Write a document as the store does, then read the row back as the store does. */
function roundTrip(spec: Parameters<typeof transformDoc>[0], id: string, data: Record<string, unknown>) {
  const { row } = transformDoc(spec, id, data)
  return rowToDoc(spec, row)
}

describe('round trip: a document read back is the document that was written', () => {
  it('users — including the field that repeats the id', () => {
    const doc = {
      uid: 'csv-E1', email: 'a@freshket.co', role: 'sale', displayName: 'เอ', employeeId: 'E1',
      department: 'Sales Management', position: 'Exec', employmentStatus: 'Active',
      createdAt: ISO, updatedAt: ISO, visibleTeamIds: ['t1'],
    }
    expect(roundTrip(USERS, 'csv-E1', doc)).toEqual({ id: 'csv-E1', ...doc })
  })

  it('teams — only the plural lists, as every write now uses', () => {
    const doc = { id: 't1', name: 'A', departmentId: 'd1', managerIds: ['m1'], teamLeadIds: ['l1'] }
    expect(roundTrip(TEAMS, 't1', doc)).toEqual(doc)
  })

  it('courses — keeping a legacy field no column knows about', () => {
    const doc = {
      title: 'T', category: 'product', createdBy: 'u1', isPublished: true,
      assignedUserIds: ['u1', 'u2'], topics: [{ id: 't', title: 'x', lessons: [{ id: 'l', type: 'video' }] }],
      createdAt: ISO, hasPreAssessment: true, assessmentType: 'x',
    }
    expect(roundTrip(COURSES, 'c1', doc)).toEqual({ id: 'c1', ...doc })
  })

  it('training records — the key is the person and the course', () => {
    const doc = {
      userId: 'csv-E1', courseId: 'c1', courseTitle: 'T', status: 'completed', score: 90,
      source: 'csv_import', completedLessonIds: ['l1'], completedAt: ISO, updatedAt: ISO,
    }
    expect(roundTrip(TRAINING_RECORDS, 'csv-E1_c1', doc)).toEqual({ id: 'csv-E1_c1', ...doc })
  })

  it('bucket results — the tallies come back as top-level fields, not under `result`', () => {
    const doc = {
      uid: 'csv-E1', definitionId: 'mbti', code: 'INFP', courseId: 'c1',
      dimensions: [{ id: 'ei', winner: 'I' }], answered: 40, total: 40, takenAt: ISO,
    }
    const back = roundTrip(USER_BUCKET_RESULTS, 'csv-E1_mbti', doc)
    expect(back).toEqual({ id: 'csv-E1_mbti', ...doc })
    expect(back).not.toHaveProperty('result')
  })

  it('mandatory items — department access stays a list of objects', () => {
    const doc = {
      id: 'm1', title: 'T', slidesUrl: 'u', weekLabel: 'W1', isPublished: true,
      departmentAccess: [{ department: 'People Experience', showHistory: true }],
      publishedAt: ISO, createdAt: ISO,
    }
    expect(roundTrip(MANDATORY_ITEMS, 'm1', doc)).toEqual(doc)
  })

  it('tools', () => {
    const doc = { title: 'T', description: 'd', category: 'Sale Deck', url: 'u', imageUrl: 'i', isPublished: true, departments: ['Sale'], createdAt: ISO }
    expect(roundTrip(TOOLS, 'x1', doc)).toEqual({ id: 'x1', ...doc })
  })

  it('csv imports — the document repeats its own id', () => {
    const doc = { id: 'imp1', type: 'course_results', courseId: 'c1', fileName: 'f.csv', totalRows: 3, errors: [], importedAt: ISO }
    expect(roundTrip(CSV_IMPORTS, 'imp1', doc)).toEqual(doc)
  })

  it('a config document is stored whole and comes back whole', () => {
    const doc = { departments: { 'Sales Management': { lms: true, shadow: false } } }
    expect(roundTrip(APP_CONFIG, 'moduleAccess', doc)).toEqual({ id: 'moduleAccess', ...doc })
  })

  it('a notification keeps its per-person id and does not leak the owner as a field', () => {
    const doc = {
      __parentUid: 'csv-E1', type: 'new_course', title: 'x', body: '', read: false,
      refId: 'c1', refPath: '/courses/c1', createdAt: ISO, createdByUid: 'csv-E2',
    }
    const { row } = transformDoc(NOTIFICATIONS, 'new_course_c1', doc)
    expect(row.uid).toBe('csv-E1')
    const back = rowToDoc(NOTIFICATIONS, row)
    expect(back.id).toBe('new_course_c1')
    expect(back).not.toHaveProperty('__parentUid')
    expect(back).toMatchObject({ type: 'new_course', read: false, refPath: '/courses/c1' })
  })
})

describe('rowToDoc', () => {
  it('leaves out null columns — an unset field was simply absent in Firestore', () => {
    const doc = rowToDoc(USERS, { uid: 'u1', email: 'a@x', team_id: null, photo_url: null, visible_team_ids: null })
    expect(doc).not.toHaveProperty('teamId')
    expect(doc).not.toHaveProperty('photoURL')
    // null visibleTeamIds means "sees every team"; the app tests for absence, so it must be absent.
    expect(doc).not.toHaveProperty('visibleTeamIds')
  })

  it('keeps an empty list, which for visibleTeamIds means "sees nothing"', () => {
    expect(rowToDoc(USERS, { uid: 'u1', email: 'a@x', visible_team_ids: [] }).visibleTeamIds).toEqual([])
  })

  it('never lets a field in `extra` override a real column', () => {
    const doc = rowToDoc(COURSES, { id: 'c1', title: 'Real', extra: { title: 'Shadow', legacy: 1 } })
    expect(doc.title).toBe('Real')
    expect(doc.legacy).toBe(1)
  })

  it('ignores columns the spec does not know, so internal ones never reach the browser', () => {
    // users.auth_uid and users.email_lc are not part of a user document.
    const doc = rowToDoc(USERS, { uid: 'u1', email: 'a@x', auth_uid: 'fb1', email_lc: 'a@x' })
    expect(doc).not.toHaveProperty('auth_uid')
    expect(doc).not.toHaveProperty('authUid')
    expect(doc).not.toHaveProperty('email_lc')
  })
})

describe('dateFieldsOf', () => {
  it('lists the document fields that hold dates, so the browser can revive them', () => {
    expect(dateFieldsOf(USERS).sort()).toEqual(['createdAt', 'startDate', 'updatedAt'])
    expect(dateFieldsOf(TRAINING_RECORDS)).toEqual(
      expect.arrayContaining(['startedAt', 'completedAt', 'dueDate', 'updatedAt']),
    )
  })

  it('is empty for a table that has none', () => {
    expect(dateFieldsOf(TEAMS)).toEqual([])
  })
})

describe('columnFor', () => {
  it('maps a document field to its column', () => {
    expect(columnFor(USERS, 'displayName')).toBe('display_name')
    expect(columnFor(TRAINING_RECORDS, 'userId')).toBe('user_id')
  })

  it('maps `id` to the key, and a self-id field to the same key', () => {
    expect(columnFor(COURSES, 'id')).toBe('id')
    expect(columnFor(USERS, 'id')).toBe('uid')
    expect(columnFor(USERS, 'uid')).toBe('uid')
  })

  it('uses the document id column for a notification, not the owner', () => {
    expect(columnFor(NOTIFICATIONS, 'id')).toBe('id')
  })

  it('refuses a field the table does not store, rather than guessing', () => {
    expect(columnFor(USERS, 'passwordHash')).toBeNull()
    expect(columnFor(USERS, 'auth_uid')).toBeNull()
  })
})

describe('allColumns', () => {
  it('names every column a full replace must overwrite, including the key and extra', () => {
    const cols = allColumns(TRAINING_RECORDS)
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'status', 'extra']))
  })

  it('has no duplicates', () => {
    for (const s of [USERS, ...SPECS]) {
      const cols = allColumns(s)
      expect(new Set(cols).size).toBe(cols.length)
    }
  })

  it('names the json column for a whole-document table', () => {
    expect(allColumns(APP_CONFIG)).toEqual(expect.arrayContaining(['id', 'value']))
  })
})

describe('partial updates', () => {
  it('a patch that sets only managerIds does not blank teamLeadIds', () => {
    // The legacy-field folding must only touch a list the document mentions.
    const { row } = transformDoc(TEAMS, 't1', { managerIds: ['m1'] })
    expect(row.manager_ids).toEqual(['m1'])
    expect(row).not.toHaveProperty('team_lead_ids')
  })

  it('and the other way round: a patch that sets only teamLeadIds does not blank managerIds', () => {
    // Pinned in both directions — a fold that always touched one of the two lists
    // would only fail the test for the OTHER one.
    const { row } = transformDoc(TEAMS, 't1', { teamLeadIds: ['l1'] })
    expect(row.team_lead_ids).toEqual(['l1'])
    expect(row).not.toHaveProperty('manager_ids')
  })

  it('a patch touching neither list writes neither', () => {
    const { row } = transformDoc(TEAMS, 't1', { name: 'Renamed' })
    expect(row).not.toHaveProperty('manager_ids')
    expect(row).not.toHaveProperty('team_lead_ids')
  })

  it('folds a legacy single manager into the list when it is present', () => {
    const { row } = transformDoc(TEAMS, 't1', { managerId: 'm9', managerIds: ['m1'] })
    expect(row.manager_ids).toEqual(['m1', 'm9'])
  })
})

describe('resolveCollection', () => {
  it('finds an ordinary collection', () => {
    expect(resolveCollection('courses')?.spec.table).toBe('courses')
    expect(resolveCollection('users')?.spec).toBe(USERS)
  })

  it('reads the owner from a notification path', () => {
    const r = resolveCollection('notifications/csv-E1/items')
    expect(r?.spec.table).toBe('notifications')
    expect(r?.parentUid).toBe('csv-E1')
  })

  it('refuses notifications without an owner — it is a per-person feed', () => {
    expect(resolveCollection('notifications')).toBeNull()
  })

  it.each([
    ['users/someone'], ['notifications/u/other'], ['notifications//items'], ['nope'], [''],
    ['_meta'], ['courses/x/y/z'],
  ])('refuses %j', (path) => {
    expect(resolveCollection(path)).toBeNull()
  })

  it('resolves every table the app writes to', () => {
    for (const s of SPECS) {
      if (s.source === 'notifications') continue
      expect(resolveCollection(s.source)?.spec, s.source).toBe(s)
    }
  })
})
