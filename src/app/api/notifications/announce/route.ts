import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { dmPeople, leadsOf } from '@/lib/notifications/slackDm'
import { courseAudience, type AudienceCourse } from '@/lib/courses/audience'
import { reviewId } from '@/lib/shadow/reviews'
import { requireStaff } from '@/lib/server/auth'
import type { UserProfile } from '@/types/user'
import {
  postCoursePublishedToSlack,
  postMandatoryPublishedToSlack,
  postShadowSubmittedToSlack,
  postShadowAckedToSlack,
  isSalesDepartment,
  excerpt,
} from '@/lib/notifications/slack'

// Announce a training event to the Slack channel.
//
// Replaces POST /api/notifications/push, which wrote one document per
// recipient into notifications/{uid}/items to feed an in-app bell. The bell is
// gone: the team lives in Slack, and a shared channel says the same things
// without the app having to store, index, and age out a per-person feed.
//
// SERVER ONLY, for two reasons that both still hold now that nothing is
// persisted: the webhook URL is a bearer credential that must not reach the
// browser, and the caller must not get to choose what the message says. The
// client sends an event kind plus its facts; the wording is composed here and
// in lib/notifications/slack. A client that could pass arbitrary text into a
// channel the whole company reads is the same in-house phishing primitive the
// old route was hardened against — the fix carries over.
//
// ONE REQUEST PER EVENT, not per recipient. The old route was called in a loop
// over the audience and needed a claim document in `slackPosts` to stop the
// same visit being posted once per team lead. Callers now send a single
// request carrying a headcount, so that whole mechanism is unnecessary.
//
// Best-effort by contract: Slack failing must never fail the action that
// triggered it. The route answers 200 with `{ posted: false }` when the
// webhook is unset or Slack rejects the message.

const MAX_TEXT = 300
const MAX_LIST = 50

type Body = Record<string, unknown>

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** A caller-supplied string that will be rendered into a channel message. */
function text(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > max) return null
  return t
}

/** Person ids the client says were notified; only ever used to NARROW who the server messages. */
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/
function uidList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && UID_RE.test(x)).slice(0, 3000)
}
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const isActivePerson = (u: Partial<UserProfile>) => !u.employmentStatus || u.employmentStatus === 'Active'

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

/**
 * Build an absolute link from an INTERNAL path.
 *
 * The path is pinned to this app's own origin, so a caller cannot turn a
 * channel post into a link to somewhere else — the same restriction the old
 * route placed on `refPath`.
 */
function appUrl(path: unknown): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (!base || typeof path !== 'string') return undefined
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 200) return undefined
  return `${base}${path}`
}

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
    let posted = false

    switch (kind) {
      case 'course_published': {
        const courseTitle = text(body.courseTitle)
        if (!courseTitle) return bad('Invalid courseTitle')

        // Each learner is also told privately (Slack link on file). Only an admin publishes,
        // so only an admin triggers this; the course, its audience and the wording all come
        // from the database, and the client's list can only narrow it.
        const courseId = typeof body.courseId === 'string' && ID_RE.test(body.courseId) ? body.courseId : null
        const wanted = uidList(body.recipientUids)
        if (gate.isSuperAdmin && courseId && wanted.length > 0) {
          const store = getStore()
          const course = (await store.get('courses', courseId)) as (AudienceCourse & { isPublished?: boolean; title?: string }) | null
          if (course?.isPublished) {
            const people = (await store.getMany('users', wanted)) as unknown as Array<Partial<UserProfile> & { uid: string; role: string }>
            const inAudience = new Set(courseAudience(course, people).map((u) => u.uid))
            const link = appUrl(`/courses/${courseId}`)
            const title = course.title || courseTitle
            const added = body.isAddition === true
            await dmPeople(store, people.filter((u) => inAudience.has(u.uid) && u.uid !== gate.uid).map((u) => u.uid), {
              text: added ? `คุณถูกเพิ่มเข้าหลักสูตร "${title}"` : `มีหลักสูตรใหม่ส่งถึงคุณ: ${title}`,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: added ? `📚 คุณถูกเพิ่มเข้าหลักสูตร\n*${title}*` : `📚 มีหลักสูตรใหม่ส่งถึงคุณ\n*${title}*` } },
                ...(link ? [{ type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'เริ่มเรียน' }, url: link }] }] : []),
              ],
            }, isActivePerson)
          }
        }
        posted = await postCoursePublishedToSlack({
          courseTitle,
          recipientCount: count(body.recipientCount),
          isAddition: body.isAddition === true,
          courseUrl: appUrl(body.path),
        })
        break
      }

      case 'mandatory_published': {
        const title = text(body.title)
        if (!title) return bad('Invalid title')

        // Same rule as courses: private messages are decided from the stored item.
        const itemId = typeof body.itemId === 'string' && ID_RE.test(body.itemId) ? body.itemId : null
        const wantedUids = uidList(body.recipientUids)
        if (gate.isSuperAdmin && itemId && wantedUids.length > 0) {
          const store = getStore()
          const item = (await store.get('mandatoryItems', itemId)) as { isPublished?: boolean; title?: string; weekLabel?: string; departmentAccess?: Array<{ department?: string }> } | null
          if (item?.isPublished) {
            const depts = (Array.isArray(item.departmentAccess) ? item.departmentAccess : []).map((a) => a.department).filter((d): d is string => !!d)
            const link = appUrl('/courses/mandatory')
            const itemTitle = item.title || title
            await dmPeople(store, wantedUids.filter((id) => id !== gate.uid), {
              text: `Mandatory Reading ใหม่: ${itemTitle}`,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: `📌 *Mandatory Reading ใหม่*\n*${itemTitle}*` } },
                ...(item.weekLabel ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: item.weekLabel }] }] : []),
                ...(link ? [{ type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'เปิดอ่าน' }, url: link }] }] : []),
              ],
            }, (u) => isActivePerson(u) && (depts.length === 0 || (!!u.department && depts.includes(u.department))))
          }
        }
        const departments = Array.isArray(body.departments)
          ? body.departments.filter((d): d is string => typeof d === 'string').slice(0, MAX_LIST)
          : []
        posted = await postMandatoryPublishedToSlack({
          title,
          departments,
          recipientCount: count(body.recipientCount),
          url: appUrl(body.path),
        })
        break
      }

      case 'shadow_submitted': {
        const visitSummary = text(body.visitSummary)
        if (!visitSummary) return bad('Invalid visitSummary')

        // Name, position and department are read from the sender's own HR
        // record rather than taken from the request: the caller is already
        // identified by the verified token, so there is no reason to let it
        // describe itself, and this keeps the channel's wording consistent
        // with the rest of the app (English name plus nickname).
        const sender = ((await getStore().get('users', gate.uid)) ?? {}) as Partial<UserProfile>

        // The sender's team lead(s) are told privately, whatever the department:
        // the channel post below is gated to sales, a lead's DM is not.
        const senderName = (sender.displayNameEN?.trim() || sender.displayName || 'พนักงาน')
          + (sender.nickname ? ` (${sender.nickname})` : '')
        const link = appUrl(body.path)
        await dmPeople(getStore(), await leadsOf(getStore(), sender), {
          text: `${senderName} ส่ง Shadow Visit ใหม่ — รอการประเมิน`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `📋 *${senderName}* ส่ง Shadow Visit ใหม่ — _รอการประเมิน_
${visitSummary}` } },
            ...(link ? [{ type: 'actions', elements: [{ type: 'button', style: 'primary', text: { type: 'plain_text', text: 'เข้าไปประเมิน' }, url: link }] }] : []),
          ],
        })

        // Only sales visits go to the channel — the same gate the old push
        // route applied, kept so this change does not quietly widen who the
        // channel hears about.
        if (!isSalesDepartment(sender.department)) {
          return NextResponse.json({ ok: true, posted: false })
        }

        posted = await postShadowSubmittedToSlack({
          observerName: (sender.displayNameEN?.trim() || sender.displayName || 'พนักงาน')
            + (sender.nickname ? ` (${sender.nickname})` : ''),
          position: sender.position,
          department: sender.department,
          visitSummary,
          shadowUrl: appUrl(body.path),
        })
        break
      }

      case 'shadow_acked': {
        const reviewerName = text(body.reviewerName, 120)
        const observerName = text(body.observerName, 120)
        if (!reviewerName || !observerName) return bad('Invalid reviewerName or observerName')
        const rating = typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5
          ? body.rating
          : undefined
        // The person whose visit it was gets the score privately. Who that is and what
        // was given are read from the database, not from the request: the review must
        // exist under the caller's own id, so this cannot be used to message someone
        // with text of the caller's choosing.
        const recordId = typeof body.recordId === 'string' && body.recordId.length <= 200 ? body.recordId : null
        if (recordId) {
          const store = getStore()
          const [visit, review] = await Promise.all([
            store.get('shadowRecords', recordId) as Promise<{ observerUid?: string; storeName?: string } | null>,
            store.get('shadowAcknowledgments', reviewId(recordId, gate.uid)) as Promise<{ rating?: number; comment?: string; reviewerName?: string; reviewerRole?: string } | null>,
          ])
          if (visit?.observerUid && review && visit.observerUid !== gate.uid) {
            const stars = typeof review.rating === 'number' ? `${review.rating}/5 ดาว` : ''
            const who = review.reviewerName?.trim() || reviewerName
            const link = appUrl(body.path)
            await dmPeople(store, [visit.observerUid], {
              text: `${who} ประเมิน Shadow Visit ของคุณ${stars ? ` — ${stars}` : ''}`,
              blocks: [
                { type: 'section', text: { type: 'mrkdwn', text: `⭐ *${who}* ประเมิน Shadow Visit ของคุณ${visit.storeName ? `
ร้าน ${visit.storeName}` : ''}${stars ? `
ได้รับ *${stars}*` : ''}` } },
                ...(review.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `>${excerpt(review.comment, 300)}` } }] : []),
                ...(link ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'ดูผลประเมิน' }, url: link }] }] : []),
              ],
            })
          }
        }
        posted = await postShadowAckedToSlack({
          reviewerName,
          observerName,
          rating,
          shadowUrl: appUrl(body.path),
        })
        break
      }

      default:
        return bad('Unknown kind')
    }

    // 200 either way: `posted: false` means Slack is unconfigured or refused,
    // which is not the caller's problem and must not surface as a failure in
    // the UI that triggered it.
    return NextResponse.json({ ok: true, posted })
  } catch (err) {
    console.error('announce failed', err)
    return NextResponse.json({ ok: true, posted: false })
  }
}
