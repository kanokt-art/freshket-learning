'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { canAccess } from '@/types/user'
import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'
import { useMemo } from 'react'

// ── Icon pairs: filled (active) vs outlined (inactive) ───────────────────────

function HomeIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="m11.47 3.841 8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.69-8.69a2.25 2.25 0 0 0-3.18 0l-8.69 8.69a.75.75 0 1 0 1.06 1.06l8.69-8.69Z" />
      <path fillRule="evenodd" d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625A1.875 1.875 0 0 1 3.75 19.875V13.66l.091-.086L12 5.43Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function CourseIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533Z" />
      <path d="M12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.707V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  )
}

function ToolIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M12 6.75a5.25 5.25 0 0 1 6.775-5.025.75.75 0 0 1 .313 1.248l-3.32 3.319c.063.475.276.903.641 1.269.365.365.793.578 1.268.641l3.32-3.319a.75.75 0 0 1 1.248.313 5.25 5.25 0 0 1-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 1 1 2.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.309A5.342 5.342 0 0 1 12 6.75ZM4.117 19.125a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-.008a.75.75 0 0 1-.75-.75v-.008Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.42 15.17L17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
    </svg>
  )
}

function SparkleIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.006Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function AdminIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0ZM14.25 8.625a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM1.5 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122ZM17.25 19.128l-.001.144a2.25 2.25 0 0 1-.233.96 10.088 10.088 0 0 0 5.06-1.01.75.75 0 0 0 .42-.643 4.875 4.875 0 0 0-6.957-4.611 8.586 8.586 0 0 1 1.71 5.157v.003Z" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  )
}

function ProfileIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function BellIcon({ filled, count }: { filled: boolean; count: number }) {
  return (
    <div className="relative">
      {filled ? (
        <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
          <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      )}
      {count > 0 && (
        <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-xs font-bold leading-4 text-center tabular">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BottomBar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const isNewJoiner = useMemo(() => getDaysSince(user?.startDate) < NEW_JOINER_DAYS, [user?.startDate])
  const { unreadCount } = useNotifications(user?.uid)

  if (!user) return null

  const isAdmin = canAccess(user.role, 'team_lead')
  const isSuperAdmin = user.role === 'super_admin'

  const homeActive    = pathname === '/sale'
  const courseActive  = pathname.startsWith('/courses') || pathname.startsWith('/shadow')
  const toolActive    = pathname.startsWith('/tools') && pathname !== '/tools/new-joiner'
  const joinerActive  = pathname === '/tools/new-joiner'
  const adminActive   = pathname.startsWith('/users') || pathname.startsWith('/admin') || pathname.startsWith('/assessment')
  const notifActive   = pathname === '/notifications'
  const profileActive = pathname === '/profile'

  const items = [
    {
      href: '/sale',
      label: 'หน้าหลัก',
      active: homeActive,
      icon: <HomeIcon filled={homeActive} />,
    },
    {
      href: '/courses',
      label: 'หลักสูตร',
      active: courseActive,
      icon: <CourseIcon filled={courseActive} />,
    },
    {
      href: '/tools',
      label: 'เครื่องมือ',
      active: toolActive,
      icon: <ToolIcon filled={toolActive} />,
    },
    ...(isNewJoiner || isSuperAdmin
      ? [{
          href: '/tools/new-joiner',
          label: 'คู่มือใหม่',
          active: joinerActive,
          icon: <SparkleIcon filled={joinerActive} />,
        }]
      : []),
    ...(isAdmin
      ? [{
          href: '/users',
          label: 'จัดการ',
          active: adminActive,
          icon: <AdminIcon filled={adminActive} />,
        }]
      : []),
    {
      href: '/notifications',
      label: 'แจ้งเตือน',
      active: notifActive,
      icon: <BellIcon filled={notifActive} count={unreadCount} />,
    },
    {
      href: '/profile',
      label: 'ฉัน',
      active: profileActive,
      icon: <ProfileIcon filled={profileActive} />,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around h-[62px] pb-safe px-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className="flex-1 flex items-center justify-center"
            aria-label={item.label}
          >
            <span
              className={`flex items-center gap-0 rounded-full transition-all duration-300 ease-in-out ${
                item.active
                  ? 'bg-freshket-100 text-freshket-600 px-4 py-2 gap-1.5'
                  : 'text-gray-400 p-2 active:text-gray-600 active:scale-90'
              }`}
            >
              {/* Icon: filled when active, outlined when not */}
              <span className="shrink-0 transition-transform duration-300">
                {item.icon}
              </span>
              {/* Label: only shown when active, animates in/out */}
              <span
                className={`text-xs font-bold whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out leading-none ${
                  item.active
                    ? 'max-w-[72px] opacity-100'
                    : 'max-w-0 opacity-0'
                }`}
              >
                {item.label}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
