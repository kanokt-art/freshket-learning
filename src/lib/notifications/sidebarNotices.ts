import type { AppNotification } from '@/types/notification'

// The notifications the learner's home shows on its right sidebar: the latest few, newest first as the
// feed gives them. `unread` drives the signal on the sidebar's handle; opening the sidebar is what reads
// them (the ids are kept so the list can still show which ones were new when it was opened).
export interface SidebarNotices {
  items: AppNotification[]
  unread: number
  unreadIds: string[]
}

export function sidebarNotices(all: readonly AppNotification[], limit = 8): SidebarNotices {
  const unreadIds = all.filter((n) => !n.read).map((n) => n.id)
  return { items: all.slice(0, limit), unread: unreadIds.length, unreadIds }
}
