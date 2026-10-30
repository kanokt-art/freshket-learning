'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// Super-admin-only nav for the Administration area. Self-gating: renders nothing
// unless the current user is super_admin, so pages shared with regular users (tools)
// can drop it in unconditionally right after their Header.
//
// Two levels, no dropdowns: the top tabs are the areas (Employees, Tools, System); the
// area you are in shows its pages as a second row of sub tabs underneath, so every
// page of the area is visible and one click away. Employees has a single page, so it
// has no second row.

/** The current URL hash, kept in step with hashchange (Tools uses #qa / #merch for sub-views). */
function useHash(): string {
  const [hash, setHash] = useState('')
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, ''))
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  return hash
}

export function AdministrationTabs() {
  const pathname = usePathname()
  const hash = useHash()
  const { user } = useAuth()

  if (user?.role !== 'super_admin') return null

  const isEmployees = pathname === '/users' || pathname.startsWith('/users/')
  const isTools = pathname === '/tools' || pathname.startsWith('/tools/')
  const isSystem = pathname === '/log' || pathname === '/admin/settings'
    || pathname === '/admin/announcements'

  // Switch the Tools ↔ Merchandise sub-views by setting the hash directly when
  // already on /tools — Next's <Link>/pushState doesn't fire `hashchange`, so
  // the page listener wouldn't flip instantly. From another page, let the Link
  // navigate normally (the page reads the hash on mount).
  const switchHash = (e: React.MouseEvent, target: '' | 'merch' | 'qa') => {
    if (pathname !== '/tools') return
    e.preventDefault()
    if (target) {
      if (window.location.hash !== `#${target}`) window.location.hash = target
    } else if (window.location.hash) {
      history.pushState(null, '', '/tools')
      window.dispatchEvent(new Event('hashchange'))
    }
  }

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1 px-1 py-3 text-sm border-b-2 transition-colors ${
      active
        ? 'text-freshket-600 font-bold border-freshket-500'
        : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
    }`

  const subCls = (active: boolean) =>
    `inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap ${
      active
        ? 'bg-freshket-100 text-freshket-700 border-freshket-200 font-bold'
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900'
    }`

  // The pages of the area you are in. Tools' views share /tools and differ by hash.
  const onToolsHome = pathname === '/tools' && hash === ''
  const subTabs: Array<{ href: string; label: string; active: boolean; onClick?: (e: React.MouseEvent) => void }> =
    isTools
      ? [
          { href: '/tools', label: 'Tools', active: onToolsHome, onClick: (e) => switchHash(e, '') },
          { href: '/tools/cuisine-guide', label: 'Cuisine Guide', active: pathname.startsWith('/tools/cuisine-guide') },
          { href: '/tools#qa', label: 'Q&A', active: pathname === '/tools' && hash === 'qa', onClick: (e) => switchHash(e, 'qa') },
          { href: '/tools/mandatory', label: 'Merchandise Mandatory', active: pathname.startsWith('/tools/mandatory') },
          { href: '/tools/new-joiner', label: 'New Joiner Hub', active: pathname.startsWith('/tools/new-joiner') },
          { href: '/tools#merch', label: 'Merchandise Contact', active: pathname === '/tools' && hash === 'merch', onClick: (e) => switchHash(e, 'merch') },
        ]
      : isSystem
        ? [
            { href: '/admin/settings', label: 'Module Settings', active: pathname === '/admin/settings' },
            { href: '/admin/announcements', label: 'ข่าวสาร (News Feed)', active: pathname === '/admin/announcements' },
            { href: '/log', label: 'Activity Log', active: pathname === '/log' },
          ]
        : []

  return (
    <div className="bg-white border-b border-gray-100">
      <nav className="flex items-center gap-6 px-6">
        <Link href="/users" className={tabCls(isEmployees)}>Employees</Link>
        <Link href="/tools" className={tabCls(isTools)}>Tools</Link>
        <Link href="/admin/settings" className={tabCls(isSystem)}>System</Link>
      </nav>

      {subTabs.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-t border-gray-100 bg-slate-50/60 overflow-x-auto">
          {subTabs.map((t) => (
            <Link key={t.label} href={t.href} onClick={t.onClick} className={subCls(t.active)}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
