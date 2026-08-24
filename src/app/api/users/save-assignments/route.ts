import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

type Assignment = {
  uid: string
  teamId?: string | null
  visibleTeamIds?: string[] | null
  role?: string
}

const VALID_ROLES = ['sale', 'team_lead', 'manager', 'super_admin']

// POST /api/users/save-assignments
// Writes teamId / visibleTeamIds / role for csv- users via Admin SDK (bypasses Firestore rules)
// Body: { assignments: Assignment[] }
export async function POST(req: NextRequest) {
  try {
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const { assignments } = (await req.json()) as { assignments: Assignment[] }
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: 'No assignments provided' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const targets = assignments.filter(a => !!a.uid)
    const refs = targets.map(a => db.collection('users').doc(a.uid))

    // set(..., {merge:true}) on a uid that no longer exists (e.g. merged away by
    // a dedup run, or a stale id from client cache) silently CREATES an empty
    // doc containing only the patched fields — that produced 32 ghost docs
    // (no uid/email/role) in production. Check existence first and skip instead.
    const existing = refs.length > 0 ? await db.getAll(...refs) : []
    const existsSet = new Set(existing.filter(d => d.exists).map(d => d.id))

    const batch = db.batch()
    const skipped: string[] = []
    let saved = 0

    for (const a of targets) {
      if (!existsSet.has(a.uid)) { skipped.push(a.uid); continue }
      const update: Record<string, unknown> = {}
      if ('teamId' in a) update.teamId = a.teamId ?? null
      if (a.visibleTeamIds !== undefined) update.visibleTeamIds = a.visibleTeamIds
      if (a.role !== undefined && VALID_ROLES.includes(a.role)) update.role = a.role
      if (Object.keys(update).length > 0) {
        batch.update(db.collection('users').doc(a.uid), update)
        saved++
      }
    }

    if (saved > 0) await batch.commit()
    return NextResponse.json({ saved, skipped })
  } catch (e) {
    console.error('POST /api/users/save-assignments', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
