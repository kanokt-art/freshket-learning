import type { AppNotification, NotifType } from '@/types/notification'

// What a team lead or manager says about the learner: stars and comments on a course, a Shadow Visit
// review, a Role Play assessment. The learner's home shows these on its right sidebar, with a signal on
// the handle while any is unread.
export const FEEDBACK_NOTICE_TYPES: readonly NotifType[] = [
  'course_feedback_received',
  'shadow_ack_received',
  'roleplay_assessed',
]

export interface FeedbackNotices {
  /** The feedback notices, newest first as the feed gives them. */
  items: AppNotification[]
  unread: number
}

export function feedbackNotices(all: readonly AppNotification[], limit = 8): FeedbackNotices {
  const mine = all.filter((n) => FEEDBACK_NOTICE_TYPES.includes(n.type))
  return { items: mine.slice(0, limit), unread: mine.filter((n) => !n.read).length }
}
