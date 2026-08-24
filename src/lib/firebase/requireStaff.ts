import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from './admin'

// Gate for Admin-SDK routes that any signed-in employee may call (as opposed to
// requireSuperAdmin, which additionally re-reads the caller's role). It proves
// only "this is a verified @freshket.co account", and returns the caller's uid so
// the route can attribute the write server-side instead of trusting a client
// field.
//
// Mirrors the domain + email_verified pair that firestore.rules' isStaff() uses,
// so an unverified or out-of-domain token is refused here too.

export type StaffGate =
  | { ok: true; uid: string; email: string }
  | { ok: false; response: NextResponse }

export async function requireStaff(req: NextRequest, bodyToken?: string): Promise<StaffGate> {
  const headerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const idToken = headerToken || bodyToken || ''
  if (!idToken) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken)
    const email = decoded.email ?? ''
    if (!decoded.email_verified || !email.endsWith('@freshket.co')) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden: staff only' }, { status: 403 }) }
    }
    return { ok: true, uid: decoded.uid, email }
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
}
