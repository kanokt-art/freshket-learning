// Who is this login?
//
// A Google sign-in gives the server a verified Firebase token: a Firebase uid
// and an email. The people in the system are keyed differently — `csv-{employeeId}`
// for anyone HR has imported — so something has to say which person a login is.
// That is all this file does (decision "A", supabase/migrations/005):
//
//   · users.uid       is the stable PERSON id and never changes. Every record
//                     that mentions a person points at it.
//   · users.auth_uid  is the Firebase uid they sign in with, recorded once.
//
// Resolving a login:
//   1. a person already linked to this Firebase uid is that person;
//   2. otherwise an HR row with the same email is claimed — auth_uid is set on it,
//      one UPDATE on one row, and no history anywhere is touched;
//   3. otherwise this is someone HR has not imported yet, and they are created.
//
// The alternative was to re-key the person to their Firebase uid at first login.
// That has to find and update every table that mentions them, and a single
// missed column silently orphans their history. This never moves anyone.
//
// The store is passed in, so this is testable without a database.

import { ROLES, type Doc } from './docMap'
import { StoreError, type Store } from './store'
import type { Role } from './policies'
import { roleWithHeadFloor } from '@/lib/users/departmentHead'

/** What a verified Firebase ID token tells us. Verification itself happens before this. */
export interface VerifiedToken {
  uid: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
}

/** A person, as the app sees them, plus the login they are linked to. */
export type Person = Doc & { role: Role; authUid?: string }

export type IdentityStore = Pick<Store, 'findUsers' | 'linkAuthUid' | 'createUser'>

export type Resolved =
  | { ok: true; person: Person; created: boolean; linked: boolean }
  | { ok: false; reason: 'not-staff' }

const STAFF_EMAIL = /@freshket\.co$/i

/**
 * A staff account is a Google account the domain controls AND has verified. The
 * `hd` hint on the sign-in popup is only a UI nicety — Google does not enforce
 * it, and a valid token for this project can be had for any Google account — so
 * the server checks the token's own claims.
 */
export function isStaffToken(t: VerifiedToken): boolean {
  return t.emailVerified === true && !!t.email && STAFF_EMAIL.test(t.email)
}

const toRole = (v: unknown): Role => ((ROLES as readonly string[]).includes(String(v)) ? (v as Role) : 'sale')

const isActive = (d: Doc) => {
  const s = d.employmentStatus
  return s === undefined || s === null || s === '' || s === 'Active'
}
const stamp = (d: Doc) => {
  const t = Date.parse(String(d.updatedAt ?? ''))
  return Number.isNaN(t) ? 0 : t
}

/** When an email has more than one row, prefer one still employed, then the most recently updated. */
function preferred<T extends Doc>(rows: T[]): T {
  return [...rows].sort(
    (a, b) =>
      Number(isActive(b)) - Number(isActive(a)) ||
      stamp(b) - stamp(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0]
}

// A department head (JG11+) is at least a manager: see roleWithHeadFloor. Every gate and the session
// answer start from this person, so the server and the browser agree on the role.
const asPerson = (row: Doc & { authUid?: string }): Person =>
  ({ ...row, role: roleWithHeadFloor(toRole(row.role), row as never) }) as Person

export async function resolvePerson(
  store: IdentityStore,
  token: VerifiedToken,
  now: Date = new Date(),
): Promise<Resolved> {
  if (!isStaffToken(token)) return { ok: false, reason: 'not-staff' }
  const email = token.email!.trim().toLowerCase()

  // 1. Already linked.
  const linked = await store.findUsers({ authUid: token.uid })
  if (linked.length > 0) return { ok: true, person: asPerson(linked[0]), created: false, linked: false }

  // 2. An HR row with this email: claim it.
  const byEmail = await store.findUsers({ email })
  if (byEmail.length > 0) {
    const chosen = preferred(byEmail)

    if (chosen.authUid === undefined) {
      try {
        if (await store.linkAuthUid(chosen.id, token.uid)) {
          return { ok: true, person: asPerson({ ...chosen, authUid: token.uid }), created: false, linked: true }
        }
      } catch (e) {
        // This login is already held by another person (the column is unique).
        // That is not a reason to refuse a verified employee: fall through and
        // let them in as the row their email names.
        if (!(e instanceof StoreError && e.code === 'rejected')) throw e
      }
      // Lost a race with another tab signing in: whoever won linked it, so look again.
      const again = await store.findUsers({ authUid: token.uid })
      if (again.length > 0) return { ok: true, person: asPerson(again[0]), created: false, linked: false }
    }

    // The row is linked to a DIFFERENT Firebase account (the Google account was
    // recreated, say). The email is verified and on the domain, so it is the
    // same human; they are let in, and the existing link is left as it is.
    return { ok: true, person: asPerson(chosen), created: false, linked: false }
  }

  // 3. Somebody HR has not imported yet. They keep their Firebase uid as their
  //    person id, and when HR does import them the importer matches by email and
  //    reuses it, so it never changes. Always a plain `sale`: nothing about a
  //    token may confer a role.
  await store.createUser(
    {
      uid: token.uid,
      email,
      displayName: token.name?.trim() || email.split('@')[0],
      ...(token.picture ? { photoURL: token.picture } : {}),
      role: 'sale',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    token.uid,
  )
  // Read it back rather than trusting the write: if two requests raced, the row
  // that exists is the first one's, and that is the one to return.
  const made = await store.findUsers({ authUid: token.uid })
  if (made.length === 0) throw new StoreError('unavailable', 'could not create the signed-in user')
  return { ok: true, person: asPerson(made[0]), created: true, linked: false }
}
