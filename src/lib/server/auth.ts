// Gates for the API routes: who is calling, and are they allowed in.
//
// Every route that touches data starts with one of these. They verify the
// Firebase ID token, resolve it to a PERSON (see identity.ts), and answer with
// that person's id and role — so a route that writes on the caller's behalf
// writes under the id every record points at, not under the Firebase uid, which
// is only the way they sign in.
//
// This replaces three near-identical files that each read the caller's role from
// users/{firebaseUid}. That lookup stops working the moment a person is keyed
// by something other than their Firebase uid, and having it written three times
// is how it would have been fixed in two of them.
//
// The token may arrive as `Authorization: Bearer …` or, for the few routes that
// already did it, as an `idToken` field in the JSON body.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { getStore, StoreError } from './store'
import { resolvePerson, type Person } from './identity'
import { refreshTargetDepartments } from './targetDepartments'
import type { Role } from './policies'

export interface Caller {
  /** The stable PERSON id (users.uid) — what every record points at. */
  uid: string
  email: string
  role: Role
  isSuperAdmin: boolean
  person: Person
}

export type Gate = ({ ok: true } & Caller) | { ok: false; response: NextResponse }

const fail = (status: number, error: string): { ok: false; response: NextResponse } =>
  ({ ok: false, response: NextResponse.json({ error }, { status }) })

/** Verify the token and resolve it to a person. Any signed-in member of staff passes. */
export async function authenticate(req: NextRequest, bodyToken?: string): Promise<Gate> {
  const headerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const idToken = headerToken || bodyToken || ''
  if (!idToken) return fail(401, 'Unauthorized')

  // A bad or expired token is the caller's problem (401), not the server's. It
  // used to share a catch with everything else and was reported as a 500, which
  // sent people looking at the server for what was a stale token.
  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken)
  } catch {
    return fail(401, 'Invalid token')
  }

  try {
    // The department list is a setting: load it before anything decides by department.
    await refreshTargetDepartments(getStore())
    const resolved = await resolvePerson(getStore(), {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    })
    if (!resolved.ok) return fail(403, 'Forbidden: staff only')

    const { person } = resolved
    return {
      ok: true,
      uid: person.id,
      email: String(person.email ?? decoded.email ?? ''),
      role: person.role,
      isSuperAdmin: person.role === 'super_admin',
      person,
    }
  } catch (e) {
    console.error('authenticate: could not resolve the caller', e)
    // The database being down is not "the caller did something wrong".
    return fail(e instanceof StoreError && e.code === 'unavailable' ? 503 : 500, 'Service unavailable')
  }
}

export const requireStaff = authenticate

/** Manager or super_admin — matches who may assign teams. */
export async function requireManager(req: NextRequest, bodyToken?: string): Promise<Gate> {
  const g = await authenticate(req, bodyToken)
  if (!g.ok) return g
  return g.role === 'manager' || g.role === 'super_admin'
    ? g
    : fail(403, 'Forbidden: manager or super_admin only')
}

export async function requireSuperAdmin(req: NextRequest, bodyToken?: string): Promise<Gate> {
  const g = await authenticate(req, bodyToken)
  if (!g.ok) return g
  return g.role === 'super_admin' ? g : fail(403, 'Forbidden: super_admin only')
}
