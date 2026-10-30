import { saveShadowAcknowledgment } from '@/hooks/useFirestore'
import { get } from '@/lib/data/collection'
import { pushNotification } from '@/lib/notifications/push'
import { announce } from '@/lib/notifications/announce'
import { reviewId } from '@/lib/shadow/reviews'
import type { ShadowRecord } from '@/types/shadow'

/**
 * A team lead's or manager's review of a Shadow visit: save it under their own id, then
 * tell the person who made the visit. Used by every screen that can review, so they all
 * behave the same.
 *
 * Told ONCE per review, and through one channel:
 *  · editing a review you already gave saves it and tells nobody again;
 *  · the group post and the Slack DM go out together (see the announce route); the in-app
 *    bell is only rung when no Slack DM reached them, so one review is one notice.
 */
export async function submitShadowReview(args: {
  record: Pick<ShadowRecord, 'id' | 'observerUid' | 'observerName' | 'storeName'>
  reviewer: { uid: string; name: string; role: string }
  rating: number
  comment: string
}): Promise<void> {
  const { record, reviewer, rating, comment } = args

  // Read before saving: afterwards the review always exists.
  const alreadyGiven = !!(await get('shadowAcknowledgments', reviewId(record.id, reviewer.uid)).catch(() => null))

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
  if (alreadyGiven || record.observerUid === reviewer.uid) return

  const { dmSent } = await announce({
    kind: 'shadow_acked',
    recordId: record.id,
  })

  if (dmSent === 0) {
    pushNotification(record.observerUid, {
      type: 'shadow_ack_received',
      title: `${reviewer.name || 'Mentor'} ประเมิน Shadow Visit ของคุณ`,
      body: `ร้าน ${record.storeName} · ได้รับ ${rating}/5 ดาว`,
      refId: record.id,
      refPath: '/shadow',
    })
  }
}
