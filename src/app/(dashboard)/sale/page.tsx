'use client'

import { isInCourseTarget } from '@/lib/courses/audience'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '@/lib/api/authedFetch'
import { useAuth } from '@/hooks/useAuth'
import { useMyTrainingRecords, useCourses, useAllTrainingRecords, useUserStats, useAllUsers, useAnnouncements } from '@/hooks/useFirestore'
import { useHomeHighlights } from '@/hooks/useHomeHighlights'
import { useMentorName } from '@/hooks/useMentorName'
import { MemberCourseDrawer } from '@/components/features/MemberCourseDrawer'
import { CourseCover } from '@/components/features/CourseCover'
import { ShadowVisitDrawer } from '@/components/features/ShadowVisitDrawer'
import { ShadowPushButton } from '@/components/features/ShadowPushButton'
import { HomeHighlightsRow } from '@/components/features/HomeHighlights'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useNotifications } from '@/hooks/useNotifications'
import { sidebarNotices } from '@/lib/notifications/sidebarNotices'
import type { UserStats } from '@/types/stats'
import { CATEGORY_LABELS, type Course, type CourseCategory } from '@/types/course'
import { type TrainingRecord, type TrainingStatus } from '@/types/tracking'
import { canAccess, type UserProfile } from '@/types/user'
import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'
import { LearnerCourseGridCard } from '@/components/features/LearnerCourseDashboard'
import { TeamLeadHome } from '@/components/features/TeamLeadHome'
import { UserTable, UserSidePanel } from '@/components/features/MemberDirectory'

const CAT_TEXT: Record<CourseCategory, string> = {
  product:     'text-blue-500',
  sales_skill: 'text-freshket-600',
  compliance:  'text-amber-500',
  onboarding:  'text-purple-500',
  leadership:  'text-rose-500',
}
const CAT_BG: Record<CourseCategory, string> = {
  product:     'from-blue-200 to-sky-100',
  sales_skill: 'from-freshket-200 to-emerald-100',
  compliance:  'from-amber-200 to-yellow-100',
  onboarding:  'from-purple-200 to-violet-100',
  leadership:  'from-rose-200 to-pink-100',
}
const STATUS_BADGE: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress:  'bg-blue-100 text-blue-700',
  completed:    'bg-freshket-100 text-freshket-700',
  failed:       'bg-rose-100 text-rose-600',
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SaleDashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: ownRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: courses } = useCourses()
  // Records of a closed course are left out: a course closed to learners disappears for everyone,
  // including people who were learning it or had finished it, until it is published again.
  const myRecords = useMemo(
    () => ownRecords.filter((r) => courses.find((c) => c.id === r.courseId)?.isPublished !== false),
    [ownRecords, courses],
  )
  const { data: stats, loading: statsLoading } = useUserStats()
  // Was `stats.length > 0` — a GLOBAL check: one other user having a summary doc
  // was enough to consider stats "ready" for everyone, so a learner whose own
  // summary hadn't been built yet silently read 0 instead of falling back.
  // Checking for THIS user's own doc makes the fallback fire exactly when it's
  // actually needed.
  const hasStats = !statsLoading && !!user?.uid && stats.some((s) => s.uid === user.uid)
  // Fall back to the full trainingRecords collection only while summaries aren't built.
  // NOTE: this fallback still streams the entire collection, so if userStats is
  // ever empty for everyone (cold deploy) every client does it at once. The real
  // fix is a server-maintained aggregate — see the audit notes.
  const { data: allRecords } = useAllTrainingRecords(!hasStats)
  // isAdmin only depends on `user`, computed here (ahead of its other use below)
  // so this hook call can gate on it — a sale-role learner has no admin UI that
  // reads `allUsers` on this page, so subscribing them to the whole roster was
  // a full-collection read paid by every learner on the app's landing page.
  const isAdmin = user?.role ? canAccess(user.role, 'team_lead') : false
  const { data: allUsers } = useAllUsers(isAdmin)
  // "Latest": what's new for this learner, as a super_admin pinned it (or the newest few).
  const highlights = useHomeHighlights(user)
  const { data: announcements } = useAnnouncements()
  const announcementBodies = useMemo(() => new Map(announcements.map((a) => [`announcement:${a.id}`, a.body])), [announcements])

  const statsByUid = useMemo(() => {
    const m = new Map<string, UserStats>()
    for (const s of stats) m.set(s.uid, s)
    return m
  }, [stats])


  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  // Right sidebar (streak + training status) is secondary detail — collapsed by
  // default so it doesn't compete with the course list, opened on demand.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // The learner's notifications (what a team lead or manager said, new courses…): listed in the sidebar,
  // with a signal on its handle while any is unread. Opening the sidebar is what reads them.
  const { items: notifItems, markRead } = useNotifications(user?.uid)
  const notices = useMemo(() => sidebarNotices(notifItems), [notifItems])
  // The ones that were unread when the sidebar was opened: still highlighted for that visit, so the
  // learner can see what is new even though the signal is gone.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set())
  function toggleSidebar() {
    if (!sidebarOpen && notices.unread > 0) {
      setFreshIds(new Set(notices.unreadIds))
      notices.unreadIds.forEach(markRead)
    }
    setSidebarOpen((v) => !v)
  }
  const firstName = user?.nickname ?? user?.displayName?.split(' ')[0] ?? 'คุณ'
  const daysSince = getDaysSince(user?.startDate)
  const isNewJoiner = !isAdmin && daysSince < NEW_JOINER_DAYS
  const daysLeft = Math.max(0, NEW_JOINER_DAYS - daysSince)
  const njPct = Math.min(100, Math.round((daysSince / NEW_JOINER_DAYS) * 100))

  const courseMap = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses])
  const completedRecords = useMemo(() => myRecords.filter((r) => r.status === 'completed'), [myRecords])
  const completedCount = completedRecords.length
  const hoursLearned = useMemo(
    () => completedRecords.reduce((s, r) => s + (courseMap[r.courseId]?.durationMinutes ?? 0), 0) / 60,
    [completedRecords, courseMap],
  )

  // Admin-specific stats — from the summaries when built, else the raw records.
  const adminTotals = useMemo(() => {
    if (hasStats) {
      let completed = 0, total = 0
      for (const s of stats) { completed += s.completedCount; total += s.totalCount }
      return { completed, total }
    }
    return { completed: allRecords.filter(r => r.status === 'completed').length, total: allRecords.length }
  }, [hasStats, stats, allRecords])
  const adminTotalCompletions = adminTotals.completed
  const adminCompletionRate = adminTotals.total ? Math.round((adminTotals.completed / adminTotals.total) * 100) : 0
  const adminPublishedCourses = useMemo(() => courses.filter(c => c.isPublished).length, [courses])
  const continueRecords = useMemo(() => myRecords.filter((r) => r.status === 'in_progress'), [myRecords])
  const firstContinueRecord = continueRecords[0] ?? null
  const recordMap = useMemo(() => {
    const m: Record<string, { status: string; score?: number }> = {}
    myRecords.forEach((r) => { m[r.courseId] = { status: r.status, score: r.score } })
    return m
  }, [myRecords])
  // Full records keyed by course — needed by LearnerCourseGridCard for its
  // lesson-progress bar (recordMap above only carries status/score).
  const recordByCourse = useMemo(() => {
    const m: Record<string, TrainingRecord> = {}
    myRecords.forEach((r) => { m[r.courseId] = r })
    return m
  }, [myRecords])
  // Targeting must match /courses: role, individually assigned, or a saved department/team
  const forYouCourses = useMemo(
    () => courses.filter((c) =>
      c.isPublished && isInCourseTarget(c, { uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId }),
    ),
    [courses, user],
  )

  const DEADLINE_WARN_DAYS = 7
  const urgentCourses = useMemo(() => {
    if (!user) return []
    const now = new Date()
    const cutoff = new Date(now.getTime() + DEADLINE_WARN_DAYS * 24 * 60 * 60 * 1000)
    return courses
      .filter(c => {
        if (!c.isPublished || !c.endDate) return false
        const end = c.endDate instanceof Date ? c.endDate : new Date(c.endDate as unknown as string)
        if (isNaN(end.getTime()) || end < now || end > cutoff) return false
        const isTargeted = isInCourseTarget(c, user)
        if (!isTargeted) return false
        return recordMap[c.id]?.status !== 'completed'
      })
      .map(c => {
        const end = c.endDate instanceof Date ? c.endDate : new Date(c.endDate as unknown as string)
        const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        const startD = c.startDate instanceof Date ? c.startDate : (c.startDate ? new Date(c.startDate as unknown as string) : null)
        const totalMs = startD ? end.getTime() - startD.getTime() : null
        const elapsedMs = startD ? now.getTime() - startD.getTime() : null
        const pct = totalMs && elapsedMs ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))) : null
        return { course: c, daysLeft, endDate: end, pct }
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [courses, user, recordMap])

  // Courses assigned to me that aren't finished. Sorted so the ones already
  // started come first (finishing something in progress beats starting something
  // new), then by nearest deadline, then by title for a stable order.
  const pendingCourses = useMemo(() => {
    const withDeadline = (c: Course) => {
      if (!c.endDate) return Number.POSITIVE_INFINITY
      const d = c.endDate instanceof Date ? c.endDate : new Date(c.endDate as unknown as string)
      return isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime()
    }
    return forYouCourses
      .filter((c) => recordMap[c.id]?.status !== 'completed')
      .sort((a, b) => {
        const aStarted = recordMap[a.id]?.status === 'in_progress' ? 0 : 1
        const bStarted = recordMap[b.id]?.status === 'in_progress' ? 0 : 1
        if (aStarted !== bStarted) return aStarted - bStarted
        const dd = withDeadline(a) - withDeadline(b)
        if (dd !== 0) return dd
        return a.title.localeCompare(b.title, 'th')
      })
  }, [forYouCourses, recordMap])

  const pendingCourseCount = pendingCourses.length

  // A finished course the learner has taken off their list stays in the stats above, just not in this grid.
  const listedForYou = useMemo(
    () => forYouCourses.filter((c) => !recordByCourse[c.id]?.dismissedAt),
    [forYouCourses, recordByCourse],
  )
  const dismissCourse = async (courseId: string) => {
    try {
      const res = await authedFetch('/api/training-records/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        window.alert(typeof data.error === 'string' ? data.error : 'ซ่อนหลักสูตรไม่สำเร็จ')
      }
    } catch {
      window.alert('ซ่อนหลักสูตรไม่สำเร็จ')
    }
  }

  // Team lead / manager get the dedicated 3-column team dashboard.
  if (user?.role === 'team_lead' || user?.role === 'manager') {
    return <TeamLeadHome />
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* ── LEFT / MAIN ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-5">

          {/* Hero — solid brand fill, no gradient (design.md DS-#020: gradients are a
              marketing/onboarding-only carve-out). Uses the standard freshket-500
              (#00ce7c) brand fill, matching the header bar and every CTA button. */}
          <div className="relative rounded-2xl overflow-hidden bg-freshket-500">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 right-20 size-10 rounded-2xl bg-white/15 flex items-center justify-center rotate-6">
                <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11.7 2.805a.75.75 0 01.6 0A60.65 60.65 0 0122.83 8.72a.75.75 0 01-.231 1.337 49.949 49.949 0 00-9.902 3.912l-.003.002-.34.18a.75.75 0 01-.707 0A50.009 50.009 0 007.5 12.174v-.224c0-.131.067-.248.172-.311a54.614 54.614 0 014.653-2.52.75.75 0 00-.65-1.352 56.129 56.129 0 00-4.78 2.589 1.858 1.858 0 00-.859 1.228 49.803 49.803 0 00-4.634-1.527.75.75 0 01-.231-1.337A60.653 60.653 0 0111.7 2.805z" /></svg>
              </div>
              <div className="absolute top-10 right-6 size-10 rounded-2xl bg-amber-400/80 flex items-center justify-center -rotate-3">
                <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" /></svg>
              </div>
              <div className="absolute bottom-6 right-14 size-9 rounded-2xl bg-freshket-400/70 flex items-center justify-center rotate-12">
                <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M2.25 2.25a.75.75 0 000 1.5H3v10.5a3 3 0 003 3h1.21l-1.172 3.513a.75.75 0 001.424.474l.329-.987h8.418l.33.987a.75.75 0 001.422-.474l-1.17-3.513H18a3 3 0 003-3V3.75h.75a.75.75 0 000-1.5H2.25zm7.46 4.5a.75.75 0 00-1.5 0v6a.75.75 0 001.5 0V6.75zm3 2.25a.75.75 0 00-1.5 0v3.75a.75.75 0 001.5 0V9zm3 2.25a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0V11.25z" clipRule="evenodd" /></svg>
              </div>
              <div className="absolute top-4 right-36 size-8 rounded-xl bg-pink-400/60 flex items-center justify-center rotate-3">
                <svg className="size-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M9.375 3a1.875 1.875 0 000 3.75h1.875v4.5H3.375A1.875 1.875 0 011.5 9.375v-.75c0-1.036.84-1.875 1.875-1.875h3.193A3.375 3.375 0 0112 2.753a3.375 3.375 0 015.432 3.997h3.943c1.035 0 1.875.84 1.875 1.875v.75c0 1.036-.84 1.875-1.875 1.875H12.75v-4.5h1.875a1.875 1.875 0 10-1.875-1.875V6.75h-1.5V4.875C11.25 3.839 10.41 3 9.375 3zM11.25 12.75H3v6.75a2.25 2.25 0 002.25 2.25h6v-9zM12.75 12.75v9h6.75A2.25 2.25 0 0021.75 19.5v-6.75h-9z" /></svg>
              </div>
            </div>
            <div className="relative z-10 p-7 pr-52 sm:pr-60">
              <h2 className="text-2xl font-black text-white leading-tight mb-1.5">
                {isAdmin ? `ภาพรวมทีม, ${firstName}` : `พร้อมเรียนต่อแล้วใช่ไหม?`}
              </h2>
              <p className="text-sm text-blue-100/90 mb-5 leading-relaxed">
                {isAdmin ? 'ติดตามความก้าวหน้าการฝึกอบรมของทีมคุณ' : 'ทุกก้าวที่เรียนรู้คือก้าวหนึ่งสู่เป้าหมาย'}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {firstContinueRecord && (
                  <button onClick={() => router.push(`/courses/${firstContinueRecord.courseId}`)}
                    className="px-5 py-2.5 rounded-xl bg-white text-indigo-600 text-sm font-bold hover:shadow-lg transition-all">
                    เรียนต่อหลักสูตรล่าสุด
                  </button>
                )}
                <button onClick={() => router.push('/courses')}
                  className="px-5 py-2.5 rounded-xl bg-white/15 border border-white/30 text-white text-sm font-bold hover:bg-white/25 transition-all">
                  ดูหลักสูตรทั้งหมด
                </button>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className={`grid grid-cols-2 gap-3 ${isAdmin ? 'sm:grid-cols-4' : ''}`}>
            {isAdmin ? (<>
              <MiniStat value={allUsers.filter(u => !u.employmentStatus || u.employmentStatus === 'Active').length} label="พนักงานทั้งหมด"
                iconBg="bg-blue-100"
                icon={<svg className="size-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
              />
              <MiniStat value={`${adminCompletionRate}%`} label="อัตราผ่านรวม"
                iconBg="bg-emerald-100"
                icon={<svg className="size-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
              />
              <MiniStat value={adminTotalCompletions} label="ผ่านแล้วทั้งหมด"
                iconBg="bg-freshket-100"
                icon={<svg className="size-4 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <MiniStat value={adminPublishedCourses} label="หลักสูตรที่เปิดใช้"
                iconBg="bg-amber-100"
                icon={<svg className="size-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
              />
            </>) : (<>
              <MiniStat value={completedCount} label="Courses Completed"
                iconBg="bg-blue-100"
                icon={<svg className="size-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>}
              />
              <MiniStat
                value={pendingCourseCount > 0
                  ? pendingCourseCount
                  : <span className="text-sm font-bold text-gray-400">ไม่มีหลักสูตรค้าง</span>}
                label="หลักสูตรคงค้าง"
                iconBg="bg-amber-100"
                icon={<svg className="size-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>}
              />
            </>)}
          </div>

          {/* Outstanding courses. Sale-role only — super_admin's overview has no personal course
              schedule to show. Nothing is drawn when there is nothing outstanding (the stat above says so). */}
          {!isAdmin && pendingCourses.length > 0 && (
            <div className="grid grid-cols-1 gap-4">
              <PendingCoursesCard
                courses={pendingCourses}
                recordMap={recordMap}
                onOpenCourse={(id) => router.push(`/courses/${id}`)}
                onSeeAll={() => router.push('/courses')}
              />
            </div>
          )}

          {/* New Joiner banner */}
          {isNewJoiner && (
            <div className="bg-white rounded-2xl border border-freshket-200 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="shrink-0 relative size-14">
                  <svg className="size-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#d6fdf0" strokeWidth="6" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke="#00ce7c" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 22}`}
                      strokeDashoffset={`${2 * Math.PI * 22 * (1 - njPct / 100)}`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-black text-freshket-700">{njPct}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-freshket-700 bg-freshket-100 px-2 py-0.5 rounded-full">🌱 New Joiner</span>
                    <span className="text-xs text-gray-400">วันที่ {daysSince} / {NEW_JOINER_DAYS}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">เหลืออีก {daysLeft} วันในช่วง Onboarding</p>
                  <p className="text-xs text-gray-400 mt-0.5">เช็กคู่มือ New Joiner เพื่อเรียนรู้ทีมและเครื่องมือสำคัญ</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/tools/new-joiner')}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-colors shadow-sm"
                >
                  ดูคู่มือ
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Deadline countdown banners — show for non-admin only */}
          {!isAdmin && urgentCourses.length > 0 && (
            <div className="space-y-2.5">
              {urgentCourses.slice(0, 3).map(({ course, daysLeft, endDate, pct }) => (
                <DeadlineBanner
                  key={course.id}
                  course={course}
                  daysLeft={daysLeft}
                  endDate={endDate}
                  pct={pct}
                  onGo={() => router.push(`/courses/${course.id}`)}
                />
              ))}
              {urgentCourses.length > 3 && (
                <button
                  onClick={() => router.push('/courses')}
                  className="w-full py-2 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
                >
                  และอีก {urgentCourses.length - 3} หลักสูตรที่ใกล้ถึงกำหนด — ดูทั้งหมด
                </button>
              )}
            </div>
          )}

          {/* Continue Learning */}
          {continueRecords.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-gray-900">
                  Continue Learning
                  <span className="ml-2 text-xs font-normal text-gray-400">{continueRecords.length} หลักสูตร</span>
                </h2>
              </div>
              <div className="space-y-3">
                {continueRecords.map((rec) => {
                  const course = courseMap[rec.courseId]
                  if (!course) return null
                  return (
                    <div key={rec.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] transition-all duration-150">
                      <div className={`size-16 sm:size-20 rounded-xl bg-gradient-to-br ${CAT_BG[course.category]} overflow-hidden shrink-0`}>
                        {course.thumbnailUrl && <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold mb-0.5 ${CAT_TEXT[course.category]}`}>{CATEGORY_LABELS[course.category]}</p>
                        <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Next Module: <span className="text-gray-600 font-normal">{course.title}</span>
                        </p>
                        <div className="mt-2 h-1.5 bg-gray-100 rounded-full w-full max-w-xs">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: '40%' }} />
                        </div>
                      </div>
                      <button onClick={() => router.push(`/courses/${rec.courseId}`)}
                        className="shrink-0 px-4 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition-all">
                        Resume
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Latest: what's new (Mandatory, tools, courses, news), pinned by a super_admin ── */}
          {!isAdmin && (
            <HomeHighlightsRow uid={user?.uid ?? ''} candidates={highlights.visible} pins={highlights.pins} hidden={highlights.hidden} bodies={announcementBodies} />
          )}

          {/* ── For You (sale only) / User Table (admin) ────────────────────── */}
          {isAdmin ? (
            <UserTable
              users={allUsers}
              onSelect={setSelectedUser}
              selectedUid={selectedUser?.uid}
            />
          ) : (
            listedForYou.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-900">
                    For You <span className="ml-2 text-xs font-normal text-gray-400">{listedForYou.length} หลักสูตร</span>
                  </h2>
                  <button onClick={() => router.push('/courses')} className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                    My Course
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
                {/* One row that scrolls sideways, on a phone and on a computer. */}
                <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-5 px-5 scroll-px-5">
                  {listedForYou.map((course) => (
                    <div key={course.id} className="snap-start shrink-0 w-56 sm:w-60">
                      <LearnerCourseGridCard
                        course={course}
                        record={recordByCourse[course.id]}
                        onClick={() => router.push(`/courses/${course.id}`)}
                        onDismiss={() => void dismissCourse(course.id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )
          )}
        </div>

        {/* ── RIGHT SIDEBAR — collapsed by default, handle opens it ─────────── */}
        <div className={`hidden lg:flex relative flex-col shrink-0 border-l border-gray-100 bg-white transition-all duration-200 ${sidebarOpen ? 'w-80' : 'w-12'}`}>
          {/* Toggle handle — centered vertically and protruding past the sidebar
              edge so it reads as its own control, not part of the scrollbar. */}
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarOpen ? 'ซ่อนแถบด้านข้าง' : notices.unread > 0 ? 'มีแจ้งเตือนใหม่ กดเพื่อเปิดอ่าน' : 'แสดงแถบด้านข้าง'}
            className="absolute top-1/2 -translate-y-1/2 -left-4 z-10 flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-l-xl bg-white border border-gray-200 border-r-0 shadow-md text-gray-500 hover:text-freshket-600 hover:border-freshket-300 transition-colors"
          >
            <svg className={`size-4 shrink-0 transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="text-xs font-bold whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {sidebarOpen ? 'Hide' : notices.unread > 0 ? 'มีแจ้งเตือนใหม่' : 'Open'}
            </span>
            {!sidebarOpen && notices.unread > 0 && (
              <span
                role="status"
                aria-label={`มี ${notices.unread} แจ้งเตือนใหม่`}
                className="absolute -top-1.5 -left-1.5 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold tabular-nums shadow"
              >
                <span className="absolute inset-0 rounded-full bg-rose-400 opacity-60 animate-ping" />
                <span className="relative">{notices.unread > 9 ? '9+' : notices.unread}</span>
              </span>
            )}
          </button>

          {sidebarOpen && (
            <div className="flex-1 min-w-0 overflow-y-auto p-5 pt-0 space-y-4">
              {/* Notifications */}
              <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-sm font-bold text-gray-900 mb-1">
                  แจ้งเตือน
                  {freshIds.size > 0 && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">{freshIds.size} ใหม่</span>}
                </p>
                {notices.items.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">ยังไม่มีแจ้งเตือน</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {notices.items.map((n) => {
                      const isNew = freshIds.has(n.id)
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => router.push(n.refPath)}
                            className="w-full flex items-start gap-2.5 py-2.5 text-left hover:bg-gray-50 rounded-lg transition-colors"
                          >
                            <span className={`mt-1.5 size-2 rounded-full shrink-0 ${isNew ? 'bg-rose-500' : 'bg-gray-200'}`} />
                            <span className="min-w-0">
                              <span className={`block text-xs leading-snug ${isNew ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{n.title}</span>
                              {n.body && <span className="block text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</span>}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── User Profile Overlay (admin) ─────────────────────────────────── */}
      {isAdmin && selectedUser && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setSelectedUser(null)}
        >
          <UserSidePanel
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
          />
        </div>
      )}
    </div>
  )
}

// ── Pending courses (left of the calendar) ────────────────────────────────────
// Fills the slot that used to go blank whenever the learner had courses assigned
// but none outstanding. It is only drawn when there is work left to do.
function PendingCoursesCard({
  courses,
  recordMap,
  onOpenCourse,
  onSeeAll,
}: {
  courses: Course[]
  recordMap: Record<string, { status: string; score?: number }>
  onOpenCourse: (courseId: string) => void
  onSeeAll: () => void
}) {
  const VISIBLE = 4
  const shown = courses.slice(0, VISIBLE)
  const hidden = courses.length - shown.length

  function daysLeft(c: Course): number | null {
    if (!c.endDate) return null
    const end = c.endDate instanceof Date ? c.endDate : new Date(c.endDate as unknown as string)
    if (isNaN(end.getTime())) return null
    return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  }

  return (
    <div className="card-ds p-5 h-full">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-bold text-gray-900">หลักสูตรคงค้าง</h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 tabular-nums">
            {courses.length}
          </span>
        </div>
        <button onClick={onSeeAll} className="text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors shrink-0">
          ดูทั้งหมด →
        </button>
      </div>

      <div className="space-y-2">
        {shown.map((c) => {
          const started = recordMap[c.id]?.status === 'in_progress'
          const left = daysLeft(c)
          const overdue = left != null && left < 0
          const urgent = left != null && left >= 0 && left <= 7
          return (
            <button
              key={c.id}
              onClick={() => onOpenCourse(c.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white text-left hover:border-freshket-200 hover:shadow-sm transition-all duration-150 group"
            >
              <span className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                started ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {started ? (
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                  </svg>
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                )}
              </span>

              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-gray-800 truncate group-hover:text-freshket-700 transition-colors">
                  {c.title}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    started ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {started ? 'กำลังเรียน' : 'ยังไม่เริ่ม'}
                  </span>
                  {overdue && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                      เกินกำหนด
                    </span>
                  )}
                  {urgent && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      เหลือ {left} วัน
                    </span>
                  )}
                  {c.durationMinutes > 0 && (
                    <span className="text-xs text-gray-400">{c.durationMinutes} นาที</span>
                  )}
                </span>
              </span>

              <svg className="size-4 text-gray-300 group-hover:text-freshket-500 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )
        })}
      </div>

      {hidden > 0 && (
        <button onClick={onSeeAll} className="mt-3 w-full text-xs font-bold text-gray-400 hover:text-freshket-600 transition-colors">
          และอีก {hidden} หลักสูตร
        </button>
      )}
    </div>
  )
}

// ── MiniStat ──────────────────────────────────────────────────────────────────
function MiniStat({
  icon, label, value, iconBg = 'bg-gray-50',
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  iconBg?: string
}) {
  // DS 2026: white card + rgba border, no shadow at rest, lift + shadow on hover.
  // The colour lives in the SVG icon (on a soft tinted pill), not the card bg.
  return (
    <div
      className="bg-white rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] transition-all duration-150 cursor-default"
      style={{ border: 'var(--card-border)' }}
    >
      <div className={`size-8 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-xs font-normal text-gray-500 mb-0.5">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  )
}

// ── DeadlineBanner ────────────────────────────────────────────────────────────
function DeadlineBanner({
  course, daysLeft, endDate, pct, onGo,
}: {
  course: import('@/types/course').Course
  daysLeft: number
  endDate: Date
  pct: number | null
  onGo: () => void
}) {
  const isToday  = daysLeft <= 1
  const isUrgent = daysLeft <= 3

  const palette = isToday
    ? { border: 'border-rose-200',   bg: 'bg-rose-50',   ring: '#fecdd3', fill: '#f43f5e', text: 'text-rose-600',   btn: 'bg-rose-500 hover:bg-rose-600',   badge: 'bg-rose-100 text-rose-600'   }
    : isUrgent
    ? { border: 'border-amber-200',  bg: 'bg-amber-50',  ring: '#fde68a', fill: '#f59e0b', text: 'text-amber-600',  btn: 'bg-amber-500 hover:bg-amber-600',  badge: 'bg-amber-100 text-amber-700'  }
    : { border: 'border-yellow-200', bg: 'bg-yellow-50', ring: '#fef08a', fill: '#eab308', text: 'text-yellow-700', btn: 'bg-yellow-500 hover:bg-yellow-600', badge: 'bg-yellow-100 text-yellow-700' }

  const label = isToday ? 'วันนี้วันสุดท้าย' : isUrgent ? 'ใกล้ถึงกำหนด' : 'ใกล้ถึงกำหนด'
  const dateStr = endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

  const R = 22
  const circumference = 2 * Math.PI * R
  const ringPct = pct ?? (isToday ? 95 : isUrgent ? 70 : 40)
  const dashOffset = circumference * (1 - ringPct / 100)

  return (
    <div className={`${palette.bg} rounded-2xl border ${palette.border} overflow-hidden`}>
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Ring countdown */}
        <div className="shrink-0 relative size-14">
          <svg className="size-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r={R} fill="none" stroke={palette.ring} strokeWidth="6" />
            <circle cx="28" cy="28" r={R} fill="none" stroke={palette.fill} strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className={`text-base font-black ${palette.text}`}>{daysLeft}</span>
            <span className={`text-xs font-bold ${palette.text}`}>วัน</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${palette.badge}`}>
              {label}
            </span>
            <span className="text-xs text-gray-400">{CATEGORY_LABELS[course.category]}</span>
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{course.title}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            กำหนดส่ง {dateStr}
            {course.isRequired && (
              <span className="ml-1 text-xs font-bold text-rose-500">• บังคับ</span>
            )}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={onGo}
          className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl ${palette.btn} text-white text-xs font-bold transition-colors shadow-sm`}
        >
          เรียนเลย
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Time progress bar */}
      <div className="h-1 bg-white/60">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${ringPct}%`, background: palette.fill }}
        />
      </div>
    </div>
  )
}



