import { NextRequest, NextResponse } from 'next/server'
import { getStore, StoreError } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'

// Creating a user on first login used to be POST here. It is now
// POST /api/auth/session, which also links a login to the profile HR already
// imported for that email instead of minting a second one.

// ── GET /api/users — list all or single user (server-side / admin panel) ─────
// SECURITY: this runs on the server, where the access rules in policies.ts do
// not apply, so the handler itself is the ONLY gate. It was previously ungated —
// meaning any anonymous caller could GET the whole users collection (email,
// employeeId, department, position, role, managerId, startDate, lineManager)
// straight off the public deployment. No client code calls this endpoint; it is
// a server/admin utility, so it is gated to super_admin like every other
// privileged route here.
export async function GET(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(req.url)
    const uid = searchParams.get('uid')
    const store = getStore()

    if (uid) {
      const user = await store.get('users', uid)
      if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(user)
    }

    return NextResponse.json(await store.query('users', { orderBy: [{ field: 'displayName', direction: 'asc' }] }))
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
    const body = await req.json()
    const { uid, role, teamId, managerId, department, position, nickname, employeeId } = body

    if (!uid) return NextResponse.json({ error: 'Missing uid' }, { status: 400 })

    const validRoles = ['sale', 'team_lead', 'manager', 'super_admin']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (role !== undefined)        update.role = role
    if (teamId !== undefined)      update.teamId = teamId
    if (managerId !== undefined)   update.managerId = managerId
    if (department !== undefined)  update.department = department
    if (position !== undefined)    update.position = position
    if (nickname !== undefined)    update.nickname = nickname
    if (employeeId !== undefined)  update.employeeId = employeeId

    await getStore().update('users', uid, update)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof StoreError && e.code === 'not-found') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('PATCH /api/users', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
