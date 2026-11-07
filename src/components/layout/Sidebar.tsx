'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { BookMarked, BookOpen, GraduationCap, House, LibraryBig, LogOut, MessagesSquare, Target, Undo2, UserCog, Users, Wrench } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useUnseenFeedback } from '@/hooks/useUnseenFeedback'
import { canAccess, ROLE_HIERARCHY, type UserRole } from '@/types/user'
import { FRESHKET_LOGO_URL } from '@/lib/demo/demoMode'
import { MbtiBadge } from '@/components/features/MbtiBadge'
import { englishName } from '@/lib/users/displayName'
import type { ModuleId } from '@/lib/modules'

// ── Nav item definition ───────────────────────────────────────────────────────
interface SubNavItem {
  href: string
  label: string
  requiredRole: UserRole
  moduleId?: ModuleId        // hide when module not allowed for user's department
  icon?: React.ReactNode
  badge?: string
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
  /** Paths under href that belong to another item (e.g. Mandatory Reading at /courses/mandatory is a Tool). */
  excludePaths?: string[]
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
    icon: <House className="size-5 shrink-0" strokeWidth={1.8} />,
  },
  {
    // Team overview for leads — member roster + training history (/manager page).
    // Sale doesn't see it; super_admin uses Administration instead.
    href: '/manager',
    label: 'Team',
    requiredRole: 'team_lead',
    maxRole: 'manager',
    group: 'main',
    icon: <Users className="size-5 shrink-0" strokeWidth={1.8} />,
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
    // Practice (Shadow Visit, Role Play) has its own item below; Mandatory Reading sits under Tools.
    excludePaths: ['/courses/mandatory', '/courses/roleplay'],
    // No top-level moduleId — parent is shown when ANY child is visible
    icon: <BookOpen className="size-5 shrink-0" strokeWidth={1.8} />,
    children: [
      {
        href: '/courses',
        label: 'Course',
        requiredRole: 'sale',
        moduleId: 'lms',
        exact: true,
        icon: <BookOpen className="size-3.5 shrink-0" strokeWidth={2} />,
      },
      {
        href: '/courses/roleplay',
        label: 'Role Play',
        requiredRole: 'sale',
        moduleId: 'roleplay',
        icon: <MessagesSquare className="size-3.5 shrink-0" strokeWidth={2} />,
      },
    ],
  },
  {
    // The hands-on training, out of My Course: Shadow Visit and Role Play, switched between by the
    // PracticeTabs bar on their pages. Shown when the department has either.
    href: '/shadow',
    label: 'Practice',
    requiredRole: 'sale',
    maxRole: 'manager',
    group: 'main',
    matchPaths: ['/courses/roleplay'],
    icon: <Target className="size-5 shrink-0" strokeWidth={1.8} />,
    children: [
      { href: '/shadow', label: 'Shadow Visit', requiredRole: 'sale', moduleId: 'shadow', icon: null },
      { href: '/courses/roleplay', label: 'Role Play', requiredRole: 'sale', moduleId: 'roleplay', icon: null },
    ],
  },
  {
    // Flat link — sub-nav (Tools / Mandatory) now lives as
    // a tab bar on the page (FreshketToolTabs). children[] kept only for gating.
    href: '/tools',
    label: 'Tools',
    requiredRole: 'sale',
    group: 'main',
    matchPaths: ['/courses/mandatory'],
    // No top-level moduleId — parent shown when any child is visible
    icon: <Wrench className="size-5 shrink-0" strokeWidth={1.8} />,
    children: [
      {
        href: '/tools',
        label: 'Tools',
        requiredRole: 'sale',
        moduleId: 'sale_tools',
        exact: true,
        icon: <Wrench className="size-3.5 shrink-0" strokeWidth={2} />,
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
    icon: <LibraryBig className="size-5 shrink-0" strokeWidth={1.8} />,
  },
  {
    // Lands on the Employees list; the rest (Tools, System) lives as a tab
    // bar on the pages themselves (AdministrationTabs).
    href: '/users',
    label: 'Administration',
    requiredRole: 'super_admin',
    group: 'manage',
    matchPaths: ['/admin/settings', '/admin/announcements', '/log', '/tools'],
    icon: <UserCog className="size-5 shrink-0" strokeWidth={1.8} />,
  },
  {
    // The admin manual — how course, learner, publish and Slack features behave.
    href: '/admin/guide',
    label: 'คู่มือ Admin',
    requiredRole: 'super_admin',
    group: 'manage',
    icon: <BookMarked className="size-5 shrink-0" strokeWidth={1.8} />,
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
  // Feedback from a team lead or manager the learner has not read: a red dot on My Course leads to the course.
  const unseenFeedback = useUnseenFeedback()
  const pathname = usePathname()
  const { user, signOut, realRole, roleOverride, userOverride, setRoleOverride } = useAuth()
  const router = useRouter()
  // Icon-only by default — hovering (or pinning via the toggle button) reveals full labels
  const [collapsed, setCollapsed] = useState(true)
  const [hovered, setHovered] = useState(false)
  const expanded = !collapsed || hovered

  const { allowedModules } = useModuleAccess(user?.role, user?.department)


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
    // Practice opens Shadow Visit, or Role Play for a department without Shadow Visit.
    .map((item) => (item.label === 'Practice' && !isModuleAllowed('shadow') ? { ...item, href: '/courses/roleplay', matchPaths: ['/shadow'] } : item))

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

      {/* ── 1b. Profile ─────────────────────────────────────────────────────── */}
      {/* The page Header also shows an avatar; this block is the one that
          carries the person's position and MBTI, and it stays visible while
          navigating. Collapsed, only the avatar shows — everything else is
          clipped by the rail's overflow-hidden, so nothing needs unmounting. */}
      {user && (
        <Link
          href="/profile"
          className={`flex items-center gap-3 border-b border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors ${
            pathname === '/profile' ? 'bg-freshket-50' : ''
          }`}
        >
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt={englishName(user)}
              className="size-10 rounded-full object-cover ring-2 ring-freshket-100 shrink-0"
            />
          ) : (
            <div className="size-10 rounded-full bg-freshket-500 flex items-center justify-center text-white text-sm font-black ring-2 ring-freshket-100 shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <SidebarLabel expanded={expanded} className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 truncate">{englishName(user)}</span>
            {user.position && (
              <span className="block text-xs font-normal text-gray-400 truncate">{user.position}</span>
            )}
            {/* Nickname and MBTI as pills under the name */}
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {user.nickname?.trim() && (
                <span className="inline-flex items-center text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">
                  {user.nickname.trim()}
                </span>
              )}
              <MbtiBadge uid={user.uid} openable />
            </span>
          </SidebarLabel>
        </Link>
      )}

      {/* ── 2. Main Navigation (flat — sub-nav lives in page tabs) ───────────── */}
      <nav className="py-4 px-3 space-y-1.5 border-b border-gray-50">
        {mainItems.map((item) => (
          <NavLink
            key={item.href + item.label}
            item={item}
            pathname={pathname}
            collapsed={!expanded}
            dot={item.label === 'My Course' && unseenFeedback.size > 0}
          />
        ))}
        {/* A super_admin learns like anyone else: this opens the app as a learner (same account,
            same records) with My Course, Tools and the rest; the button at the bottom comes back. */}
        {realRole === 'super_admin' && !roleOverride && !userOverride && (
          <button
            type="button"
            onClick={() => { setRoleOverride('sale'); router.push('/courses') }}
            title={!expanded ? 'My Course (เรียนเหมือนผู้เรียน)' : 'เปิดมุมมองผู้เรียนเพื่อเรียนหลักสูตร'}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-normal text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all [&_svg]:text-gray-400 hover:[&_svg]:text-gray-600"
          >
            <span className="shrink-0 flex">
              <GraduationCap className="size-5 shrink-0" strokeWidth={1.8} />
            </span>
            <SidebarLabel expanded={expanded} className="flex-1 text-left">My Course</SidebarLabel>
          </button>
        )}
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
      {realRole === 'super_admin' && !!roleOverride && (
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => { setRoleOverride(null); router.push('/users') }}
            title="กลับเป็น Super Admin"
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
          >
            <Undo2 className="size-5 shrink-0" strokeWidth={1.8} />
            <SidebarLabel expanded={expanded} className="flex-1 text-left">กลับเป็น Super Admin</SidebarLabel>
          </button>
        </div>
      )}
      {user && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-rose-50 hover:text-rose-500 transition-colors"
            title="Sign Out"
          >
            <LogOut className="size-[18px] shrink-0" strokeWidth={1.8} />
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
  dot = false,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  /** A red dot: there is something new to read behind this item. */
  dot?: boolean
}) {
  const active =
    !item.noActive &&
    !(item.excludePaths ?? []).some((p) => pathname === p || pathname.startsWith(p + '/')) && (
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
      <span className="relative shrink-0 flex">
        {item.icon}
        {dot && <span aria-label="มีความเห็นใหม่จากหัวหน้า" className="absolute -top-1 -right-1 size-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
      </span>
      <SidebarLabel expanded={expanded} className="flex-1">{item.label}</SidebarLabel>
    </Link>
  )
}
