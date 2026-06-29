'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomBar } from '@/components/layout/BottomBar'
import { DemoRoleSwitcher } from '@/components/features/DemoRoleSwitcher'
import { NavProgress } from '@/components/common/NavProgress'

const PREFETCH_ROUTES = [
  '/sale', '/courses', '/courses/roleplay', '/shadow',
  '/tools', '/tools/mandatory', '/tools/new-joiner',
  '/users', '/assessment', '/profile', '/notifications',
]

// Retriggers the float-up animation without remounting the element.
function AnimatedContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove('animate-float-up')
    void el.offsetWidth // force reflow so browser picks up the removal
    el.classList.add('animate-float-up')
  }, [pathname])

  return (
    <div ref={ref} className="flex-1 flex flex-col overflow-hidden animate-float-up">
      {children}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  // Eagerly prefetch all main routes so navigation feels instant
  useEffect(() => {
    PREFETCH_ROUTES.forEach((r) => router.prefetch(r))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface">
        <span className="size-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-brand-surface">
      <NavProgress />
      {/* Sidebar: visible on lg+ only */}
      <Sidebar className="hidden lg:flex" />
      <main className="flex-1 flex flex-col overflow-hidden">
        <AnimatedContent>{children}</AnimatedContent>
        {/* Spacer so content isn't hidden behind the mobile bottom bar */}
        <div className="h-[62px] shrink-0 lg:hidden" />
      </main>
      <DemoRoleSwitcher />
      {/* Bottom bar: visible on mobile only */}
      <BottomBar />
    </div>
  )
}
