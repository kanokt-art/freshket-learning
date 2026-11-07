'use client'

import Link from 'next/link'
import { BookOpen, ChevronRight, House, MapPin, MessagesSquare, Plus, Settings, User, Wrench, X } from 'lucide-react'
import { NotificationBellButton } from '@/components/features/NotificationBellButton'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { useEffect, useState } from 'react'
import { useModuleAccess } from '@/hooks/useModuleAccess'

// ── Tab icons (Lucide): the active one is heavier, with a soft fill ───────────────

const tabProps = (filled: boolean) => ({
  className: 'size-6',
  strokeWidth: filled ? 2.2 : 1.7,
  fill: filled ? 'currentColor' : 'none',
  fillOpacity: filled ? 0.16 : 0,
})
const HomeIcon = ({ filled }: { filled: boolean }) => <House {...tabProps(filled)} />
const CourseIcon = ({ filled }: { filled: boolean }) => <BookOpen {...tabProps(filled)} />
const ToolIcon = ({ filled }: { filled: boolean }) => <Wrench {...tabProps(filled)} />
const ProfileIcon = ({ filled }: { filled: boolean }) => <User {...tabProps(filled)} />

// ── Practice: a + in the middle of the bar; it opens a sheet to pick Shadow Record or Role Play ─────────────

const PRACTICE_OPTIONS = [
  {
    href: '/shadow',
    module: 'shadow' as const,
    title: 'Shadow Record',
    hint: 'บันทึกการ Shadow กับพี่เลี้ยง',
    icon: <MapPin className="size-6" strokeWidth={1.8} />,
  },
  {
    href: '/courses/roleplay',
    module: 'roleplay' as const,
    title: 'Role Play',
    hint: 'ฝึกซ้อมการขายและรับการประเมิน',
    icon: <MessagesSquare className="size-6" strokeWidth={1.8} />,
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
          <Plus className="size-6" strokeWidth={2.4} />
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
                <X className="size-5" strokeWidth={2} />
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
                    <ChevronRight className="size-5 text-gray-300 shrink-0" strokeWidth={2} />
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
  return <Settings className="size-6" strokeWidth={1.8} />
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
            <X className="size-6" strokeWidth={2} />
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
