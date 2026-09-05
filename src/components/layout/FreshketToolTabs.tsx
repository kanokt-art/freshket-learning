'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'

// Regular-user sub-nav for the "Tools" area (Tools / Mandatory /
// New Joiner Hub), replacing the old sidebar accordion. Self-gating: renders
// nothing for super_admin (they get AdministrationTabs) or when the user's
// department can't access the sale_tools module. New Joiner Hub only shows for
// users still inside the onboarding window — same rule the old sidebar used.
export function FreshketToolTabs() {
  const pathname = usePathname()
  const { user } = useAuth()
  const { allowedModules } = useModuleAccess(user?.role, user?.department)

  // Merchandise Contact is a sub-view of /tools, addressed by the #merch hash so
  // it can live in this single top tab bar (no more duplicated second bar).
  const [hash, setHash] = useState('')
  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [pathname])

  if (!user || user.role === 'super_admin') return null
  if (!allowedModules.has('sale_tools')) return null

  const isNewJoiner = getDaysSince(user.startDate) < NEW_JOINER_DAYS
  const onTools = pathname === '/tools'
  const isMerch = onTools && hash === '#merch'
  const isQA = onTools && hash === '#qa'

  // When already on /tools, switch the Tools ↔ Merchandise ↔ Q&A sub-tabs by
  // setting the hash ourselves. Next's <Link> uses history.pushState, which does
  // NOT fire `hashchange`, so relying on it made the switch lag/feel stuck.
  // Assigning window.location.hash fires the event natively and the page flips
  // instantly.
  const switchHash = (e: React.MouseEvent, target: '' | 'merch' | 'qa') => {
    if (!onTools) return // coming from another page — let <Link> navigate normally
    e.preventDefault()
    if (target) {
      if (window.location.hash !== `#${target}`) window.location.hash = target
    } else if (window.location.hash) {
      history.pushState(null, '', '/tools')
      window.dispatchEvent(new Event('hashchange'))
    }
  }

  const tabs: { href: string; label: string; badge?: string; active: boolean; show: boolean; onClick?: (e: React.MouseEvent) => void }[] = [
    { href: '/tools', label: 'Tools', active: onTools && !isMerch && !isQA, show: true, onClick: (e) => switchHash(e, '') },
    { href: '/tools#merch', label: 'Merchandise Contact', active: isMerch, show: true, onClick: (e) => switchHash(e, 'merch') },
    { href: '/tools#qa', label: 'Q&A', active: isQA, show: true, onClick: (e) => switchHash(e, 'qa') },
    { href: '/tools/mandatory', label: 'Merchandise Mandatory', active: pathname === '/tools/mandatory', show: true },
    { href: '/tools/new-joiner', label: 'New Joiner Hub', badge: 'NEW', active: pathname.startsWith('/tools/new-joiner'), show: isNewJoiner },
  ]

  const visible = tabs.filter((t) => t.show)

  return (
    <nav className="flex items-center gap-6 px-6 bg-white border-b border-gray-100 overflow-x-auto">
      {visible.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={t.onClick}
          className={`inline-flex items-center gap-1.5 px-1 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
            t.active
              ? 'text-freshket-600 font-bold border-freshket-500'
              : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
          }`}
        >
          {t.label}
          {t.badge && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 leading-none">
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
