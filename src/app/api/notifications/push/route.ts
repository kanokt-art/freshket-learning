import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireStaff } from '@/lib/firebase/requireStaff'
import type { NotifType } from '@/types/notification'

// Server-side notification writer.
//
// firestore.rules used to let ANY signed-in employee create a document in ANY
// other employee's notifications subcollection, with arbitrary title/body/link —
// an in-house phishing primitive (a message that looks like it came from the
// system, pointing anywhere). Client create is now denied by the rules and every
// notification comes through here, where:
//   • the sender is taken from the verified token, never from the request body
//   • `type` must be one of the known NotifType values
//   • `refPath` must be an internal path, so a notification can't link off-site
//   • text fields are length-capped
//
// The write itself still uses a deterministic doc id so the same (type, refId)
// pair collapses into one overwrite rather than stacking duplicates — the same
// idempotency the client-side version relied on.

const VALID_TYPES: NotifType[] = [
  'shadow_pending_ack',
  'shadow_ack_received',
  'new_course',
  'heart_received',
]

const MAX_TITLE = 200
const MAX_BODY = 500
const MAX_REF = 200
// Firestore doc ids: no slashes, and keep it well under the 1500-byte limit.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const { targetUid, type, title, notifBody, refId, refPath } = {
    targetUid: body.targetUid,
    type: body.type,
    title: body.title,
    notifBody: body.body,
    refId: body.refId,
    refPath: body.refPath,
  }

  if (typeof targetUid !== 'string' || !UID_RE.test(targetUid)) return bad('Invalid targetUid')
  if (typeof type !== 'string' || !VALID_TYPES.includes(type as NotifType)) return bad('Invalid type')
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE) return bad('Invalid title')
  if (typeof notifBody !== 'string' || notifBody.length > MAX_BODY) return bad('Invalid body')
  if (typeof refId !== 'string' || !refId.trim() || refId.length > MAX_REF) return bad('Invalid refId')
  // Internal paths only — blocks `https://…` and protocol-relative `//host` links.
  if (typeof refPath !== 'string' || !refPath.startsWith('/') || refPath.startsWith('//') || refPath.length > MAX_REF) {
    return bad('refPath must be an internal path')
  }
  // refId lands in the doc id, so it must not introduce a path segment.
  if (refId.includes('/')) return bad('refId must not contain "/"')

  try {
    const db = getAdminFirestore()
    const docId = `${type}_${refId}`
    await db
      .collection('notifications').doc(targetUid)
      .collection('items').doc(docId)
      .set({
        type,
        title: title.trim(),
        body: notifBody,
        refId,
        refPath,
        read: false,
        createdAt: new Date(),
        // Attribution comes from the verified token, so a notification can always
        // be traced back to the account that actually triggered it.
        createdByUid: gate.uid,
      })
    return NextResponse.json({ ok: true, id: docId })
  } catch (err) {
    console.error('notifications/push failed', err)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
