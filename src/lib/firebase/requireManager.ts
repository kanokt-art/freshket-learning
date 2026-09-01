import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from './admin'

// Gate for Admin-SDK routes that managers may call, matching firestore.rules'
// isManagerOrAbove() — the rules already let a manager write /teams, and the
// /users UI already exposes team management at `canAccess(role, 'manager')`.
//
// This exists because team assignment was gated on requireSuperAdmin while both
// of those said manager: a manager moving someone between teams got
// "server ปฏิเสธ" and the change silently stayed local-only.
//
// Returns the caller's real role so a route can still reserve individual fields
// for super_admin (assigning a team is a manager action; changing someone's ROLE
// is not).

export type ManagerGate =
  | { ok: true; uid: string; role: string; isSuperAdmin: boolean }
  | { ok: false; response: NextResponse }

export async function requireManager(req: NextRequest, bodyToken?: string): Promise<ManagerGate> {
  const headerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const idToken = headerToken || bodyToken || ''
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken)
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }

  try {
    const snap = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    const role = snap.exists ? String(snap.data()?.role ?? '') : ''
    if (role !== 'manager' && role !== 'super_admin') {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden: manager or super_admin only' }, { status: 403 }),
      }
    }
    return { ok: true, uid: decoded.uid, role, isSuperAdmin: role === 'super_admin' }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}
