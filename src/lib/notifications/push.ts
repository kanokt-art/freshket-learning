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

  const { getClientFirestore } = await import('@/lib/firebase/client')
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore')
  const db = getClientFirestore()
  await addDoc(collection(db, 'notifications', targetUid, 'items'), {
    type: notif.type,
    title: notif.title,
    body: notif.body,
    refId: notif.refId,
    refPath: notif.refPath,
    read: false,
    createdAt: serverTimestamp(),
  })
}

export { type NotifType }
