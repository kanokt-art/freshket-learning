'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import type { ModuleId } from '@/lib/modules'

// Regular-user sub-nav for the "My Course" area: Course, then "Practice" — one tab that opens a small
// menu of the hands-on training (Shadow Visit, Role Play). Mandatory reading lives under Tools.
// Self-gating: renders nothing for super_admin (they get CourseManagementTabs instead) and hides what the
// user's department can't access. When only one practice page is open to them it shows as a plain tab.
const PRACTICE: { href: string; label: string; module: ModuleId; match: string }[] = [
  { href: '/shadow', label: 'Shadow Visit', module: 'shadow', match: '/shadow' },
  { href: '/courses/roleplay', label: 'Role Play', module: 'roleplay', match: '/courses/roleplay' },
]

const tabClass = (active: boolean) =>
  `inline-flex items-center gap-1 px-1 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
    active ? 'text-freshket-600 font-bold border-freshket-500' : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
  }`

export function MyCourseTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user || user.role === 'super_admin') return null

  // Library lives under Course (CourseSubTabs), so Course stays lit on both of its pages.
  const showCourse = allowedModules.has('lms')
  const courseActive = pathname === '/courses' || pathname.startsWith('/courses/library')
  const practice = PRACTICE.filter((p) => allowedModules.has(p.module))
  const current = practice.find((p) => pathname.startsWith(p.match))
  if (!showCourse && practice.length === 0) return null

  return (
    <nav className="flex items-center gap-6 px-6 bg-white border-b border-gray-100">
      {showCourse && <Link href="/courses" className={tabClass(courseActive)}>Course</Link>}

      {practice.length === 1 && (
        <Link href={practice[0].href} className={tabClass(!!current)}>{practice[0].label}</Link>
      )}

      {practice.length > 1 && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            className={tabClass(!!current)}
          >
            Practice
            {current && <span className="font-normal text-freshket-600">· {current.label}</span>}
            <svg className={`size-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {open && (
            <div role="menu" className="absolute left-0 top-full mt-1 z-30 w-48 bg-white rounded-xl border border-gray-100 shadow-xl overflow-hidden animate-pop-in">
              {practice.map((p) => {
                const active = current?.href === p.href
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    role="menuitem"
                    className={`flex items-center justify-between px-4 py-3 text-sm transition-all duration-150 ${
                      active ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                    {active && (
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
