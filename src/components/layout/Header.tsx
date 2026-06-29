'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { ROLE_LABELS } from '@/types/user'

// Pages where back button should NOT appear (they are top-level destinations)
const ROOT_PATHS = new Set(['/sale', '/courses', '/tools', '/users', '/admin', '/profile', '/notifications'])

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const { user } = useAuth()
  const { unreadCount } = useNotifications(user?.uid)
  const pathname = usePathname()
  const router = useRouter()

  const showBack = !ROOT_PATHS.has(pathname)

  return (
    <header className="flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-freshket-700 lg:bg-white border-b border-freshket-600 lg:border-gray-100 shrink-0">

      {/* ── Back button — mobile only, non-root pages ── */}
      {showBack && (
        <button
          type="button"
          onClick={() => router.back()}
          className="lg:hidden shrink-0 size-9 flex items-center justify-center rounded-xl border border-white/30 text-white hover:bg-white/10 active:bg-white/20 lg:border-gray-200 lg:text-gray-500 lg:hover:bg-gray-50 transition-colors"
          aria-label="ย้อนกลับ"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
      )}

      {/* ── Title ── */}
      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-bold text-white lg:text-brand-dark truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-freshket-200 lg:text-brand-muted mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {/* ── Right: actions + user ── */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {actions}
        {/* Notification bell — desktop only */}
        {user && (
          <Link
            href="/notifications"
            className="hidden lg:flex relative items-center justify-center size-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            aria-label="การแจ้งเตือน"
          >
            <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-xs font-bold leading-4 text-center tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        )}
        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden sm:inline-flex items-center rounded-full bg-white/20 lg:bg-brand-green-100 px-2.5 py-1 text-xs font-normal text-white lg:text-brand-green">
              {ROLE_LABELS[user.role]}
            </span>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="size-8 rounded-full object-cover ring-2 ring-white/40 lg:ring-brand-green-100"
              />
            ) : (
              <div className="size-8 rounded-full bg-white/20 lg:bg-brand-green flex items-center justify-center text-white text-sm font-bold">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
