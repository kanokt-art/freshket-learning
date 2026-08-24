'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { canAccess } from '@/types/user'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomBar } from '@/components/layout/BottomBar'
import { DemoRoleSwitcher } from '@/components/features/DemoRoleSwitcher'
import { NavProgress } from '@/components/common/NavProgress'

// Routes worth warming, split by who can actually reach them. Prefetching all 20
// unconditionally pulled ~509 kB gzipped on layout mount — competing for bandwidth
// with the Firebase auth handshake and the first Firestore reads, so the FIRST
// screen after login got slower in order to speed up the second. It also warmed
// /admin* and /users for learners who can never open them.
//
// <Link> still prefetches on hover/viewport, so a short list covers most of the win.
const PREFETCH_COMMON = ['/sale', '/courses', '/tools']
const PREFETCH_LEAD = ['/manager', '/users']
const PREFETCH_ADMIN = ['/admin/settings']

// NOTE: this deliberately does NOT key on pathname.
//
// It used to be `<div key={pathname} … animate-float-up>`, which forced React to
// throw away and rebuild the ENTIRE page subtree on every navigation: every
// component body re-ran from scratch (and the biggest pages here are 2,000-3,900
// lines), all component state was discarded, and the entrance animation replayed —
// so even when the data was already warm in the listener cache, switching tabs
// still cost a full mount plus an animation before anything looked ready.
//
// The App Router already swaps this subtree when the route changes, so the key
// added the teardown without buying anything. The animation is intentionally gone
// with it: it was padding perceived latency on every single tab switch.
function AnimatedContent({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  // Warm the likely-next routes, but only ones this user can reach, and only once
  // the browser is idle — so prefetch never competes with first paint or the
  // initial Firestore reads.
  useEffect(() => {
    if (!user) return
    const routes = [
      ...PREFETCH_COMMON,
      ...(canAccess(user.role, 'team_lead') ? PREFETCH_LEAD : []),
      ...(user.role === 'super_admin' ? PREFETCH_ADMIN : []),
    ]
    const run = () => routes.forEach((r) => router.prefetch(r))
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback
    if (ric) {
      const handle = ric(run, { timeout: 3000 })
      return () => (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback?.(handle)
    }
    // Safari has no requestIdleCallback — a short timeout is close enough.
    const t = setTimeout(run, 1500)
    return () => clearTimeout(t)
  }, [router, user])

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
