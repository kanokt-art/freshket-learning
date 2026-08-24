import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import type { NotifType, AppNotification } from '@/types/notification'

const DEMO_MODE = getDemoMode()

export async function pushNotification(
  targetUid: string,
  payload: Pick<AppNotification, 'type' | 'title' | 'body' | 'refId' | 'refPath'>,
) {
  const notif: AppNotification = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...payload,
    read: false,
    createdAt: new Date(),
  }

  if (DEMO_MODE) {
    demoStore.pushNotification(targetUid, notif)
    return
  }

  // Routed through the server (POST /api/notifications/push) rather than written
  // straight from the client. firestore.rules now denies client creates: it used
  // to allow ANY signed-in employee to write into ANY other employee's
  // notification feed with arbitrary text and link, which is a phishing
  // primitive. The route re-derives the sender from the verified ID token,
  // validates the type/link, and writes with the Admin SDK.
  //
  // Still best-effort and fire-and-forget: a notification must never break the
  // action that triggered it (saving a course, submitting a shadow visit), so a
  // failure is logged rather than thrown.
  try {
    const { authedFetch } = await import('@/lib/api/authedFetch')
    const res = await authedFetch('/api/notifications/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUid,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        refId: notif.refId,
        refPath: notif.refPath,
      }),
    })
    if (!res.ok) {
      console.error('pushNotification rejected for', targetUid, res.status, await res.text())
    }
  } catch (err) {
    console.error('pushNotification failed for', targetUid, err)
  }
}

export { type NotifType }
