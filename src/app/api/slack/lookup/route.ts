import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireSuperAdmin } from '@/lib/server/auth'
import { findSlackIdByEmail } from '@/lib/notifications/slackDm'
import type { UserProfile } from '@/types/user'

// Find one person's Slack member id from their email and save it, for the "ค้นหาจากอีเมล"
// button on the admin user panel. super_admin only: the id decides who a DM goes to.
//
// The email is read from the stored profile, never taken from the request, so this cannot
// be used to look up an arbitrary address.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const gate = await requireSuperAdmin(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const uid = body.uid
  if (typeof uid !== 'string' || !UID_RE.test(uid)) return NextResponse.json({ error: 'Invalid uid' }, { status: 400 })

  const store = getStore()
  const person = (await store.get('users', uid)) as Partial<UserProfile> | null
  if (!person) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!person.email) return NextResponse.json({ ok: true, found: false, reason: 'no_email' })

  const found = await findSlackIdByEmail(person.email)
  if (found.id) await store.update('users', uid, { slackUserId: found.id })
  return NextResponse.json({ ok: true, found: !!found.id, slackUserId: found.id ?? null, reason: found.reason })
}
