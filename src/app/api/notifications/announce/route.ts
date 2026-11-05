import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { dmPeople, dmPeopleIds } from '@/lib/notifications/slackDm'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { reviewId } from '@/lib/shadow/reviews'
import { requireStaff } from '@/lib/server/auth'
import { formatPersonName } from '@/lib/users/displayName'
import { slackText } from '@/lib/notifications/slackText'
import { resolveAnnouncementText } from '@/lib/notifications/courseAnnouncement'
import { toStars } from '@/lib/feedback/stars'
import { leadReviewId } from '@/lib/feedback/leadReviews'
import { saleTrainers } from '@/lib/server/saleTrainers'
import { notifyTrainers } from '@/lib/server/trainerNotice'
import { ROLEPLAY_TOPICS } from '@/types/roleplay'
import type { UserProfile } from '@/types/user'
import { announceNewShadowVisit } from '@/lib/server/shadowNotice'
import {
  postCoursePublishedToSlack,
  postMandatoryPublishedToSlack,
  postShadowSubmittedToSlack,
  postShadowAckedToSlack,
  postCourseFeedbackToSlack,
  postRoleplayAssessedToSlack,
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

const isLead = (role: string) => role === 'team_lead' || role === 'manager' || role === 'super_admin'

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

type Store = ReturnType<typeof getStore>

/**
 * A learner's private Slack DM about one event, sent at most once — but only marked as sent when it
 * really went out. The channel post's once-only claim used to cover the DM too, so a DM that failed the
 * first time (no Slack id yet, a lookup Slack refused, a missing scope) was never tried again, however
 * often the lead saved. Now a later save tries again until one gets through.
 */
async function dmOnce(store: Store, key: string, uid: string, dm: Parameters<typeof dmPeople>[2]): Promise<number> {
  try {
    if (await store.get('slackPosts', key)) return 0
    const sent = await dmPeople(store, [uid], dm)
    if (sent > 0) await store.claim('slackPosts', key, { kind: 'dm', refId: key, postedAt: new Date() })
    return sent
  } catch (e) {
    console.error('dm failed', key, e)
    return 0
  }
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

        // The bell for everyone who looks after the sender (their manager on file and their team's lead(s)
        // and manager), and the Slack group for a sales visit — once per visit, the same as a visit that
        // arrives through the Google Form (lib/server/shadowNotice.ts). Name, position and department come
        // from the sender's own HR record.
        posted = await announceNewShadowVisit(store, {
          recordId, senderUid: gate.uid, sender: gate.person as Partial<UserProfile>,
          storeName: visit.storeName, segment: visit.segment,
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

        const reviewer = formatPersonName(gate.person as Partial<UserProfile>) || 'Mentor'
        const rating = typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? review.rating : undefined

        // The person whose visit it was gets the score privately — retried on a later save until it gets through.
        const stars = rating !== undefined ? `${rating}/5 ดาว` : ''
        const link = appUrl(`/shadow?visit=${encodeURIComponent(recordId)}`)
        dmSent = await dmOnce(store, `dm:shadow_acked:${rid}`, visit.observerUid, {
          text: `${slackText(reviewer)} ประเมิน Shadow Visit ของคุณ${stars ? ` — ${stars}` : ''}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `⭐ *${slackText(reviewer)}* ประเมิน Shadow Visit ของคุณ${visit.storeName ? `\nร้าน ${slackText(visit.storeName)}` : ''}${stars ? `\nได้รับ *${stars}*` : ''}` } },
            ...(review.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `>${slackText(excerpt(review.comment, 300))}` } }] : []),
            ...(link ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'ดูผลประเมิน' }, url: link }] }] : []),
          ],
        })

        // Once per review: an edit, a retry or a replay announces nothing more in the group.
        const first = await store.claim('slackPosts', `shadow_acked:${rid}`, {
          kind: 'shadow_acked', refId: rid, postedAt: new Date(),
        })
        if (!first) return NextResponse.json({ ok: true, posted: false, dmSent })

        const observerDoc = (await store.get('users', visit.observerUid)) as Partial<UserProfile> | null
        const observer = observerDoc ? formatPersonName(observerDoc) : 'พนักงาน'
        posted = await postShadowAckedToSlack({
          reviewerName: reviewer,
          observerName: observer,
          rating,
          shadowUrl: appUrl('/shadow'),
        })
        if (observerDoc && isSalesDepartment(observerDoc.department)) {
          await notifyTrainers(store, {
            exceptUid: gate.uid, type: 'shadow_ack_received', key: `${recordId}_${gate.uid}`,
            title: `${reviewer} ประเมิน Shadow Visit ของ ${observer}`,
            body: [visit.storeName ? `ร้าน ${visit.storeName}` : '', stars, review.comment ? excerpt(review.comment, 120) : ''].filter(Boolean).join(' · '),
            refId: recordId, refPath: `/shadow?visit=${encodeURIComponent(recordId)}`,
          })
        }
        break
      }

      // A team lead or manager commented on, or rated, a member's course: tell that member (once per
      // lead and course; editing it later tells nobody again). The saved feedback is the source of the
      // words — the caller only names whose it is.
      case 'course_feedback': {
        if (!isLead(gate.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const memberUid = idOf(body.memberUid)
        const courseId = idOf(body.courseId)
        if (!memberUid || !courseId) return bad('Invalid memberUid or courseId')
        if (memberUid === gate.uid) return NextResponse.json({ ok: true, posted: false })

        type Feedback = Doc & { leadUid?: string; comment?: string; score?: number }
        // The caller's own record; a record saved before each reviewer had one is under the shared id.
        const fb = ((await store.get('courseFeedback', leadReviewId(memberUid, courseId, gate.uid))) as Feedback | null)
          ?? ((await store.get('courseFeedback', `${memberUid}_${courseId}`)) as Feedback | null)
        // Only for feedback the caller really gave.
        if (!fb || fb.leadUid !== gate.uid) return NextResponse.json({ ok: true, posted: false })
        const stars = toStars(fb.score)
        const comment = typeof fb.comment === 'string' ? fb.comment.trim() : ''
        if (stars === null && !comment) return NextResponse.json({ ok: true, posted: false })

        const course = (await store.get('courses', courseId)) as (Doc & { title?: string }) | null
        const title = typeof course?.title === 'string' ? course.title : 'หลักสูตร'
        const reviewer = formatPersonName(gate.person as Partial<UserProfile>) || 'Mentor'
        const link = appUrl(`/courses/${courseId}?feedback=1`)
        const starLine = stars !== null ? `${stars}/5 ดาว` : ''

        // The member's DM: once per lead and course, retried on a later save until it gets through.
        dmSent = await dmOnce(store, `dm:course_feedback:${memberUid}_${courseId}:${gate.uid}`, memberUid, {
          text: `${slackText(reviewer)} ให้ความเห็นในหลักสูตร ${slackText(title)}${starLine ? ` — ${starLine}` : ''}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${stars !== null ? '⭐' : '💬'} *${slackText(reviewer)}* ให้ความเห็นในหลักสูตรของคุณ\n*${slackText(title)}*${starLine ? `\nได้รับ *${starLine}*` : ''}` } },
            ...(comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `>${slackText(excerpt(comment, 300))}` } }] : []),
            ...(link ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'ดูหลักสูตร' }, url: link }] }] : []),
          ],
        })

        // The rest (bell, group post, trainer notice) once per lead and course: an edit tells nobody again.
        const first = await store.claim('slackPosts', `course_feedback:${memberUid}_${courseId}:${gate.uid}`, {
          kind: 'course_feedback', refId: `${memberUid}_${courseId}`, postedAt: new Date(),
        })
        if (!first) return NextResponse.json({ ok: true, posted: false, dmSent })

        // The in-app signal too (the learner's home shows it on its sidebar), whether or not the DM went out.
        {
          await store.set(`notifications/${memberUid}/items`, `course_feedback_received_${memberUid}_${courseId}_${gate.uid}`, {
            type: 'course_feedback_received',
            title: `${reviewer} ให้ความเห็นในหลักสูตร ${title}`,
            body: [starLine, comment ? excerpt(comment, 120) : ''].filter(Boolean).join(' · '),
            refId: courseId,
            refPath: `/courses/${courseId}?feedback=1`,
            read: false,
            createdAt: new Date(),
            createdByUid: gate.uid,
          }, { merge: false })
        }

        // The trainer x team-lead group hears it too, tagging the Sale Trainer (sales learners only).
        const learner = (await store.get('users', memberUid)) as Partial<UserProfile> | null
        if (learner && isSalesDepartment(learner.department)) {
          posted = await postCourseFeedbackToSlack({
            reviewerName: reviewer,
            learnerName: formatPersonName(learner) || 'พนักงาน',
            courseTitle: title,
            rating: stars ?? undefined,
            trainers: await saleTrainers(),
            memberUrl: appUrl(`/manager?user=${encodeURIComponent(memberUid)}`),
          })
          // The Sale Trainer reads it in their own notifications (the comment is on the learner's page).
          await notifyTrainers(store, {
            exceptUid: gate.uid, type: 'course_feedback_received', key: `${memberUid}_${courseId}_${gate.uid}`,
            title: `${reviewer} ให้ความเห็น ${formatPersonName(learner) || 'พนักงาน'} ในหลักสูตร ${title}`,
            body: [starLine, comment ? excerpt(comment, 120) : ''].filter(Boolean).join(' · '),
            refId: courseId, refPath: `/manager?user=${encodeURIComponent(memberUid)}&tab=history`,
          })
        }
        break
      }

      // A team lead or manager assessed a member's Role Play: tell that member, once per assessment.
      // The scores come from the saved assessment, not from the caller.
      case 'roleplay_assessed': {
        if (!isLead(gate.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const assessmentId = idOf(body.assessmentId)
        if (!assessmentId) return bad('Invalid assessmentId')
        const a = (await store.get('roleplayAssessments', assessmentId)) as
          | (Doc & { assessorUid?: string; subjectUid?: string; type?: string; round?: number; overallNote?: string; topics?: Array<{ key?: string; rating?: number }> })
          | null
        if (!a?.subjectUid || a.assessorUid !== gate.uid || a.subjectUid === gate.uid) {
          return NextResponse.json({ ok: true, posted: false })
        }

        const ratings = new Map((Array.isArray(a.topics) ? a.topics : []).map((t) => [t.key, t.rating] as const))
        const groups = new Map<string, number[]>()
        for (const t of ROLEPLAY_TOPICS) {
          const r = ratings.get(t.key)
          if (typeof r === 'number' && Number.isFinite(r)) groups.set(t.group, [...(groups.get(t.group) ?? []), r])
        }
        const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
        const all = Array.from(groups.values()).flat()
        const overall = all.length > 0 ? avg(all).toFixed(1) : undefined
        const perGroup = Array.from(groups.entries()).map(([g, xs]) => `${g} ${avg(xs).toFixed(1)}`).join(' · ')

        const assessor = formatPersonName(gate.person as Partial<UserProfile>) || 'Mentor'
        const kindLabel = `${a.type === 'post' ? 'Post' : 'Pre'}${typeof a.round === 'number' ? ` รอบที่ ${a.round}` : ''}`
        const link = appUrl('/courses/roleplay')
        const note = typeof a.overallNote === 'string' ? a.overallNote.trim() : ''

        dmSent = await dmOnce(store, `dm:roleplay_assessed:${assessmentId}`, a.subjectUid, {
          text: `${slackText(assessor)} ประเมิน Role Play ของคุณ${overall ? ` — เฉลี่ย ${overall}/10` : ''}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `🎯 *${slackText(assessor)}* ประเมิน Role Play ของคุณ\n${kindLabel}${overall ? ` · คะแนนเฉลี่ย *${overall}/10*` : ''}` } },
            ...(perGroup ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: slackText(perGroup) }] }] : []),
            ...(note ? [{ type: 'section', text: { type: 'mrkdwn', text: `>${slackText(excerpt(note, 300))}` } }] : []),
            ...(link ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'ดูผลประเมิน' }, url: link }] }] : []),
          ],
        })

        // The rest once per assessment.
        const first = await store.claim('slackPosts', `roleplay_assessed:${assessmentId}`, {
          kind: 'roleplay_assessed', refId: assessmentId, postedAt: new Date(),
        })
        if (!first) return NextResponse.json({ ok: true, posted: false, dmSent })
        {
          await store.set(`notifications/${a.subjectUid}/items`, `roleplay_assessed_${assessmentId}`, {
            type: 'roleplay_assessed',
            title: `${assessor} ประเมิน Role Play ของคุณ`,
            body: [kindLabel, overall ? `เฉลี่ย ${overall}/10` : ''].filter(Boolean).join(' · '),
            refId: assessmentId,
            refPath: '/courses/roleplay',
            read: false,
            createdAt: new Date(),
            createdByUid: gate.uid,
          }, { merge: false })
        }

        const learner = (await store.get('users', a.subjectUid)) as Partial<UserProfile> | null
        if (learner && isSalesDepartment(learner.department)) {
          posted = await postRoleplayAssessedToSlack({
            assessorName: assessor,
            learnerName: formatPersonName(learner) || 'พนักงาน',
            kindLabel,
            overall,
            perGroup: perGroup || undefined,
            trainers: await saleTrainers(),
            memberUrl: appUrl(`/manager?user=${encodeURIComponent(a.subjectUid)}`),
          })
          await notifyTrainers(store, {
            exceptUid: gate.uid, type: 'roleplay_assessed', key: assessmentId,
            title: `${assessor} ประเมิน Role Play ของ ${formatPersonName(learner) || 'พนักงาน'}`,
            body: [kindLabel, overall ? `เฉลี่ย ${overall}/10` : ''].filter(Boolean).join(' · '),
            refId: assessmentId, refPath: `/manager?user=${encodeURIComponent(a.subjectUid)}&tab=radar`,
          })
        }
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
