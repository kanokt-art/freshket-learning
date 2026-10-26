import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireStaff } from '@/lib/server/auth'
import { postTakeAwayToSlack, isSalesDepartment } from '@/lib/notifications/slack'
import type { UserProfile } from '@/types/user'

// Slack mirror for Key Take Away (สรุปหลังเรียน).
//
// The takeaway itself is written straight to the database by the browser
// (saveTakeAway in courses/[id]/page.tsx) and that stays as it is — this route
// exists only because SLACK_WEBHOOK_URL is server-only and a client cannot post
// to Slack without leaking it.
//
// The learner's identity comes from the verified token, never from the body, so
// nobody can post a summary to the channel under someone else's name. The text
// is re-read from the database for the same reason: the excerpt that reaches Slack
// is the one that was actually saved, not whatever the caller sends.

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response
  const uid = gate.uid

  const courseId = body.courseId
  if (typeof courseId !== 'string' || !ID_RE.test(courseId)) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  try {
    const store = getStore()

    const takeaway = await store.get('takeaways', `${uid}_${courseId}`) as { text?: string; courseTitle?: string } | null
    if (!takeaway) {
      // The client calls this right after its own write; if that write hasn't
      // landed there is nothing to quote yet. Not an error — just nothing to do.
      return NextResponse.json({ ok: true, posted: false })
    }
    const text = (takeaway.text ?? '').trim()
    if (!text) return NextResponse.json({ ok: true, posted: false })

    const user = ((await store.get('users', uid)) ?? {}) as Partial<UserProfile>
    if (!isSalesDepartment(user.department)) {
      return NextResponse.json({ ok: true, posted: false })
    }

    // Editing a takeaway re-saves it, and the channel doesn't need every
    // revision — only the first save announces.
    const first = await store.claim('slackPosts', `takeaway_${uid}_${courseId}`, { postedAt: new Date(), kind: 'takeaway' })
    if (!first) return NextResponse.json({ ok: true, posted: false, reason: 'already-posted' })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')
    const posted = await postTakeAwayToSlack({
      learnerName: (user.displayNameEN?.trim() || user.displayName || user.email || 'พนักงาน')
        + (user.nickname ? ` (${user.nickname})` : ''),
      position: user.position,
      department: user.department,
      courseTitle: takeaway.courseTitle || '',
      text,
      // Deep-links to this learner's card on the team page, where the full
      // reflection sits next to their scores and the lead's comment box —
      // the course page would show the reader the course, not the person.
      memberUrl: appUrl ? `${appUrl}/manager?user=${encodeURIComponent(uid)}` : undefined,
    })

    return NextResponse.json({ ok: true, posted })
  } catch (err) {
    // Best-effort, like every other notification path: the takeaway is already
    // saved, so a failure here must not read as a failed save to the learner.
    console.error('takeaway/notify failed', err)
    return NextResponse.json({ ok: true, posted: false })
  }
}
