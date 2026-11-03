import { describe, it, expect } from 'vitest'
import { feedbackNotices } from '@/lib/notifications/feedbackNotices'
import type { AppNotification } from '@/types/notification'

const n = (id: string, type: AppNotification['type'], read = false): AppNotification =>
  ({ id, type, title: id, body: '', read, createdAt: new Date(), refId: id, refPath: '/' })

describe('feedbackNotices', () => {
  it('keeps what a lead or manager said about the learner, and counts the unread', () => {
    const r = feedbackNotices([
      n('a', 'course_feedback_received'), n('b', 'new_course'), n('c', 'roleplay_assessed', true),
      n('d', 'shadow_ack_received'), n('e', 'new_mandatory'),
    ])
    expect(r.items.map((x) => x.id)).toEqual(['a', 'c', 'd'])
    expect(r.unread).toBe(2)
  })

  it('counts every unread one even when only the latest few are listed', () => {
    const many = Array.from({ length: 12 }, (_, i) => n(`f${i}`, 'course_feedback_received'))
    const r = feedbackNotices(many, 5)
    expect(r.items).toHaveLength(5)
    expect(r.unread).toBe(12)
  })

  it('is empty when there is none', () => {
    expect(feedbackNotices([n('x', 'new_course')])).toEqual({ items: [], unread: 0 })
  })
})
