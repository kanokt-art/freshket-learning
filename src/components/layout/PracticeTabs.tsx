'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import type { ModuleId } from '@/lib/modules'

// The tab bar of the Practice area (its own item in the left sidebar): Shadow Visit | Role Play, each
// shown when the user's department has it. Renders nothing for super_admin (they get their own tabs).
const TABS: { href: string; label: string; module: ModuleId }[] = [
  { href: '/shadow', label: 'Shadow Visit', module: 'shadow' },
  { href: '/courses/roleplay', label: 'Role Play', module: 'roleplay' },
]

export function PracticeTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)
  if (!user || user.role === 'super_admin') return null
  const visible = TABS.filter((t) => allowedModules.has(t.module))
  if (visible.length === 0) return null

  return (
    <nav className="hidden lg:flex items-center gap-6 px-6 bg-white border-b border-gray-100 overflow-x-auto">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wide py-3 shrink-0">Practice</span>
      {visible.map((t) => {
        const active = pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center px-1 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
              active ? 'text-freshket-600 font-bold border-freshket-500' : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
