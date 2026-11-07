'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useFirestoreList } from '@/hooks/useFirestore'
import { getDemoMode } from '@/lib/demo/demoMode'
import type { LeadReview } from '@/lib/feedback/leadReviews'
import { FEEDBACK_SEEN_EVENT, readFeedbackSeen, unseenFeedbackCounts } from '@/lib/feedback/unseen'

const DEMO_MODE = getDemoMode()

/**
 * How many unread pieces of feedback from their team lead or manager the signed-in learner has, per course.
 * Drives the red number that leads from the sidebar to the course card to the course itself.
 */
export function useUnseenFeedback(): Map<string, number> {
  const { user } = useAuth()
  const uid = user?.uid ?? ''
  const { data } = useFirestoreList<LeadReview & { courseId?: string }>(
    'courseFeedback',
    [{ type: 'where', field: 'memberUid', op: '==', value: uid }],
    !DEMO_MODE && !!uid,
  )
  // Bumped when the learner reads a course's feedback (here or in another tab), so the dots recompute.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener(FEEDBACK_SEEN_EVENT, bump)
    window.addEventListener('storage', bump)
    return () => { window.removeEventListener(FEEDBACK_SEEN_EVENT, bump); window.removeEventListener('storage', bump) }
  }, [])
  return useMemo(
    () => (uid ? unseenFeedbackCounts(data, (courseId) => readFeedbackSeen(uid, courseId)) : new Map<string, number>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, uid, tick],
  )
}
