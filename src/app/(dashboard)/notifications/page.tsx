'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { Header } from '@/components/layout/Header'
import { NotificationList } from '@/components/features/NotificationList'
import type { AppNotification } from '@/types/notification'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { items, unreadCount, markRead, markAllRead } = useNotifications(user?.uid)

  function handleTap(n: AppNotification) {
    if (!n.read) markRead(n.id)
    router.push(n.refPath)
  }

  return (
    <div className="flex flex-col h-full bg-white">
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

      <div className="flex-1 overflow-y-auto max-w-lg w-full mx-auto">
        <NotificationList items={items} onTapNotification={handleTap} emptyClassName="h-full py-20" />
      </div>
    </div>
  )
}
