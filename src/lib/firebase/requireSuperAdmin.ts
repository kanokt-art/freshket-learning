import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from './admin'

// Gate for API routes that use the Admin SDK — which bypasses Firestore rules,
// so each privileged route MUST verify the caller itself. Accepts the Firebase
// ID token from either the Authorization: Bearer header or an `idToken` field in
// the JSON body (both patterns already exist across the codebase).
//
// Usage at the top of a route handler:
//   const gate = await requireSuperAdmin(req)
//   if (!gate.ok) return gate.response
//   const { uid } = gate            // verified super_admin caller

export type SuperAdminGate =
  | { ok: true; uid: string }
  | { ok: false; response: NextResponse }

export async function requireSuperAdmin(
  req: NextRequest,
  bodyToken?: string,
): Promise<SuperAdminGate> {
  const headerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const idToken = headerToken || bodyToken || ''
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const snap = await getAdminFirestore().collection('users').doc(decoded.uid).get()
    if (!snap.exists || snap.data()?.role !== 'super_admin') {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden: super_admin only' }, { status: 403 }) }
    }
    return { ok: true, uid: decoded.uid }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
}
