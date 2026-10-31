import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { dmPeople, dmPeopleIds } from '@/lib/notifications/slackDm'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { reviewId } from '@/lib/shadow/reviews'
import { requireStaff } from '@/lib/server/auth'
import { formatPersonName } from '@/lib/users/displayName'
import { slackText } from '@/lib/notifications/slackText'
import { resolveAnnouncementText } from '@/lib/notifications/courseAnnouncement'
import type { UserProfile } from '@/types/user'
import {
  postCoursePublishedToSlack,
  postMandatoryPublishedToSlack,
  postShadowSubmittedToSlack,
  postShadowAckedToSlack,
  isSalesDepartment,
  excerpt,
} from '@/lib/notifications/slack'

// Announce a training event in Slack.
//
// SERVER ONLY, and the caller does not get to say what the message says. The browser
// names the event and the record it is about (a course id, a visit id); the facts and
// the wording come from here and from the database. Anything else would let any
// signed-in employee put their own text, links and @channel into a channel the whole
// company reads — an in-house phishing primitive.
//
//  · Publishing events (a course, a Mandatory Reading) are for a super_admin: that is
//    who publishes. The title and audience are read from the stored course / item.
//  · A Shadow Visit announcement must be about a visit the caller made, and a review
//    announcement about a review the caller gave. Each is announced once.
//  · Everything dynamic is escaped for Slack (slackText) before it is written.
//
// Best-effort by contract: Slack failing must never fail the action that triggered it.
// The route answers 200 with `{ posted: false }` when nothing was posted.

const MAX_LIST = 3000

type Body = Record<string, unknown>

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

const notAllowed = () => NextResponse.json({ error: 'Forbidden: super_admin only' }, { status: 403 })

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const idOf = (v: unknown): string | null => (typeof v === 'string' && ID_RE.test(v) ? v : null)

/** Person ids the client says were notified; only ever used to NARROW who the server messages. */
function uidList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(0, MAX_LIST)
}

const isActivePerson = (u: Partial<UserProfile>) => !u.employmentStatus || u.employmentStatus === 'Active'

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

/**
 * Build an absolute link from an INTERNAL path chosen by this server (never by the caller),
 * pinned to this app's own origin.
 */
function appUrl(path: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (!base || !path.startsWith('/') || path.startsWith('//')) return undefined
  return `${base}${path}`
}

type Doc = Record<string, unknown>

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return bad('Invalid JSON body')
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const kind = body.kind

  try {
    const store = getStore()
    let posted = false
    let dmSent = 0
    let dmUids: string[] = []

    switch (kind) {
      case 'course_published': {
        if (!gate.isSuperAdmin) return notAllowed()
        const courseId = idOf(body.courseId)
        if (!courseId) return bad('Invalid courseId')
        const course = (await store.get('courses', courseId)) as (Doc & { isPublished?: boolean; title?: string; description?: string }) | null
        if (!course?.isPublished || typeof course.title !== 'string' || !course.title) return bad('Course not found or not published')

        // The admin's edits from the preview (super_admin only, clamped, escaped when posted) replace
        // the course's own title and description; what they left alone comes from the course.
        const text = resolveAnnouncementText({ title: course.title, description: course.description }, body)
        posted = await postCoursePublishedToSlack({
          courseTitle: text.title,
          description: text.description || undefined,
          recipientCount: count(body.recipientCount),
          isAddition: body.isAddition === true,
          courseUrl: appUrl(`/courses/${courseId}`),
        })
        break
      }

      case 'mandatory_published': {
        if (!gate.isSuperAdmin) return notAllowed()
        const itemId = idOf(body.itemId)
        if (!itemId) return bad('Invalid itemId')
        const item = (await store.get('mandatoryItems', itemId)) as
          | (Doc & { isPublished?: boolean; title?: string; weekLabel?: string; departmentAccess?: Array<{ department?: string }> })
          | null
        if (!item?.isPublished || typeof item.title !== 'string' || !item.title) return bad('Item not found or not published')

        const depts = (Array.isArray(item.departmentAccess) ? item.departmentAccess : [])
          .map((a) => a.department)
          .filter((d): d is string => !!d)
        const link = appUrl('/courses/mandatory')
        const itemTitle = slackText(item.title)

        // Each person in the item's departments is also messaged privately (Slack link on
        // file). The client's list can only narrow it; the departments come from the item.
        const wanted = uidList(body.recipientUids).filter((id) => id !== gate.uid)
        if (wanted.length > 0) {
          dmUids = await dmPeopleIds(store, wanted, {
            text: `Mandatory Reading ใหม่: ${itemTitle}`,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: `📌 *Mandatory Reading ใหม่*\n*${itemTitle}*` } },
              ...(item.weekLabel ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: slackText(item.weekLabel) }] }] : []),
              ...(link ? [{ type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'เปิดอ่าน' }, url: link }] }] : []),
            ],
          }, (u) => isActivePerson(u) && !!u.department && (depts.length === 0 ? PHASE1_DEPARTMENTS.has(u.department) : depts.includes(u.department)))
        }

        posted = await postMandatoryPublishedToSlack({
          title: item.title,
          departments: depts,
          recipientCount: count(body.recipientCount),
          url: link,
        })
        break
      }

      case 'shadow_submitted': {
        const recordId = idOf(body.recordId)
        if (!recordId) return bad('Invalid recordId')
        const visit = (await store.get('shadowRecords', recordId)) as (Doc & { observerUid?: string; storeName?: string; segment?: string }) | null
        // Only the person who made the visit announces it.
        if (!visit || visit.observerUid !== gate.uid) return NextResponse.json({ ok: true, posted: false })

        // Name, position and department come from the sender's own HR record.
        const sender = gate.person as Partial<UserProfile>

        // Only sales visits go to the channel.
        if (!isSalesDepartment(sender.department)) {
          return NextResponse.json({ ok: true, posted: false })
        }

        // Once per visit: asking again (a retry, a replay) posts nothing more.
        const first = await store.claim('slackPosts', `shadow_submitted:${recordId}`, {
          kind: 'shadow_submitted', refId: recordId, postedAt: new Date(),
        })
        if (!first) return NextResponse.json({ ok: true, posted: false })

        const parts = [visit.storeName ? `ร้าน ${visit.storeName}` : null, visit.segment || null].filter(Boolean)
        posted = await postShadowSubmittedToSlack({
          observerName: formatPersonName(sender),
          position: sender.position,
          department: sender.department,
          visitSummary: slackText([...parts, 'รอการประเมิน'].join(' · ')),
          shadowUrl: appUrl('/shadow'),
        })
        break
      }

      case 'shadow_acked': {
        const recordId = idOf(body.recordId)
        if (!recordId) return bad('Invalid recordId')
        const rid = reviewId(recordId, gate.uid)
        const [visit, review] = await Promise.all([
          store.get('shadowRecords', recordId) as Promise<(Doc & { observerUid?: string; storeName?: string }) | null>,
          store.get('shadowAcknowledgments', rid) as Promise<(Doc & { rating?: number; comment?: string }) | null>,
        ])
        // Only for a review the caller really gave, on someone else's visit.
        if (!visit?.observerUid || !review || visit.observerUid === gate.uid) {
          return NextResponse.json({ ok: true, posted: false })
        }

        // Once per review: an edit, a retry or a replay announces nothing more.
        const first = await store.claim('slackPosts', `shadow_acked:${rid}`, {
          kind: 'shadow_acked', refId: rid, postedAt: new Date(),
        })
        if (!first) return NextResponse.json({ ok: true, posted: false })

        const reviewer = formatPersonName(gate.person as Partial<UserProfile>) || 'Mentor'
        const observerDoc = (await store.get('users', visit.observerUid)) as Partial<UserProfile> | null
        const observer = observerDoc ? formatPersonName(observerDoc) : 'พนักงาน'
        const rating = typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? review.rating : undefined

        // The person whose visit it was gets the score privately.
        const stars = rating !== undefined ? `${rating}/5 ดาว` : ''
        const link = appUrl('/shadow')
        dmSent = await dmPeople(store, [visit.observerUid], {
          text: `${slackText(reviewer)} ประเมิน Shadow Visit ของคุณ${stars ? ` — ${stars}` : ''}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `⭐ *${slackText(reviewer)}* ประเมิน Shadow Visit ของคุณ${visit.storeName ? `\nร้าน ${slackText(visit.storeName)}` : ''}${stars ? `\nได้รับ *${stars}*` : ''}` } },
            ...(review.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `>${slackText(excerpt(review.comment, 300))}` } }] : []),
            ...(link ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'ดูผลประเมิน' }, url: link }] }] : []),
          ],
        })

        posted = await postShadowAckedToSlack({
          reviewerName: reviewer,
          observerName: observer,
          rating,
          shadowUrl: link,
        })
        break
      }

      default:
        return bad('Unknown kind')
    }

    // 200 either way: `posted: false` means Slack is unconfigured or refused,
    // which is not the caller's problem and must not surface as a failure in
    // the UI that triggered it.
    return NextResponse.json({ ok: true, posted, dmSent: dmSent || dmUids.length, dmUids })
  } catch (err) {
    console.error('announce failed', err)
    return NextResponse.json({ ok: true, posted: false })
  }
}
