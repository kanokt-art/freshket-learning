import { describe, it, expect } from 'vitest'
import { resolvePerson, isStaffToken, type IdentityStore, type VerifiedToken } from '@/lib/server/identity'
import { StoreError } from '@/lib/server/store'

// Which person is a login? This is decision "A": the person id never changes
// (`csv-{employeeId}` for anyone HR imported) and the Firebase uid they sign in
// with is recorded beside it, once. The failures worth guarding are the quiet
// ones — signing in as the wrong person, creating a second row for someone who
// already has one, moving a person's key (which orphans their history), or
// letting a token confer a role — so each case below is one of those.

interface Row { id: string; uid: string; email: string; role?: string; authUid?: string; employmentStatus?: string; updatedAt?: string; displayName?: string; [k: string]: unknown }

/**
 * A stand-in for the users table that behaves like it where it matters: a login
 * can belong to only one person (the column is unique), linking is conditional
 * on the row not already having one, and creating an existing person is ignored.
 */
function fakeUsers(initial: Row[]) {
  const rows: Row[] = initial.map((r) => ({ ...r }))
  const calls = { findByAuth: 0, findByEmail: 0, link: 0, create: 0 }
  let beforeLink: (() => void) | null = null

  const store: IdentityStore = {
    async findUsers(by) {
      if ('authUid' in by) {
        calls.findByAuth++
        return rows.filter((r) => r.authUid === by.authUid).map((r) => ({ ...r })) as never
      }
      calls.findByEmail++
      return rows.filter((r) => r.email.toLowerCase() === by.email.toLowerCase()).map((r) => ({ ...r })) as never
    },
    async linkAuthUid(uid, authUid) {
      calls.link++
      beforeLink?.()
      if (rows.some((r) => r.authUid === authUid)) throw new StoreError('rejected', 'unique violation', 409)
      const row = rows.find((r) => r.uid === uid)
      if (!row || row.authUid) return false
      row.authUid = authUid
      return true
    },
    async createUser(doc, authUid) {
      calls.create++
      if (rows.some((r) => r.uid === doc.uid)) return
      rows.push({ ...(doc as Row), id: doc.uid, authUid })
    },
  }
  return { rows, store, calls, onBeforeLink: (fn: () => void) => { beforeLink = fn } }
}

const hr = (over: Partial<Row> = {}): Row => ({
  id: 'csv-E1', uid: 'csv-E1', email: 'Sam@freshket.co', role: 'sale', employeeId: 'E1', ...over,
})
const token = (over: Partial<VerifiedToken> = {}): VerifiedToken => ({
  uid: 'fb-sam', email: 'sam@freshket.co', emailVerified: true, name: 'Sam', ...over,
})

describe('isStaffToken', () => {
  it('accepts a verified @freshket.co account', () => {
    expect(isStaffToken(token())).toBe(true)
  })

  it('is not case-sensitive about the domain', () => {
    expect(isStaffToken(token({ email: 'Sam@FRESHKET.CO' }))).toBe(true)
  })

  it.each([
    ['an unverified email', { emailVerified: false }],
    ['a missing verification flag', { emailVerified: undefined }],
    ['another domain', { email: 'sam@gmail.com' }],
    ['a look-alike domain', { email: 'sam@freshket.co.evil.com' }],
    ['a sub-domain trick', { email: 'sam@evilfreshket.co' }],
    ['a missing email', { email: undefined }],
  ])('refuses %s', (_name, over) => {
    // The `hd` hint on the sign-in popup is only a nicety: Google does not
    // enforce it, and a valid token for this project exists for any account.
    expect(isStaffToken(token(over as Partial<VerifiedToken>))).toBe(false)
  })
})

describe('resolvePerson', () => {
  it('refuses a token that is not staff, without touching the database', async () => {
    const { store, calls } = fakeUsers([hr()])
    const r = await resolvePerson(store, token({ emailVerified: false }))
    expect(r).toEqual({ ok: false, reason: 'not-staff' })
    expect(calls).toEqual({ findByAuth: 0, findByEmail: 0, link: 0, create: 0 })
  })

  describe('someone already linked', () => {
    it('is found by their Firebase uid, with no email lookup and no writes', async () => {
      const { store, calls } = fakeUsers([hr({ authUid: 'fb-sam' })])
      const r = await resolvePerson(store, token())
      expect(r).toMatchObject({ ok: true, created: false, linked: false })
      expect(r.ok && r.person.uid).toBe('csv-E1')
      expect(calls).toMatchObject({ findByAuth: 1, findByEmail: 0, link: 0, create: 0 })
    })

    it('stays the same person if their email later changes — the login is what identifies them', async () => {
      const { store } = fakeUsers([hr({ email: 'old@freshket.co', authUid: 'fb-sam' })])
      const r = await resolvePerson(store, token({ email: 'new@freshket.co' }))
      expect(r.ok && r.person.uid).toBe('csv-E1')
    })
  })

  describe('first sign-in by someone HR already imported', () => {
    it('claims the HR row, matching the email without regard to case', async () => {
      const { store, rows } = fakeUsers([hr()])
      const r = await resolvePerson(store, token())
      expect(r).toMatchObject({ ok: true, created: false, linked: true })
      expect(rows.find((x) => x.uid === 'csv-E1')?.authUid).toBe('fb-sam')
    })

    it('NEVER moves the person: their id is still csv-{employeeId}', async () => {
      // Re-keying them to the Firebase uid would orphan every record that
      // mentions them. This is the whole point of keeping the two apart.
      const { store, rows } = fakeUsers([hr()])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.uid).toBe('csv-E1')
      expect(r.ok && r.person.id).toBe('csv-E1')
      expect(rows.map((x) => x.uid)).toEqual(['csv-E1'])
    })

    it('does not create a second row for them', async () => {
      const { store, rows, calls } = fakeUsers([hr()])
      await resolvePerson(store, token())
      expect(calls.create).toBe(0)
      expect(rows).toHaveLength(1)
    })

    it('resolves by login from then on, without looking at the email again', async () => {
      const { store, calls } = fakeUsers([hr()])
      await resolvePerson(store, token())
      const before = calls.findByEmail
      const again = await resolvePerson(store, token())
      expect(again).toMatchObject({ ok: true, linked: false, created: false })
      expect(calls.findByEmail).toBe(before)
    })

    it('keeps the role HR/an admin gave them', async () => {
      const { store } = fakeUsers([hr({ role: 'manager' })])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.role).toBe('manager')
    })

    it('lets in someone whose stored role is not a known one, as a plain sale', async () => {
      const { store } = fakeUsers([hr({ role: 'wizard' })])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.role).toBe('sale')
    })
  })

  describe('an email with more than one row', () => {
    it('prefers the one still employed', async () => {
      const { store, rows } = fakeUsers([
        hr({ id: 'csv-OLD', uid: 'csv-OLD', employmentStatus: 'Resigned', updatedAt: '2026-09-01T00:00:00.000Z' }),
        hr({ id: 'csv-NEW', uid: 'csv-NEW', employmentStatus: 'Active', updatedAt: '2026-01-01T00:00:00.000Z' }),
      ])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.uid).toBe('csv-NEW')
      expect(rows.find((x) => x.uid === 'csv-NEW')?.authUid).toBe('fb-sam')
      expect(rows.find((x) => x.uid === 'csv-OLD')?.authUid).toBeUndefined()
    })

    it('otherwise prefers the most recently updated', async () => {
      const { store } = fakeUsers([
        hr({ id: 'csv-A', uid: 'csv-A', employmentStatus: 'Resigned', updatedAt: '2026-01-01T00:00:00.000Z' }),
        hr({ id: 'csv-B', uid: 'csv-B', employmentStatus: 'Resigned', updatedAt: '2026-06-01T00:00:00.000Z' }),
      ])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.uid).toBe('csv-B')
    })

    it('still lets a resigned person sign in — as before, nothing here gates on status', async () => {
      const { store } = fakeUsers([hr({ employmentStatus: 'Resigned' })])
      const r = await resolvePerson(store, token())
      expect(r.ok && r.person.uid).toBe('csv-E1')
    })
  })

  describe('when two requests race', () => {
    it('re-reads and returns the winner if another tab linked the row first', async () => {
      const f = fakeUsers([hr()])
      // Between our lookup and our link, the other tab links the same row.
      f.onBeforeLink(() => { f.rows[0].authUid = 'fb-sam' })
      const r = await resolvePerson(f.store, token())
      // linkAuthUid saw an already-linked row and reported false; the login is
      // now found by uid, so the same person comes back, not a duplicate.
      expect(r.ok && r.person.uid).toBe('csv-E1')
      expect(f.rows).toHaveLength(1)
    })

    it('does not create two rows when two first logins of a new person arrive together', async () => {
      const f = fakeUsers([])
      const [a, b] = await Promise.all([
        resolvePerson(f.store, token({ uid: 'fb-new', email: 'new@freshket.co' })),
        resolvePerson(f.store, token({ uid: 'fb-new', email: 'new@freshket.co' })),
      ])
      expect(f.rows).toHaveLength(1)
      expect(a.ok && b.ok && a.person.uid === b.person.uid).toBe(true)
    })
  })

  describe('a login that does not match the row\'s link', () => {
    it('lets in a verified employee whose Google account was recreated, leaving the old link', async () => {
      const { store, rows } = fakeUsers([hr({ authUid: 'fb-OLD-ACCOUNT' })])
      const r = await resolvePerson(store, token({ uid: 'fb-sam-new' }))
      expect(r).toMatchObject({ ok: true, linked: false, created: false })
      expect(r.ok && r.person.uid).toBe('csv-E1')
      expect(rows[0].authUid).toBe('fb-OLD-ACCOUNT')
    })

    it('does not fail when the database refuses the link because the login was just claimed elsewhere', async () => {
      // The login is unclaimed when we look it up, then another request links it
      // to a DIFFERENT row before our own link lands. The column is unique, so
      // the database refuses ours — which must not turn into an error for a
      // verified employee. The login now belongs to that row, so that is who
      // comes back.
      const f = fakeUsers([
        hr(),
        { id: 'csv-OTHER', uid: 'csv-OTHER', email: 'other@freshket.co' },
      ])
      f.onBeforeLink(() => { f.rows[1].authUid = 'fb-sam' })
      const r = await resolvePerson(f.store, token())
      expect(r.ok && r.person.uid).toBe('csv-OTHER')
      expect(f.rows.find((x) => x.uid === 'csv-E1')?.authUid).toBeUndefined()
    })

    it('still raises a genuine database failure, rather than swallowing every error', async () => {
      const { store } = fakeUsers([hr()])
      const broken: IdentityStore = {
        ...store,
        linkAuthUid: async () => { throw new StoreError('unavailable', 'database unreachable') },
      }
      await expect(resolvePerson(broken, token())).rejects.toMatchObject({ code: 'unavailable' })
    })
  })

  describe('someone HR has not imported yet', () => {
    it('is created, keyed by their Firebase uid and linked to it', async () => {
      const { store, rows } = fakeUsers([])
      const r = await resolvePerson(store, token({ uid: 'fb-new', email: 'New@Freshket.co', name: 'New Joiner' }),
        new Date('2026-10-26T00:00:00.000Z'))
      expect(r).toMatchObject({ ok: true, created: true })
      expect(r.ok && r.person.uid).toBe('fb-new')
      expect(r.ok && r.person.authUid).toBe('fb-new')
      expect(rows[0]).toMatchObject({
        uid: 'fb-new', email: 'new@freshket.co', displayName: 'New Joiner', role: 'sale',
        createdAt: '2026-10-26T00:00:00.000Z',
      })
    })

    it('is ALWAYS a plain sale — nothing about a token confers a role', async () => {
      const { store } = fakeUsers([])
      const r = await resolvePerson(store, { ...token({ uid: 'fb-x', email: 'x@freshket.co' }), role: 'super_admin' } as VerifiedToken)
      expect(r.ok && r.person.role).toBe('sale')
    })

    it('falls back to the email\'s local part when Google gives no name', async () => {
      const { store, rows } = fakeUsers([])
      await resolvePerson(store, token({ uid: 'fb-n', email: 'first.last@freshket.co', name: undefined }))
      expect(rows[0].displayName).toBe('first.last')
    })

    it('keeps their avatar when Google gives one', async () => {
      const { store, rows } = fakeUsers([])
      await resolvePerson(store, token({ uid: 'fb-p', email: 'p@freshket.co', picture: 'https://p/x.png' }))
      expect(rows[0].photoURL).toBe('https://p/x.png')
    })

    it('is not created twice on a second sign-in', async () => {
      const f = fakeUsers([])
      await resolvePerson(f.store, token({ uid: 'fb-new', email: 'new@freshket.co' }))
      const again = await resolvePerson(f.store, token({ uid: 'fb-new', email: 'new@freshket.co' }))
      expect(again).toMatchObject({ ok: true, created: false })
      expect(f.calls.create).toBe(1)
    })
  })
})
