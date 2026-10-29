import { saveShadowAcknowledgment } from '@/hooks/useFirestore'
import { pushNotification } from '@/lib/notifications/push'
import { announce } from '@/lib/notifications/announce'
import type { ShadowRecord } from '@/types/shadow'

/**
 * A team lead's or manager's review of a Shadow visit: save it under their own id, then
 * tell the person who made the visit. Used by every screen that can review, so they all
 * behave the same.
 */
export async function submitShadowReview(args: {
  record: Pick<ShadowRecord, 'id' | 'observerUid' | 'observerName' | 'storeName'>
  reviewer: { uid: string; name: string; role: string }
  rating: number
  comment: string
}): Promise<void> {
  const { record, reviewer, rating, comment } = args

  await saveShadowAcknowledgment(record.id, {
    recordId: record.id,
    reviewerUid: reviewer.uid,
    reviewerName: reviewer.name,
    reviewerRole: reviewer.role,
    rating,
    comment,
    reviewedAt: new Date(),
  })

  // The review is saved; telling the observer is best effort and never undoes it.
  if (record.observerUid !== reviewer.uid) {
    pushNotification(record.observerUid, {
      type: 'shadow_ack_received',
      title: `${reviewer.name || 'Mentor'} ประเมิน Shadow Visit ของคุณ`,
      body: `ร้าน ${record.storeName} · ได้รับ ${rating}/5 ดาว`,
      refId: record.id,
      refPath: '/shadow',
    })
    void announce({
      kind: 'shadow_acked',
      recordId: record.id,
      reviewerName: reviewer.name || 'Mentor',
      observerName: record.observerName || 'พนักงาน',
      rating,
      path: '/shadow',
    })
  }
}
