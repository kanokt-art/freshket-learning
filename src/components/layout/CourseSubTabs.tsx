'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useMyTrainingRecords } from '@/hooks/useFirestore'
import { libraryEntries, yourCourseCount } from '@/lib/courses/library'

// Second level under the "Course" tab for a learner: Your Course (what is on their list) and Library
// (courses that are optional to take, plus everything they have finished). Renders nothing for super_admin,
// who manages courses instead of taking them.
export function CourseSubTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { data: courses } = useCourses()
  const { data: records } = useMyTrainingRecords(user?.uid ?? '')
  const counts = useMemo(() => {
    if (!user) return { yours: 0, library: 0 }
    const me = { uid: user.uid, role: user.role, department: user.department, teamId: user.teamId, employmentStatus: user.employmentStatus }
    return { yours: yourCourseCount(courses, records, me), library: libraryEntries(courses, records, me).length }
  }, [courses, records, user])
  if (!user || user.role === 'super_admin') return null

  const tabs = [
    { href: '/courses', label: 'Your Course', count: counts.yours, active: pathname === '/courses' },
    { href: '/courses/library', label: 'Library', count: counts.library, active: pathname.startsWith('/courses/library') },
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
            <span className={`ml-1.5 text-xs tabular-nums ${t.active ? 'text-freshket-600 font-bold' : 'text-gray-400'}`}>{t.count}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
