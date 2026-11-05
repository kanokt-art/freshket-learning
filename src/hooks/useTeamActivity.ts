'use client'

import { useMemo } from 'react'
import { useFirestoreList, useAllTrainingRecords, useAllShadowAcknowledgments } from '@/hooks/useFirestore'
import { getDemoMode } from '@/lib/demo/demoMode'
import { MOCK_TAKEAWAYS } from '@/lib/utils/mockData'
import {
  buildTeamActivity, type TeamActivity, type ActivityRecord, type ActivityTakeaway, type ActivityShadow, type ActivityReview,
} from '@/lib/team/teamActivity'

const DEMO_MODE = getDemoMode()

// The data door takes up to 500 values in one `in`; a bigger roster (a manager over a whole department)
// reads the newest rows instead and keeps the members' here.
const MAX_IN = 500
const RECENT = 500

const daysAgo = (n: number, hour = 10) => {
  const d = new Date(Date.now() - n * 86_400_000)
  d.setHours(hour, 0, 0, 0)
  return d
}

// Demo: the sample take-aways get dates, and the sample visits of the Shadow page (same ids, so a click
// opens them there) are recent; the lead of team Sale A has reviewed one of them.
const DEMO_TAKEAWAYS: ActivityTakeaway[] = Object.entries(MOCK_TAKEAWAYS).map(([key, text], i) => {
  const [uid, ...rest] = key.split('_')
  return { uid, courseId: rest.join('_'), text, updatedAt: daysAgo(i, 9 + i) }
})
const DEMO_SHADOWS: ActivityShadow[] = [
  { id: 'sh-01', observerUid: 'mock-sale-01', storeName: 'Holey Artisan', createdAt: daysAgo(0, 8) },
  { id: 'sh-02', observerUid: 'mock-sale-01', storeName: 'Pastel', createdAt: daysAgo(2) },
  { id: 'sh-03', observerUid: 'mock-sale-02', storeName: 'Holey Artisan Sukhumvit 31', createdAt: daysAgo(1, 15) },
  { id: 'sh-04', observerUid: 'mock-sale-03', storeName: 'Blackhills River', createdAt: daysAgo(3) },
]
const DEMO_REVIEWS: ActivityReview[] = [{ id: 'sh-02__mock-tl-01', recordId: 'sh-02', reviewerUid: 'mock-tl-01' }]

export function useTeamActivity(memberUids: readonly string[], viewerUid: string, courseTitles: ReadonlyMap<string, string>) {
  const uids = useMemo(() => [...memberUids].sort(), [memberUids])
  const any = uids.length > 0
  const byMember = uids.length <= MAX_IN
  const live = !DEMO_MODE && any

  const records = useFirestoreList<ActivityRecord>(
    'trainingRecords',
    byMember
      ? [{ type: 'where', field: 'userId', op: 'in', value: uids }]
      : [{ type: 'orderBy', field: 'updatedAt', direction: 'desc' }, { type: 'limit', count: RECENT }],
    live,
  )
  const takeaways = useFirestoreList<ActivityTakeaway>(
    'takeaways',
    byMember
      ? [{ type: 'where', field: 'uid', op: 'in', value: uids }]
      : [{ type: 'orderBy', field: 'updatedAt', direction: 'desc' }, { type: 'limit', count: RECENT }],
    live,
  )
  const shadows = useFirestoreList<ActivityShadow>(
    'shadowRecords',
    byMember
      ? [{ type: 'where', field: 'observerUid', op: 'in', value: uids }]
      : [{ type: 'orderBy', field: 'createdAt', direction: 'desc' }, { type: 'limit', count: RECENT }],
    live,
  )
  const reviews = useAllShadowAcknowledgments(live)
  const demoRecords = useAllTrainingRecords(DEMO_MODE)

  const memberRecords: ActivityRecord[] = DEMO_MODE ? demoRecords.data : records.data

  const items: TeamActivity[] = useMemo(() => buildTeamActivity({
    memberUids: uids,
    records: memberRecords,
    takeaways: DEMO_MODE ? DEMO_TAKEAWAYS : takeaways.data,
    shadows: DEMO_MODE ? DEMO_SHADOWS : shadows.data,
    reviews: DEMO_MODE ? DEMO_REVIEWS : reviews.data,
    viewerUid,
    courseTitles,
  }), [uids, memberRecords, takeaways.data, shadows.data, reviews.data, viewerUid, courseTitles])

  const loading = live && (records.loading || takeaways.loading || shadows.loading)
  /** The members' training records too: how far the team is on each course. */
  return { items, loading, records: memberRecords }
}
