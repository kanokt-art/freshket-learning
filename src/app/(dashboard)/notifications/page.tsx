'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { Header } from '@/components/layout/Header'
import type { AppNotification, NotifType } from '@/types/notification'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
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
        <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
      </svg>
    ),
  },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { items, unreadCount, markRead, markAllRead } = useNotifications(user?.uid)
  const groups = groupByDay(items)

  function handleTap(n: AppNotification) {
    if (!n.read) markRead(n.id)
    router.push(n.refPath)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header
        title="การแจ้งเตือน"
        subtitle={unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'ทั้งหมดอ่านแล้ว'}
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors px-2 py-1 rounded-lg hover:bg-freshket-50"
            >
              อ่านทั้งหมด
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
            <div className="size-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-5">
              <svg className="size-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-500">ยังไม่มีการแจ้งเตือน</p>
            <p className="text-xs text-gray-400 mt-1">เมื่อมีการ Ack Shadow Visit หรือหลักสูตรใหม่ จะแจ้งเตือนที่นี่</p>
          </div>
        ) : (
          <div className="px-4 sm:px-6 py-4 space-y-5 max-w-lg mx-auto">
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
                        onClick={() => handleTap(n)}
                        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors group"
                      >
                        {/* Unread dot */}
                        <div className="shrink-0 mt-1.5">
                          {!n.read && <span className="block size-2 rounded-full bg-freshket-500" />}
                          {n.read && <span className="block size-2" />}
                        </div>

                        {/* Icon */}
                        <div className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${meta.bg}`}>
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
        )}
      </div>
    </div>
  )
}
