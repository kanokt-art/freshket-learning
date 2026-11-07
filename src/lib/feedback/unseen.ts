import { hasContent, newestReviewTime, type LeadReview } from '@/lib/feedback/leadReviews'

// Which of a learner's courses have feedback from their team lead or manager that they have not opened yet.
// "Seen" is kept in this browser per course (the number is the newest feedback time they had read), the same
// value the course page writes when the learner opens the feedback — so a red dot on the sidebar, on the
// course card and on the course's feedback handle all clear together once they read it.

export const FEEDBACK_SEEN_EVENT = 'fk-feedback-seen-change'

export const feedbackSeenKey = (uid: string, courseId: string) => `fk_lead_feedback_seen_${uid}_${courseId}`

export function readFeedbackSeen(uid: string, courseId: string): number {
  try { return Number(localStorage.getItem(feedbackSeenKey(uid, courseId)) ?? 0) || 0 } catch { return 0 }
}

/** Remember that the learner has read this course's feedback up to `newest`, and tell the other dots. */
export function markFeedbackSeen(uid: string, courseId: string, newest: number): void {
  try {
    localStorage.setItem(feedbackSeenKey(uid, courseId), String(newest))
    window.dispatchEvent(new Event(FEEDBACK_SEEN_EVENT))
  } catch { /* no storage: the dot simply stays until it is read again */ }
}

const timeOf = (d?: Date | string) => {
  const t = d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/**
 * How many pieces of feedback (a team lead's, a manager's) the learner has not read, per course: every review that
 * says something and is newer than what they last read on that course. This is the number on the red badge.
 */
export function unseenFeedbackCounts(
  reviews: readonly (LeadReview & { courseId?: string })[],
  seenOf: (courseId: string) => number,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of reviews) {
    if (!r.courseId || !hasContent(r)) continue
    if ((timeOf(r.updatedAt) || 1) > seenOf(r.courseId)) out.set(r.courseId, (out.get(r.courseId) ?? 0) + 1)
  }
  return out
}

/** The ids of the courses whose newest feedback is newer than what the learner has read. */
export function unseenFeedbackCourses(
  reviews: readonly (LeadReview & { courseId?: string })[],
  seenOf: (courseId: string) => number,
): string[] {
  const byCourse = new Map<string, LeadReview[]>()
  for (const r of reviews) {
    if (!r.courseId) continue
    const list = byCourse.get(r.courseId) ?? []
    list.push(r)
    byCourse.set(r.courseId, list)
  }
  const out: string[] = []
  byCourse.forEach((list, courseId) => {
    if (newestReviewTime(list) > seenOf(courseId)) out.push(courseId)
  })
  return out
}
