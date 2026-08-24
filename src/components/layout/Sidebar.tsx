'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useUnseenTools } from '@/hooks/useUnseenTools'
import { canAccess, ROLE_HIERARCHY, type UserRole } from '@/types/user'
import { FRESHKET_LOGO_URL } from '@/lib/demo/demoMode'
import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'
import type { ModuleId } from '@/lib/modules'

// ── Nav item definition ───────────────────────────────────────────────────────
interface SubNavItem {
  href: string
  label: string
  requiredRole: UserRole
  moduleId?: ModuleId        // hide when module not allowed for user's department
  icon?: React.ReactNode
  badge?: string
  newJoinerOnly?: boolean
  exact?: boolean
}

interface NavItem {
  href: string
  label: string
  requiredRole: UserRole
  maxRole?: UserRole
  group: 'main' | 'manage'
  icon: React.ReactNode
  children?: SubNavItem[]
  matchPaths?: string[]
  noLink?: boolean
  noActive?: boolean
  moduleId?: ModuleId        // hide when module not allowed for user's department
}

const NAV_ITEMS: NavItem[] = [
  // ── Main group ───────────────────────────────────────
  {
    href: '/sale',
    label: 'Main',
    requiredRole: 'sale',
    group: 'main',
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    // Team overview for leads — member roster + training history (/manager page).
    // Sale doesn't see it; super_admin uses Administration instead.
    href: '/manager',
    label: 'Team',
    requiredRole: 'team_lead',
    maxRole: 'manager',
    group: 'main',
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    // Flat link — sub-nav (Course / Shadow Visit / Role Play) now lives as a tab
    // bar on the page (MyCourseTabs). children[] is kept only for visibility
    // gating (parent hides when the department can access none of them).
    // Shadow Visit has no top-level sidebar entry of its own and no children[]
    // entry either (that would render it as a sub-link, which is exactly what
    // was removed) — it's reachable only via the MyCourseTabs bar. In practice
    // 'shadow' always ships bundled with 'lms' in DEFAULT_MODULES, so this item
    // still shows for any department that has Shadow Visit enabled; a department
    // custom-configured with `shadow` but neither `lms` nor `roleplay` would be
    // the one gap this doesn't cover.
    // /shadow is matched here too, otherwise the sidebar would show no active
    // row while a learner is on that page.
    href: '/courses',
    label: 'My Course',
    requiredRole: 'sale',
    maxRole: 'manager',
    group: 'main',
    matchPaths: ['/courses/roleplay', '/shadow'],
    // No top-level moduleId — parent is shown when ANY child is visible
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    children: [
      {
        href: '/courses',
        label: 'Course',
        requiredRole: 'sale',
        moduleId: 'lms',
        exact: true,
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        ),
      },
      {
        href: '/courses/roleplay',
        label: 'Role Play',
        requiredRole: 'sale',
        moduleId: 'roleplay',
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        ),
      },
    ],
  },
  {
    // Flat link — sub-nav (Tools / Mandatory / New Joiner Hub) now lives as
    // a tab bar on the page (FreshketToolTabs). children[] kept only for gating.
    href: '/tools',
    label: 'Tools',
    requiredRole: 'sale',
    group: 'main',
    matchPaths: ['/tools/new-joiner'],
    // No top-level moduleId — parent shown when any child is visible
    icon: (
      // Wrench + screwdriver — the sale team's toolkit
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    children: [
      {
        href: '/tools',
        label: 'Tools',
        requiredRole: 'sale',
        moduleId: 'sale_tools',
        exact: true,
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        ),
      },
      {
        href: '/tools/new-joiner',
        label: 'New Joiner Hub',
        requiredRole: 'sale',
        moduleId: 'sale_tools',
        newJoinerOnly: true,
        badge: 'NEW',
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        ),
      },
    ],
  },

  // ── Manage group (super_admin only — no module filtering) ─────────────────
  {
    // No accordion children — Main / Course / Role Play now live as a tab bar
    // on the page itself (CourseManagementTabs), not nested in the sidebar.
    href: '/courses',
    label: 'Course Management',
    requiredRole: 'super_admin',
    group: 'manage',
    matchPaths: ['/assessment'],
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
  },
  {
    // Lands on the Employees list; the rest (Tools, System) lives as a tab
    // bar on the pages themselves (AdministrationTabs).
    href: '/users',
    label: 'Administration',
    requiredRole: 'super_admin',
    group: 'manage',
    matchPaths: ['/admin', '/log', '/tools'],
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

// Labels stay mounted at full width (never width-collapsed) — the parent <aside>
// clips them with overflow-hidden while it's the narrow rail, and whitespace-nowrap
// keeps them on one line. They only fade in (opacity), with a short delay so the
// text appears *after* the width has begun expanding rather than racing it.
function SidebarLabel({ expanded, children, className = '' }: { expanded: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100 delay-100' : 'opacity-0'} ${className}`}>
      {children}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({ className = 'flex' }: { className?: string }) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  // Icon-only by default — hovering (or pinning via the toggle button) reveals full labels
  const [collapsed, setCollapsed] = useState(true)
  const [hovered, setHovered] = useState(false)
  const expanded = !collapsed || hovered

  const { allowedModules } = useModuleAccess(user?.role, user?.department)
  // Sidebar notification: unseen tools an admin has published (cleared per-tool
  // once the user opens it). Only meaningful for the main "Tools" item.
  const { unseenCount: unseenToolCount } = useUnseenTools()

  const isNewJoiner = useMemo(() => getDaysSince(user?.startDate) < NEW_JOINER_DAYS, [user?.startDate])
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved !== null) setCollapsed(saved === 'true')
  }, [])

  const toggleCollapse = () => {
    setCollapsed((v) => {
      localStorage.setItem('sidebar_collapsed', String(!v))
      return !v
    })
  }

  function isModuleAllowed(moduleId?: ModuleId): boolean {
    if (!moduleId) return true
    return allowedModules.has(moduleId)
  }

  function filterChildren(children: SubNavItem[]) {
    return children.filter(c => {
      if (!user || !canAccess(user.role, c.requiredRole)) return false
      if (c.newJoinerOnly && !isNewJoiner && !isSuperAdmin) return false
      if (!isModuleAllowed(c.moduleId)) return false
      return true
    })
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!user) return false
    const hasMin = canAccess(user.role, item.requiredRole)
    const withinMax = !item.maxRole || ROLE_HIERARCHY[user.role] <= ROLE_HIERARCHY[item.maxRole]
    if (!hasMin || !withinMax) return false
    // Top-level module check
    if (!isModuleAllowed(item.moduleId)) return false
    // Parent with children: hide if all children are filtered out
    if (item.children) {
      const visibleChildren = filterChildren(item.children)
      if (visibleChildren.length === 0) return false
    }
    return true
  })

  const mainItems   = visibleItems.filter((i) => i.group === 'main')
  const manageItems = visibleItems.filter((i) => i.group === 'manage')

  return (
    <>
      {/* 80px spacer in normal flow so main content never sits under the collapsed
          rail. The real sidebar below is fixed-positioned, so hover-expand overlays
          content instead of pushing/resizing it. */}
      <div className={`${className} h-screen w-20 shrink-0`} aria-hidden="true" />
      {/* Collapsed = 80px icon rail; hover (or pin) expands to 280px as an overlay.
          Animate width only (not transition-all) so box-shadow snaps in without
          repainting a blurred shadow every frame. overflow-hidden clips the labels
          while narrow; whitespace-nowrap keeps them from wrapping mid-transition. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`${className} fixed inset-y-0 left-0 z-50 flex-col overflow-hidden bg-white border-r border-gray-100 transition-[width] duration-300 ease-out ${expanded ? 'w-[280px] shadow-xl' : 'w-20'}`}
      >
      {/* ── 1. Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-[14px] px-4 border-b border-gray-100">
        <Link href="/sale" className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FRESHKET_LOGO_URL} alt="Freshket" className="h-7 w-auto object-contain shrink-0" />
          <SidebarLabel expanded={expanded} className="text-xs font-normal text-gray-400">Sale Tracking</SidebarLabel>
        </Link>
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            )}
          </svg>
        </button>
      </div>

      {/* Profile moved to the top-right of the page (top bar / page Header) */}

      {/* ── 2. Main Navigation (flat — sub-nav lives in page tabs) ───────────── */}
      <nav className="py-4 px-3 space-y-1.5 border-b border-gray-50">
        {mainItems.map((item) => (
          <NavLink
            key={item.href + item.label}
            item={item}
            pathname={pathname}
            collapsed={!expanded}
            unseenCount={item.href === '/tools' ? unseenToolCount : 0}
          />
        ))}
      </nav>

      {/* ── 3. Manage section (flat — no group label, sub-nav lives in page tabs) ── */}
      {manageItems.length > 0 && (
        <div className="mt-4 px-3">
          <div className="space-y-1.5">
            {manageItems.map((item) => (
              <NavLink key={item.href + item.label} item={item} pathname={pathname} collapsed={!expanded} />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* ── 4. Footer ───────────────────────────────────────────────────────── */}
      {user && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-rose-50 hover:text-rose-500 transition-colors"
            title="Sign Out"
          >
            <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <SidebarLabel expanded={expanded} className="font-normal">Sign Out</SidebarLabel>
          </button>
        </div>
      )}
      </aside>
    </>
  )
}

// ── NavLink ────────────────────────────────────────────────────────────────────
function NavLink({
  item,
  pathname,
  collapsed,
  unseenCount = 0,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  unseenCount?: number
}) {
  const active =
    !item.noActive && (
      pathname === item.href ||
      pathname.startsWith(item.href + '/') ||
      (item.matchPaths ?? []).some((p) => pathname === p || pathname.startsWith(p + '/'))
    )

  const cls = `
    flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all
    ${active
      ? 'bg-freshket-100 text-freshket-700 font-normal [&_svg]:text-freshket-500'
      : 'text-gray-500 font-normal [&_svg]:text-gray-400'
    }
  `

  const expanded = !collapsed

  if (item.noLink) {
    return (
      <div title={collapsed ? item.label : undefined} className={cls + ' cursor-default select-none'}>
        {item.icon}
        <SidebarLabel expanded={expanded} className="flex-1">{item.label}</SidebarLabel>
        {expanded && item.children && item.children.length > 0 && (
          <svg className="size-3.5 shrink-0 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      prefetch={true}
      title={collapsed ? item.label : undefined}
      className={`
        flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all
        ${active
          ? 'bg-freshket-100 text-freshket-700 font-normal [&_svg]:text-freshket-500'
          : 'text-gray-600 font-normal hover:bg-gray-50 hover:text-gray-900 [&_svg]:text-gray-400 hover:[&_svg]:text-gray-600'
        }
      `}
    >
      {/* Icon + collapsed-rail notification dot */}
      <span className="relative shrink-0 flex">
        {item.icon}
        {unseenCount > 0 && collapsed && (
          <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        )}
      </span>
      <SidebarLabel expanded={expanded} className="flex-1">{item.label}</SidebarLabel>
      {/* Expanded: count pill */}
      {unseenCount > 0 && expanded && (
        <SidebarLabel expanded={expanded}>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-xs font-bold leading-none">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        </SidebarLabel>
      )}
    </Link>
  )
}
