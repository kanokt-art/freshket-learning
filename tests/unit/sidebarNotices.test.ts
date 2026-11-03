import { describe, it, expect } from 'vitest'
import { sidebarNotices } from '@/lib/notifications/sidebarNotices'
import type { AppNotification } from '@/types/notification'

const n = (id: string, read = false): AppNotification =>
  ({ id, type: 'course_feedback_received', title: id, body: '', read, createdAt: new Date(), refId: id, refPath: '/' })

describe('sidebarNotices', () => {
  it('lists the latest few and counts every unread one, with their ids', () => {
    const all = [n('a'), n('b', true), n('c'), n('d'), n('e', true)]
    const r = sidebarNotices(all, 3)
    expect(r.items.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(r.unread).toBe(3)
    expect(r.unreadIds).toEqual(['a', 'c', 'd'])
  })

  it('is quiet when everything is read, or there is nothing', () => {
    expect(sidebarNotices([n('a', true)]).unread).toBe(0)
    expect(sidebarNotices([])).toEqual({ items: [], unread: 0, unreadIds: [] })
  })
})
