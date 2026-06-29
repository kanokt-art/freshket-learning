'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { canAccess, ROLE_LABELS, ROLE_HIERARCHY, type UserRole } from '@/types/user'
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
    label: 'My Dashboard',
    requiredRole: 'sale',
    group: 'main',
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/courses',
    label: 'My Course',
    requiredRole: 'sale',
    maxRole: 'manager',
    group: 'main',
    noLink: true,
    noActive: true,
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
        href: '/shadow',
        label: 'Shadow Visit',
        requiredRole: 'sale',
        moduleId: 'shadow',
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
    href: '/points',
    label: 'คะแนนของฉัน',
    requiredRole: 'sale',
    maxRole: 'manager',
    group: 'main',
    moduleId: 'points',
    matchPaths: ['/points'],
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
  },
  {
    href: '/tools',
    label: 'Freshket Tool',
    requiredRole: 'sale',
    maxRole: 'manager',
    group: 'main',
    noLink: true,
    noActive: true,
    // No top-level moduleId — parent shown when any child is visible
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
    children: [
      {
        href: '/tools',
        label: 'Sale Tool',
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
        href: '/tools/mandatory',
        label: 'Mandatory',
        requiredRole: 'sale',
        moduleId: 'sale_tools',
        icon: (
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
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
    href: '/courses',
    label: 'Course Management',
    requiredRole: 'super_admin',
    group: 'manage',
    matchPaths: ['/assessment'],
    noLink: true,
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    children: [
      {
        href: '/courses', label: 'All Courses', requiredRole: 'super_admin',
        exact: true,
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
      },
      {
        href: '/assessment', label: 'Assessment', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>,
      },
      {
        href: '/courses/roleplay', label: 'Role Play', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>,
      },
    ],
  },
  {
    href: '/admin',
    label: 'Administration',
    requiredRole: 'super_admin',
    group: 'manage',
    noLink: true,
    matchPaths: ['/users', '/points', '/log', '/tools', '/admin'],
    icon: (
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    children: [
      {
        href: '/users', label: 'Employees', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
      },
      {
        href: '/points', label: 'จัดการคะแนน', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>,
      },
      {
        href: '/log', label: 'Activity Log', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
      },
      {
        href: '/tools', label: 'Freshket Tools', requiredRole: 'super_admin',
        exact: true,
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
      },
      {
        href: '/tools/mandatory', label: 'Mandatory', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
      },
      {
        href: '/tools/new-joiner', label: 'New Joiner Hub', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
      },
      {
        href: '/admin/settings', label: 'Module Settings', requiredRole: 'super_admin',
        icon: <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>,
      },
    ],
  },
]

// DS-#042: No border on badges/chips
const ROLE_BADGE_COLOR: Record<UserRole, string> = {
  super_admin: 'bg-orange-50 text-orange-600',
  manager:     'bg-purple-50 text-purple-600',
  team_lead:   'bg-blue-50 text-blue-600',
  sale:        'bg-freshket-100 text-freshket-700',
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Sidebar({ className = 'flex' }: { className?: string }) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const { allowedModules } = useModuleAccess(user?.role, user?.department)

  const isNewJoiner = useMemo(() => getDaysSince(user?.startDate) < NEW_JOINER_DAYS, [user?.startDate])
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved === 'true') setCollapsed(true)
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
    <aside
      className={`h-screen flex-col bg-white border-r border-gray-100 shrink-0 transition-all duration-300 ${collapsed ? 'w-[56px]' : 'w-60'} ${className}`}
    >
      {/* ── 1. Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between py-[14px] px-4 border-b border-gray-100">
        <Link href="/sale" className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FRESHKET_LOGO_URL} alt="Freshket" className="h-7 w-auto object-contain shrink-0" />
          {!collapsed && (
            <span className="text-xs font-normal text-gray-400 truncate">Sale Tracking</span>
          )}
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

      {/* ── 1.5. User Profile (top) ──────────────────────────────────────────── */}
      {user && (
        <Link
          href="/profile"
          className={`flex items-center gap-2.5 px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group ${collapsed ? 'justify-center' : ''}`}
        >
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt={user.displayName} className="size-8 rounded-full object-cover border border-freshket-200 shrink-0" />
          ) : (
            <div className="size-8 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-freshket-700 text-sm font-bold shrink-0">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 truncate leading-tight">{user.displayName}</p>
                <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE_COLOR[user.role]}`}>
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
              <svg className="size-4 text-gray-400 shrink-0 group-hover:text-freshket-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </>
          )}
        </Link>
      )}

      {/* ── 2. Main Navigation ───────────────────────────────────────────────── */}
      <nav className="py-4 px-3 space-y-1.5 border-b border-gray-50">
        {mainItems.map((item) => {
          const visibleChildren = filterChildren(item.children ?? [])
          return (
            <div key={item.href + item.label}>
              <NavLink item={item} pathname={pathname} collapsed={collapsed} />
              {!collapsed && visibleChildren.length > 0 && (
                <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                  {visibleChildren.map((child) => {
                    const childActive = child.exact
                      ? pathname === child.href
                      : pathname === child.href || pathname.startsWith(child.href + '/')
                    return (
                      <Link
                        key={child.href + child.label}
                        href={child.href}
                        prefetch={true}
                        className={`flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg text-xs transition-all ${
                          childActive
                            ? 'bg-freshket-100 text-freshket-700 font-normal'
                            : 'text-gray-500 font-normal hover:bg-gray-50 hover:text-gray-700'
                        }`}
                      >
                        {child.icon ?? (
                          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5" />
                          </svg>
                        )}
                        <span className="flex-1">{child.label}</span>
                        {child.badge && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 leading-none">
                            {child.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── 3. Manage section ───────────────────────────────────────────────── */}
      {manageItems.length > 0 && (
        <div className="mt-4 px-3">
          {!collapsed && (
            <p className="text-xs font-bold text-gray-400 px-2 mb-2">
              Admin
            </p>
          )}
          <div className="space-y-1.5">
            {manageItems.map((item) => {
              const visibleChildren = filterChildren(item.children ?? [])
              return (
                <div key={item.href + item.label}>
                  <NavLink item={item} pathname={pathname} collapsed={collapsed} />
                  {!collapsed && visibleChildren.length > 0 && (
                    <div className="mt-0.5 ml-3 pl-3 border-l border-gray-100 space-y-0.5">
                      {visibleChildren.map((child) => {
                        const childActive = child.exact
                          ? pathname === child.href
                          : pathname === child.href || pathname.startsWith(child.href + '/')
                        return (
                          <Link
                            key={child.href + child.label}
                            href={child.href}
                            prefetch={true}
                            className={`flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg text-xs transition-all ${
                              childActive
                                ? 'bg-freshket-100 text-freshket-700 font-bold'
                                : 'text-gray-500 font-normal hover:bg-gray-50 hover:text-gray-700'
                            }`}
                          >
                            {child.icon ?? (
                              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                              </svg>
                            )}
                            {child.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* ── 4. Footer ───────────────────────────────────────────────────────── */}
      {user && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2">
          <button
            onClick={signOut}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-rose-50 hover:text-rose-500 transition-colors ${collapsed ? 'justify-center' : ''}`}
            title="Sign Out"
          >
            <svg className="size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            {!collapsed && <span className="font-normal">Sign Out</span>}
          </button>
        </div>
      )}
    </aside>
  )
}

// ── NavLink ────────────────────────────────────────────────────────────────────
function NavLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
}) {
  const active =
    !item.noActive && (
      pathname === item.href ||
      pathname.startsWith(item.href + '/') ||
      (item.matchPaths ?? []).some((p) => pathname === p || pathname.startsWith(p + '/'))
    )

  const cls = `
    flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all
    ${collapsed ? 'justify-center' : ''}
    ${active
      ? 'bg-freshket-100 text-freshket-700 font-normal [&_svg]:text-freshket-500'
      : 'text-gray-500 font-normal [&_svg]:text-gray-400'
    }
  `

  if (item.noLink) {
    return (
      <div title={collapsed ? item.label : undefined} className={cls + ' cursor-default select-none'}>
        {item.icon}
        {!collapsed && (
          <>
            <span className="truncate flex-1">{item.label}</span>
            {item.children && item.children.length > 0 && (
              <svg className="size-3.5 shrink-0 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            )}
          </>
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
        ${collapsed ? 'justify-center' : ''}
        ${active
          ? 'bg-freshket-100 text-freshket-700 font-normal [&_svg]:text-freshket-500'
          : 'text-gray-600 font-normal hover:bg-gray-50 hover:text-gray-900 [&_svg]:text-gray-400 hover:[&_svg]:text-gray-600'
        }
      `}
    >
      {item.icon}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}
