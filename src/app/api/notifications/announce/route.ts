import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/firebase/requireStaff'
import {
  postCoursePublishedToSlack,
  postMandatoryPublishedToSlack,
  postShadowSubmittedToSlack,
  postShadowAckedToSlack,
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
        const observerName = text(body.observerName, 120)
        const visitSummary = text(body.visitSummary)
        if (!observerName || !visitSummary) return bad('Invalid observerName or visitSummary')
        posted = await postShadowSubmittedToSlack({
          observerName,
          position: text(body.position, 120) ?? undefined,
          department: text(body.department, 120) ?? undefined,
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
