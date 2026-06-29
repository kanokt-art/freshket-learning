import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminAuth } from '@/lib/firebase/admin'
import { getAdminFirestore } from '@/lib/firebase/admin'

const ALLOWED_DOMAIN = 'freshket.co'

// ── POST /api/users — first-time login, create user document ─────────────────
export async function POST(req: NextRequest) {
  try {
    const { idToken, displayName, photoURL } = await req.json()

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
    }

    // Verify token server-side — prevents fake uid/email injection
    const decoded = await getAdminAuth().verifyIdToken(idToken)
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
export async function GET(req: NextRequest) {
  try {
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
  try {
    // Verify caller is super_admin via idToken
    const authHeader = req.headers.get('authorization') ?? ''
    const callerToken = authHeader.replace('Bearer ', '')
    if (!callerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const caller = await getAdminAuth().verifyIdToken(callerToken)
    const db = getAdminFirestore()
    const callerSnap = await db.collection('users').doc(caller.uid).get()
    if (!callerSnap.exists || callerSnap.data()?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: super_admin only' }, { status: 403 })
    }

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
