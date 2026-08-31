import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminAuth } from '@/lib/firebase/admin'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

const ALLOWED_DOMAIN = 'freshket.co'

// ── POST /api/users — first-time login, create user document ─────────────────
export async function POST(req: NextRequest) {
  try {
    const { idToken, displayName, photoURL } = await req.json()

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
    }

    // Token verification gets its OWN try/catch so a bad or expired token answers
    // 401, not 500. It used to share the outer catch, which reported every auth
    // failure as "Internal server error" — and because this route is what creates
    // the user document on a first-ever login, a new joiner who hit an expired
    // token saw a server-fault message and the logs pointed at the server instead
    // of at the token. Sibling route /api/auth/verify already got this right.
    let decoded
    try {
      decoded = await getAdminAuth().verifyIdToken(idToken)
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { uid, email } = decoded

    if (!email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return NextResponse.json({ error: 'Unauthorized email domain' }, { status: 403 })
    }

    const db = getAdminFirestore()
    const userRef = db.collection('users').doc(uid)
    const snap = await userRef.get()

    // Already exists — return current data (idempotent)
    if (snap.exists) {
      return NextResponse.json({ uid, ...snap.data() })
    }

    const now = Timestamp.now()
    const newUser = {
      uid,
      email,
      displayName: displayName ?? decoded.name ?? email.split('@')[0],
      photoURL: photoURL ?? decoded.picture ?? null,
      role: 'sale',          // default role — super_admin promotes via PATCH
      createdAt: now,
      updatedAt: now,
    }

    await userRef.set(newUser)
    return NextResponse.json(newUser, { status: 201 })
  } catch (e) {
    console.error('POST /api/users', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET /api/users — list all or single user (server-side / admin panel) ─────
// SECURITY: this uses the Admin SDK, which bypasses Firestore rules entirely, so
// the handler itself is the ONLY gate. It was previously ungated — meaning any
// anonymous caller could GET the whole users collection (email, employeeId,
// department, position, role, managerId, startDate, lineManager) straight off the
// public deployment. No client code calls this endpoint; it is a server/admin
// utility, so it is gated to super_admin like every other Admin-SDK route here.
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(req.url)
    const uid = searchParams.get('uid')
    const db = getAdminFirestore()

    if (uid) {
      const snap = await db.collection('users').doc(uid).get()
      if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ id: snap.id, ...snap.data() })
    }

    const snap = await db.collection('users').orderBy('displayName').get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (e) {
    console.error('GET /api/users', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/users — update role / profile (super_admin only) ──────────────
export async function PATCH(req: NextRequest) {
  // Was a hand-rolled copy of requireSuperAdmin whose verifyIdToken sat inside the
  // outer try, so an expired token answered 500 instead of 401. Using the shared
  // gate fixes the status codes and removes the duplicated logic — one place now
  // decides what "verified super_admin" means for every privileged route.
  const gate = await requireSuperAdmin(req)
  if (!gate.ok) return gate.response

  try {
    const db = getAdminFirestore()
    const body = await req.json()
    const { uid, role, teamId, managerId, department, position, nickname, employeeId } = body

    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 })

    const validRoles = ['sale', 'team_lead', 'manager', 'super_admin']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const update: Record<string, unknown> = { updatedAt: Timestamp.now() }
    if (role !== undefined)        update.role = role
    if (teamId !== undefined)      update.teamId = teamId
    if (managerId !== undefined)   update.managerId = managerId
    if (department !== undefined)  update.department = department
    if (position !== undefined)    update.position = position
    if (nickname !== undefined)    update.nickname = nickname
    if (employeeId !== undefined)  update.employeeId = employeeId

    await db.collection('users').doc(uid).update(update)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('PATCH /api/users', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
