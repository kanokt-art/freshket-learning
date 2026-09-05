'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// Super-admin-only sub-nav for the Administration area. Self-gating: renders
// nothing unless the current user is super_admin, so pages shared with regular
// users (tools) can drop it in unconditionally right after their Header.
//
// Multi-page groups are collapsed into hover dropdowns per the "same topic →
// one tab" grouping: the /tools family under "Tools", log + settings under
// "System". Employees has only one destination, so it's a plain tab.
export function AdministrationTabs() {
  const pathname = usePathname()
  const { user } = useAuth()

  if (user?.role !== 'super_admin') return null

  const isEmployees = pathname === '/users' || pathname.startsWith('/users/')
  const isTools = pathname === '/tools' || pathname.startsWith('/tools/')
  const isSystem = pathname === '/log' || pathname === '/admin/settings' || pathname === '/admin/announcements'

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

  const dropItemCls = 'block px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors'

  return (
    // No overflow-x-auto here: that computes overflow-y to clip too, which hid
    // the hover dropdowns (they drop below the bar) and made them unclickable.
    <nav className="flex items-center gap-6 px-6 bg-white border-b border-gray-100">
      <Link href="/users" className={tabCls(isEmployees)}>Employees</Link>

      {/* Tools group — clicking the tab goes to /tools; hover reveals the rest */}
      <Dropdown label="Tools" href="/tools" active={isTools}>
        <Link href="/tools" className={dropItemCls} onClick={(e) => switchHash(e, '')}>Tools</Link>
        <Link href="/tools#merch" className={dropItemCls} onClick={(e) => switchHash(e, 'merch')}>Merchandise Contact</Link>
        <Link href="/tools#qa" className={dropItemCls} onClick={(e) => switchHash(e, 'qa')}>Q&amp;A</Link>
        <Link href="/tools/mandatory" className={dropItemCls}>Merchandise Mandatory</Link>
        <Link href="/tools/new-joiner" className={dropItemCls}>New Joiner Hub</Link>
      </Dropdown>

      {/* System group — clicking the tab goes to Module Settings */}
      <Dropdown label="System" href="/admin/settings" active={isSystem}>
        <Link href="/admin/settings" className={dropItemCls}>Module Settings</Link>
        <Link href="/admin/announcements" className={dropItemCls}>ข่าวสาร (News Feed)</Link>
        <Link href="/log" className={dropItemCls}>Activity Log</Link>
      </Dropdown>
    </nav>
  )
}

function Dropdown({ label, href, active, children }: { label: string; href: string; active: boolean; children: React.ReactNode }) {
  return (
    <div className="relative group shrink-0">
      {/* Trigger is a real link so the tab itself is clickable (navigates to the
          group's landing page); the flyout still opens on hover for the rest. */}
      <Link
        href={href}
        className={`inline-flex items-center gap-1 px-1 py-3 text-sm border-b-2 transition-colors ${
          active
            ? 'text-freshket-600 font-bold border-freshket-500'
            : 'text-gray-500 font-normal border-transparent hover:text-gray-700'
        }`}
      >
        {label}
        <svg className="size-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </Link>

      <div className="absolute left-0 top-full pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 ease-out z-40">
        <div className="w-48 bg-white rounded-xl border border-gray-100 shadow-lg py-1.5">
          {children}
        </div>
      </div>
    </div>
  )
}
