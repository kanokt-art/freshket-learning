'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { NotificationList } from '@/components/features/NotificationList'
import type { AppNotification } from '@/types/notification'

// Bell button that opens a small popover in place — no page navigation.
// Used by both the mobile bottom nav (`variant="nav"`) and the desktop
// header (`variant="header"`); each renders its own trigger markup but
// shares the panel, backdrop and list-tap behavior below.

function BellGlyph({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  )
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={`absolute min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-xs font-bold leading-4 text-center tabular-nums ${className ?? ''}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function PanelHeader({ unreadCount, onMarkAllRead, onClose }: { unreadCount: number; onMarkAllRead: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
      <div>
        <p className="text-sm font-bold text-gray-900">การแจ้งเตือน</p>
        <p className="text-xs text-gray-400">{unreadCount > 0 ? `${unreadCount} รายการยังไม่ได้อ่าน` : 'ทั้งหมดอ่านแล้ว'}</p>
      </div>
      <div className="flex items-center gap-1">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors px-2 py-1 rounded-lg hover:bg-freshket-50"
          >
            อ่านทั้งหมด
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function NotificationBellButton({ variant }: { variant: 'nav' | 'header' }) {
  const { user } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { items, unreadCount, markRead, markAllRead } = useNotifications(user?.uid)

  function toggleOpen() {
    if (!open && triggerRef.current) {
      // Computed fresh on every open (not derived from CSS anchoring) because the
      // trigger sits inside a `backdrop-blur` bar — that filter makes the bar a
      // containing block for `fixed` descendants, so a CSS-anchored popover would
      // be clipped to the bar's own box instead of the viewport. Portaling to
      // <body> with a rect-computed position sidesteps that entirely.
      const rect = triggerRef.current.getBoundingClientRect()
      setPanelStyle(
        variant === 'nav'
          ? { position: 'fixed', bottom: window.innerHeight - rect.top + 12, left: 12, right: 12 }
          : { position: 'fixed', top: rect.bottom + 8, right: window.innerWidth - rect.right, width: 384 },
      )
    }
    setOpen((v) => !v)
  }

  function handleTap(n: AppNotification) {
    if (!n.read) markRead(n.id)
    setOpen(false)
    router.push(n.refPath)
  }

  if (!user) return null

  const panel = (
    <div className={`flex flex-col bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden ${
      variant === 'nav' ? 'max-h-[70vh]' : 'max-h-[75vh]'
    }`}>
      <PanelHeader unreadCount={unreadCount} onMarkAllRead={markAllRead} onClose={() => setOpen(false)} />
      <div className="overflow-y-auto">
        <NotificationList items={items} onTapNotification={handleTap} emptyClassName="py-8" />
      </div>
    </div>
  )

  const overlay = open && typeof document !== 'undefined'
    ? createPortal(
        <>
          {/* Click-outside-to-close catcher — transparent, matches the Facebook-style non-dimmed pattern */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={panelStyle} className="z-50">
            {panel}
          </div>
        </>,
        document.body,
      )
    : null

  if (variant === 'nav') {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          aria-label="แจ้งเตือน"
          className="flex-1 flex items-center justify-center"
        >
          <span
            className={`flex items-center gap-0 rounded-full transition-all duration-300 ease-in-out ${
              open
                ? 'bg-freshket-100 text-freshket-600 px-4 py-2 gap-1.5'
                : 'text-gray-400 p-2 active:text-gray-600 active:scale-90'
            }`}
          >
            <span className="relative shrink-0 transition-transform duration-300">
              <BellGlyph filled={open} className="size-6" />
              <CountBadge count={unreadCount} className="-top-1 -right-1.5" />
            </span>
            <span
              className={`text-xs font-bold whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out leading-none ${
                open ? 'max-w-[72px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              แจ้งเตือน
            </span>
          </span>
        </button>
        {overlay}
      </>
    )
  }

  return (
    <div className="hidden lg:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="relative flex items-center justify-center size-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        aria-label="การแจ้งเตือน"
      >
        <BellGlyph filled={open} className="size-[18px]" />
        <CountBadge count={unreadCount} className="-top-0.5 -right-0.5" />
      </button>
      {overlay}
    </div>
  )
}
