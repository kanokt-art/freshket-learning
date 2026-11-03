'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// Second level under the "Course" tab for a learner: Your Course (what is on their list) and Library
// (courses that are optional to take, plus everything they have finished). Renders nothing for super_admin,
// who manages courses instead of taking them.
export function CourseSubTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  if (!user || user.role === 'super_admin') return null

  const tabs = [
    { href: '/courses', label: 'Your Course', active: pathname === '/courses' },
    { href: '/courses/library', label: 'Library', active: pathname.startsWith('/courses/library') },
  ]

  return (
    <div className="px-6 pt-4 bg-white">
      <nav className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100" aria-label="Course">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 ${
              t.active ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-500 font-normal hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
