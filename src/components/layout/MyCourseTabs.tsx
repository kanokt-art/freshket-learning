'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import type { ModuleId } from '@/lib/modules'

// Regular-user sub-nav for the "My Course" area (Course / Shadow Visit / Role Play),
// replacing the old sidebar accordion. Self-gating: renders nothing for super_admin
// (they get CourseManagementTabs instead) and hides tabs whose module the user's
// department can't access — mirroring the old sidebar child-filtering.
export function MyCourseTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)

  if (!user || user.role === 'super_admin') return null

  // Mandatory always renders last, regardless of which other tabs are visible
  // for the user's department.
  const tabs: { href: string; label: string; module: ModuleId; active: boolean }[] = [
    { href: '/courses', label: 'Course', module: 'lms', active: pathname === '/courses' },
    { href: '/shadow', label: 'Shadow Visit', module: 'shadow', active: pathname.startsWith('/shadow') },
    { href: '/courses/roleplay', label: 'Role Play', module: 'roleplay', active: pathname.startsWith('/courses/roleplay') },
    { href: '/courses/mandatory', label: 'Mandatory', module: 'lms', active: pathname.startsWith('/courses/mandatory') },
  ]

  const visible = tabs.filter((t) => allowedModules.has(t.module))
  if (visible.length === 0) return null

  return (
    <nav className="flex items-center gap-6 px-6 bg-white border-b border-gray-100 overflow-x-auto">
      {visible.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`inline-flex items-center gap-1 px-1 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
            t.active
              ? 'text-freshket-600 font-bold border-freshket-500'
              : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
