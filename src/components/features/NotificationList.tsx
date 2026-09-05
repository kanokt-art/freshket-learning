'use client'

import type { AppNotification, NotifType } from '@/types/notification'

// Shared notification list body — grouped by day, same markup used by both the
// full /notifications page and the bell popover (BottomBar / Header) so the
// two never drift apart.

export function relativeTime(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return 'เมื่อกี้'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  if (diff < 172800) return 'เมื่อวาน'
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function groupByDay(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)

  const todayGroup: AppNotification[] = []
  const yesterdayGroup: AppNotification[] = []
  const olderGroup: AppNotification[] = []

  for (const n of items) {
    const d = new Date(n.createdAt); d.setHours(0, 0, 0, 0)
    if (d.getTime() === today.getTime()) todayGroup.push(n)
    else if (d.getTime() === yesterday.getTime()) yesterdayGroup.push(n)
    else olderGroup.push(n)
  }

  const result: { label: string; items: AppNotification[] }[] = []
  if (todayGroup.length) result.push({ label: 'วันนี้', items: todayGroup })
  if (yesterdayGroup.length) result.push({ label: 'เมื่อวาน', items: yesterdayGroup })
  if (olderGroup.length) result.push({ label: 'ก่อนหน้า', items: olderGroup })
  return result
}

const NOTIF_ICON: Record<NotifType, { bg: string; icon: React.ReactNode }> = {
  shadow_pending_ack: {
    bg: 'bg-sky-100',
    icon: (
      <svg className="size-5 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
        <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  shadow_ack_received: {
    bg: 'bg-freshket-100',
    icon: (
      <svg className="size-5 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  new_course: {
    bg: 'bg-purple-100',
    icon: (
      <svg className="size-5 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292v-14.25" />
      </svg>
    ),
  },
  heart_received: {
    bg: 'bg-rose-100',
    icon: (
      <svg className="size-5 text-rose-600" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
      </svg>
    ),
  },
  assessment_completed: {
    bg: 'bg-freshket-100',
    icon: (
      <svg className="size-5 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 017.231-4.41 60.46 60.46 0 00-.491-6.347m-14.48 0a60.699 60.699 0 00-.987-4.482A50.003 50.003 0 0112 4.5c2.29 0 4.53.201 6.707.585a59.98 59.98 0 00-.987 4.482m-14.48 0L12 13.5l7.24-3.353" />
      </svg>
    ),
  },
  new_mandatory: {
    bg: 'bg-amber-100',
    icon: (
      <svg className="size-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
}

export function NotificationList({
  items, onTapNotification, emptyClassName,
}: {
  items: AppNotification[]
  onTapNotification: (n: AppNotification) => void
  /** Extra classes for the empty-state wrapper — full page vs. compact popover need different heights. */
  emptyClassName?: string
}) {
  const groups = groupByDay(items)

  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center text-center px-6 ${emptyClassName ?? 'py-10'}`}>
        <div className="size-16 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-500">ยังไม่มีการแจ้งเตือน</p>
        <p className="text-xs text-gray-400 mt-1">เมื่อมีการ Ack Shadow Visit หรือหลักสูตรใหม่ จะแจ้งเตือนที่นี่</p>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 space-y-4">
      {groups.map(group => (
        <div key={group.label}>
          <p className="text-xs font-bold text-gray-400 mb-2 px-1">{group.label}</p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {group.items.map(n => {
              const meta = NOTIF_ICON[n.type]
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onTapNotification(n)}
                  className="w-full flex items-start gap-3 px-3.5 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors group"
                >
                  {/* Unread dot */}
                  <div className="shrink-0 mt-1.5">
                    {!n.read && <span className="block size-2 rounded-full bg-freshket-500" />}
                    {n.read && <span className="block size-2" />}
                  </div>

                  {/* Icon */}
                  <div className={`size-9 rounded-2xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                    {meta.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${n.read ? 'font-normal text-gray-700' : 'font-bold text-gray-900'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-xs text-gray-300 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>

                  <svg className="size-4 text-gray-300 group-hover:text-freshket-400 transition-colors shrink-0 mt-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
