import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import { reviewId } from '@/lib/shadow/reviews'
import { formatPersonName } from '@/lib/users/displayName'
import type { NotifType } from '@/types/notification'
import type { UserProfile } from '@/types/user'

// Server-side notification writer — the IN-APP BELL only.
//
// Creating a notification is server-only (policies.ts denies client creates), because a
// notification looks like it came from the system: if anyone could write one into
// anyone's feed with their own words, it is a ready-made internal phishing message. So
// this route does not simply store what it is given. By type:
//
//  · new_course / new_mandatory — a super_admin publishing. They write the text; nobody
//    else can create these.
//  · shadow_pending_ack — only the person who made the visit, and only to their own
//    manager. The wording is composed here from the stored visit.
//  · shadow_ack_received — only a reviewer who has given a review of that visit, and only
//    to the person whose visit it was. The wording is composed here from the stored review.
//
// Every other type, including the unused heart_received, is refused. `refPath` must be an
// internal path. The write uses a deterministic doc id so the same event collapses into
// one overwrite rather than stacking duplicates.

const VALID_TYPES: NotifType[] = ['shadow_pending_ack', 'shadow_ack_received', 'new_course', 'new_mandatory']

const MAX_TITLE = 200
const MAX_BODY = 500
const MAX_REF = 200
// Ids are one path segment: no slashes, and a sensible length.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}
const forbidden = (message = 'Forbidden') => NextResponse.json({ error: message }, { status: 403 })

type Doc = Record<string, unknown>

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
  if (typeof refId !== 'string' || !refId.trim() || refId.length > MAX_REF) return bad('Invalid refId')
  // refId lands in the doc id, so it must not introduce a path segment.
  if (refId.includes('/')) return bad('refId must not contain "/"')

  try {
    const store = getStore()
    let docTitle: string
    let docBody: string
    let docPath: string
    let docId = `${type}_${refId}`

    if (type === 'new_course' || type === 'new_mandatory') {
      // Publishing is a super_admin action; the text is theirs.
      if (!gate.isSuperAdmin) return forbidden('Forbidden: super_admin only')
      if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE) return bad('Invalid title')
      if (typeof notifBody !== 'string' || notifBody.length > MAX_BODY) return bad('Invalid body')
      // Internal paths only — blocks `https://…` and protocol-relative `//host` links.
      if (typeof refPath !== 'string' || !refPath.startsWith('/') || refPath.startsWith('//') || refPath.length > MAX_REF) {
        return bad('refPath must be an internal path')
      }
      docTitle = title.trim()
      docBody = notifBody
      docPath = refPath
    } else if (type === 'shadow_pending_ack') {
      // The visit's own author, telling their own manager.
      const visit = (await store.get('shadowRecords', refId)) as (Doc & { observerUid?: string; storeName?: string; segment?: string }) | null
      if (!visit || visit.observerUid !== gate.uid) return forbidden()
      const managerId = (gate.person as Partial<UserProfile>).managerId
      if (!managerId || managerId !== targetUid) return forbidden()
      docTitle = `${formatPersonName(gate.person as Partial<UserProfile>) || 'พนักงาน'} ส่ง Shadow Visit ใหม่`
      docBody = `ร้าน ${visit.storeName ?? ''}${visit.segment ? ` · ${visit.segment}` : ''} · รอการ Acknowledge`
      docPath = '/shadow'
    } else {
      // shadow_ack_received: a reviewer who really reviewed it, telling the person whose visit it was.
      const [visit, review] = await Promise.all([
        store.get('shadowRecords', refId) as Promise<(Doc & { observerUid?: string; storeName?: string }) | null>,
        store.get('shadowAcknowledgments', reviewId(refId, gate.uid)) as Promise<(Doc & { rating?: number }) | null>,
      ])
      if (!visit || !review || visit.observerUid !== targetUid || targetUid === gate.uid) return forbidden()
      const stars = typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? review.rating : null
      docTitle = `${formatPersonName(gate.person as Partial<UserProfile>) || 'Mentor'} ประเมิน Shadow Visit ของคุณ`
      docBody = `ร้าน ${visit.storeName ?? ''}${stars !== null ? ` · ได้รับ ${stars}/5 ดาว` : ''}`
      docPath = '/shadow'
      // Each reviewer's notice is its own: a manager's does not overwrite the team lead's.
      docId = `${type}_${refId}_${gate.uid}`
    }

    await store.set(`notifications/${targetUid}/items`, docId, {
      type,
      title: docTitle,
      body: docBody,
      refId,
      refPath: docPath,
      read: false,
      createdAt: new Date(),
      // Attribution comes from the verified token, so a notification can always
      // be traced back to the account that actually triggered it.
      createdByUid: gate.uid,
    }, { merge: false })
    return NextResponse.json({ ok: true, id: docId })
  } catch (err) {
    console.error('notifications/push failed', err)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
