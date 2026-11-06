'use client'

import Link from 'next/link'
import { NotificationBellButton } from '@/components/features/NotificationBellButton'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { useEffect, useState } from 'react'
import { useModuleAccess } from '@/hooks/useModuleAccess'

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

// ── Practice: a + in the middle of the bar; it opens a sheet to pick Shadow Record or Role Play ─────────────

const PRACTICE_OPTIONS = [
  {
    href: '/shadow',
    module: 'shadow' as const,
    title: 'Shadow Record',
    hint: 'บันทึกการ Shadow กับพี่เลี้ยง',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    href: '/courses/roleplay',
    module: 'roleplay' as const,
    title: 'Role Play',
    hint: 'ฝึกซ้อมการขายและรับการประเมิน',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
]

function PracticeButton({ active }: { active: boolean }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [pathname])

  const options = PRACTICE_OPTIONS.filter((o) => allowedModules.has(o.module))
  if (options.length === 0) return null

  return (
    <>
      <div className="flex-1 flex items-center justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Practice"
          aria-haspopup="dialog"
          className={`size-11 rounded-full flex items-center justify-center shadow-md transition-all duration-150 active:scale-90 ${
            active ? 'bg-freshket-600 text-white ring-4 ring-freshket-100' : 'bg-freshket-500 text-white hover:bg-freshket-600'
          }`}
        >
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-900/40" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Practice"
            className="w-full bg-white rounded-t-3xl shadow-2xl animate-sheet-up px-5 pt-3 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-4" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-bold text-gray-900">Practice</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="ปิด"
                className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3 pb-5">
              {options.map((o) => {
                const here = pathname.startsWith(o.href)
                return (
                  <Link key={o.href} href={o.href} onClick={() => setOpen(false)}
                    className={`flex items-center gap-4 rounded-2xl border-2 p-4 transition-all duration-150 active:scale-[0.98] ${
                      here ? 'border-freshket-500 bg-freshket-50' : 'border-gray-100 bg-white hover:border-freshket-200 hover:bg-freshket-50'
                    }`}>
                    <span className="size-12 rounded-xl bg-freshket-100 text-freshket-700 flex items-center justify-center shrink-0">{o.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-gray-900">{o.title}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{o.hint}</span>
                    </span>
                    <svg className="size-5 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Admin menu: a floating button above the bar (team lead and up) ───────────

function GearIcon() {
  return (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function AdminFab({ role }: { role: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [pathname])

  const isSuperAdmin = role === 'super_admin'
  const links = [
    { href: '/manager', label: isSuperAdmin ? 'ภาพรวมทีม (ทุกคน)' : 'ภาพรวมทีม' },
    { href: '/users', label: isSuperAdmin ? 'Administration' : 'จัดการพนักงาน' },
    ...(isSuperAdmin
      ? [
          { href: '/courses', label: 'Course Bank' },
          { href: '/courses/design', label: 'Course Design' },
          { href: '/assessment', label: 'Questionnaire Management' },
          { href: '/admin/guide', label: 'คู่มือ Admin' },
        ]
      : []),
  ]
  const onAdminPage = links.some((l) => l.href !== '/courses' && pathname.startsWith(l.href))

  return (
    <div className="lg:hidden">
      {open && <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setOpen(false)} />}
      <div className="fixed right-4 bottom-[78px] z-50 flex flex-col items-end gap-3">
        {open && (
          <div className="w-56 bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden animate-pop-in">
            <p className="px-4 pt-3 pb-1.5 text-xs font-bold text-gray-400">เมนูผู้ดูแล</p>
            {links.map((l) => (
              <Link
                key={l.href + l.label}
                href={l.href}
                className={`block px-4 py-3 text-sm font-bold transition-all duration-150 ${
                  pathname === l.href ? 'text-freshket-700 bg-freshket-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="เมนูผู้ดูแล"
          aria-expanded={open}
          className={`size-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
            open || onAdminPage ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-gray-100'
          }`}
        >
          {open ? (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M6 6l12 12" /></svg>
          ) : <GearIcon />}
        </button>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

// Five icons for everyone on a phone: home, courses, tools, notifications, profile. The admin pages
// (team, staff, course management) sit behind the floating button instead.
export function BottomBar() {
  const pathname = usePathname()
  const { user } = useAuth()

  if (!user) return null

  const isAdmin = canAccess(user.role, 'team_lead')

  const homeActive    = pathname === '/sale'
  // Mandatory Reading sits under Tools, though its page lives at /courses/mandatory.
  const mandatory     = pathname.startsWith('/courses/mandatory')
  // Shadow Record and Role Play belong to the + (Practice) button, not to Courses.
  const practiceActive = pathname.startsWith('/shadow') || pathname.startsWith('/courses/roleplay')
  const courseActive  = pathname.startsWith('/courses') && !mandatory && !practiceActive
  const toolActive    = pathname.startsWith('/tools') || mandatory
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
      // Handled specially in the render below: opens the Practice sheet instead of navigating.
      href: '#practice',
      label: 'Practice',
      active: practiceActive,
      icon: null,
    },
    {
      href: '/tools',
      label: 'เครื่องมือ',
      active: toolActive,
      icon: <ToolIcon filled={toolActive} />,
    },
    {
      // Handled specially in the render below — opens a popover instead of navigating.
      href: null,
      label: 'แจ้งเตือน',
      active: false,
      icon: null,
    },
    {
      href: '/profile',
      label: 'ฉัน',
      active: profileActive,
      icon: <ProfileIcon filled={profileActive} />,
    },
  ]

  return (
    <>
    {isAdmin && <AdminFab role={user.role} />}
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around h-[62px] pb-safe px-1">
        {items.map((item) =>
          item.href === '#practice' ? (
            <PracticeButton key="practice" active={item.active} />
          ) : item.href === null ? (
            // Notification bell — opens a popover in place instead of navigating.
            <NotificationBellButton key="notifications" variant="nav" />
          ) : (
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
          )
        )}
      </div>
    </nav>
    </>
  )
}
