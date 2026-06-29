'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useMyTrainingRecords, useCourses, useAllTrainingRecords, useAllUsers, useShadowRecordsByUser, useRoleplayAssessmentsByUser } from '@/hooks/useFirestore'
import { CATEGORY_LABELS, type CourseCategory } from '@/types/course'
import { STATUS_LABELS, type TrainingRecord, type TrainingStatus } from '@/types/tracking'
import { ROLE_LABELS, canAccess, type UserProfile } from '@/types/user'
import { formatDateEN } from '@/lib/utils/dateFormatter'
import { getDaysSince, NEW_JOINER_DAYS } from '@/lib/utils/newJoiner'
import { RADAR_GROUPS, type RoleplayAssessment } from '@/types/roleplay'
import type { ShadowRecord } from '@/types/shadow'

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

// ── Training Status Half Donut ────────────────────────────────────────────────
function HalfDonutChart({ records }: { records: TrainingRecord[] }) {
  const total = records.length

  const counts = useMemo(() => ({
    completed:   records.filter(r => r.status === 'completed').length,
    in_progress: records.filter(r => r.status === 'in_progress').length,
    failed:      records.filter(r => r.status === 'failed').length,
    not_started: records.filter(r => r.status === 'not_started').length,
  }), [records])

  const segments = [
    { key: 'completed',   label: 'Pass',        count: counts.completed,   color: '#00ce7c' },
    { key: 'in_progress', label: 'In Progress', count: counts.in_progress, color: '#60a5fa' },
    { key: 'failed',      label: 'Failed',      count: counts.failed,      color: '#f87171' },
    { key: 'overdue',     label: 'Overdue',     count: 0,                  color: '#fb923c' },
    { key: 'not_started', label: 'Not Started', count: counts.not_started, color: '#d1d5db' },
  ]

  const R = 68
  const cx = 100, cy = 90
  const sw = 20
  const half = Math.PI * R

  let cumulative = 0
  const arcs = segments.map(seg => {
    const len = total > 0 ? (seg.count / total) * half : 0
    const off = cumulative
    cumulative += len
    return { ...seg, len, off }
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Training Status</h3>
        <span className="text-xs text-gray-400">{total} หลักสูตร</span>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div className="relative flex justify-center mb-1">
          <svg width="200" height="105" viewBox="0 0 200 105">
            <path
              d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
              fill="none" stroke="#f3f4f6" strokeWidth={sw} strokeLinecap="round"
            />
            {total === 0 ? null : arcs.map(arc => arc.len > 0 && (
              <path
                key={arc.key}
                d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
                fill="none"
                stroke={arc.color}
                strokeWidth={sw}
                strokeLinecap="butt"
                strokeDasharray={`${arc.len} ${half}`}
                strokeDashoffset={-arc.off}
              />
            ))}
          </svg>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center leading-tight">
            <p className="text-xl font-bold text-gray-900">{counts.completed}</p>
            <p className="text-xs text-gray-400">Pass</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
          {segments.map(seg => (
            <div key={seg.key} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full shrink-0" style={{ background: seg.color }} />
              <span className="text-xs text-gray-500 flex-1 truncate">{seg.label}</span>
              <span className="text-xs font-bold text-gray-800 tabular-nums">{seg.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SaleDashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: courses } = useCourses()
  const { data: allRecords } = useAllTrainingRecords()
  const { data: allUsers } = useAllUsers()

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)

  const isAdmin = user?.role ? canAccess(user.role, 'team_lead') : false
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
  const streakDays = Math.min(myRecords.length * 2, 14)

  // Admin-specific stats
  const adminTotalCompletions = useMemo(() => allRecords.filter(r => r.status === 'completed').length, [allRecords])
  const adminCompletionRate = useMemo(() => {
    if (!allRecords.length) return 0
    return Math.round((adminTotalCompletions / allRecords.length) * 100)
  }, [allRecords, adminTotalCompletions])
  const adminPublishedCourses = useMemo(() => courses.filter(c => c.isPublished).length, [courses])
  const continueRecords = useMemo(() => myRecords.filter((r) => r.status === 'in_progress'), [myRecords])
  const firstContinueRecord = continueRecords[0] ?? null
  const recordMap = useMemo(() => {
    const m: Record<string, { status: string; score?: number }> = {}
    myRecords.forEach((r) => { m[r.courseId] = { status: r.status, score: r.score } })
    return m
  }, [myRecords])
  const forYouCourses = useMemo(
    () => courses.filter((c) => c.isPublished && c.targetRoles.includes(user?.role ?? 'sale')),
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
        const isTargeted = c.targetRoles.includes(user.role) || (c.assignedUserIds?.includes(user.uid) ?? false)
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

  const pendingCourseCount = useMemo(
    () => forYouCourses.filter((c) => !recordMap[c.id] || recordMap[c.id].status !== 'completed').length,
    [forYouCourses, recordMap],
  )
  const avgScore = useMemo(() => {
    const scored = completedRecords.filter((r) => (r.score ?? 0) > 0)
    if (!scored.length) return 0
    return scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length
  }, [completedRecords])

  const leaderboard = useMemo(() => {
    const pts: Record<string, number> = {}
    allRecords.forEach((r) => { if (r.status === 'completed' && r.score) pts[r.userId] = (pts[r.userId] ?? 0) + r.score })
    return allUsers
      .map((u) => ({ user: u, points: pts[u.uid] ?? 0 }))
      .filter((e) => e.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 5)
  }, [allRecords, allUsers])
  const myPoints = useMemo(() => leaderboard.find((e) => e.user.uid === user?.uid)?.points ?? 0, [leaderboard, user])

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-auto">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 min-h-0">

        {/* ── LEFT / MAIN ────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 overflow-y-auto p-5 space-y-5">

          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #00804c 0%, #00a862 55%, #00ce7c 100%)' }}>
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

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {isAdmin ? (<>
              <MiniStat value={allUsers.length} label="พนักงานทั้งหมด"
                bg="bg-blue-50" iconBg="bg-blue-100"
                icon={<svg className="size-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
              />
              <MiniStat value={`${adminCompletionRate}%`} label="อัตราผ่านรวม"
                bg="bg-emerald-50" iconBg="bg-emerald-100"
                icon={<svg className="size-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
              />
              <MiniStat value={adminTotalCompletions} label="ผ่านแล้วทั้งหมด"
                bg="bg-freshket-100" iconBg="bg-freshket-200"
                icon={<svg className="size-4 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <MiniStat value={adminPublishedCourses} label="หลักสูตรที่เปิดใช้"
                bg="bg-amber-50" iconBg="bg-amber-100"
                icon={<svg className="size-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
              />
            </>) : (<>
              <MiniStat value={completedCount} label="Courses Completed"
                bg="bg-white border border-gray-100" iconBg="bg-blue-100"
                icon={<svg className="size-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>}
              />
              <MiniStat value={completedCount} label="Certificates Earned"
                bg="bg-white border border-gray-100" iconBg="bg-amber-100"
                icon={<svg className="size-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 000 4.5h9a2.25 2.25 0 000-4.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.798 49.798 0 00-6.093-.377.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" clipRule="evenodd" /></svg>}
              />
              <MiniStat value={pendingCourseCount} label="หลักสูตรคงค้าง"
                bg="bg-white border border-gray-100" iconBg="bg-amber-100"
                icon={<svg className="size-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>}
              />
              <MiniStat value={avgScore > 0 ? avgScore.toFixed(1) : '-'} label="คะแนนเฉลี่ยทั้งหมด"
                bg="bg-white border border-gray-100" iconBg="bg-freshket-100"
                icon={<svg className="size-4 text-freshket-600" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" /></svg>}
              />
            </>)}
          </div>

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
                          Next Module: <span className="text-gray-600 font-normal">{course.hasPreAssessment ? 'Pre-Assessment' : course.title}</span>
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

          {/* ── For You (sale only) / User Table (admin) ────────────────────── */}
          {isAdmin ? (
            <UserTable
              users={allUsers}
              allRecords={allRecords}
              onSelect={setSelectedUser}
              selectedUid={selectedUser?.uid}
            />
          ) : (
            forYouCourses.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-900">
                    For You <span className="ml-2 text-xs font-normal text-gray-400">{forYouCourses.length} หลักสูตร</span>
                  </h2>
                  <button onClick={() => router.push('/courses')} className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                    My Course
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {forYouCourses.map((course) => {
                    const steps = [course.hasPreAssessment, !!(course as typeof course & { slideUrl?: string }).slideUrl, course.hasPostAssessment].filter(Boolean).length || 1
                    const rec = recordMap[course.id]
                    const statusLabel = rec?.status === 'completed' ? 'ผ่านแล้ว' : rec?.status === 'in_progress' ? 'กำลังเรียน' : 'ยังไม่เริ่ม'
                    const statusCls = rec?.status === 'completed' ? 'bg-freshket-100 text-freshket-700' : rec?.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    return (
                      <button key={course.id} onClick={() => router.push(`/courses/${course.id}`)}
                        className="text-left bg-white rounded-2xl border border-gray-100 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 overflow-hidden group">
                        <div className={`h-36 w-full bg-gradient-to-br ${CAT_BG[course.category]} overflow-hidden relative`}>
                          {course.thumbnailUrl && <img src={course.thumbnailUrl} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                          <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
                          {course.isRequired && <span className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">บังคับ</span>}
                        </div>
                        <div className="p-3.5">
                          <p className={`text-xs font-bold mb-1 ${CAT_TEXT[course.category]}`}>{CATEGORY_LABELS[course.category]}</p>
                          <p className="text-sm font-bold text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-snug mb-2">{course.title}</p>
                          <p className="text-xs text-gray-400 mb-3">{steps} Lessons</p>
                          <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100">
                            <div className="size-6 rounded-full bg-freshket-100 flex items-center justify-center overflow-hidden">
                              <img src="https://ivpysunrulnrdykfaezk.supabase.co/storage/v1/object/public/logo-freshket/FRESHKET%20LOGO-01.png" alt="Freshket" className="size-5 object-contain" />
                            </div>
                            <span className="text-xs text-gray-500">Freshket Academy</span>
                            {rec?.score != null && <span className="ml-auto text-xs font-bold text-freshket-600">{rec.score} คะแนน</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          )}
        </div>

        {/* ── RIGHT SIDEBAR ────────────────────────────────────────────────── */}
        <div className="hidden lg:flex lg:col-span-1 flex-col gap-4 p-5 overflow-y-auto border-l border-gray-100 bg-white">
          {/* Streak card */}
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%)' }}>
            <p className="text-sm font-bold text-indigo-900">You&apos;re on fire, {firstName}! 🔥</p>
            <p className="text-xs text-indigo-600/80 mt-1 leading-relaxed">เรียนมาแล้ว {streakDays} วันติดต่อกัน<br />Keep the momentum going!</p>
            <button onClick={() => router.push('/courses')}
              className="mt-3 w-full py-2 rounded-xl bg-white text-indigo-600 text-xs font-bold hover:bg-indigo-50 transition-all border border-indigo-100 shadow-sm">
              Start Learning
            </button>
          </div>

          {/* Training Status Donut */}
          <HalfDonutChart records={myRecords} />

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 flex-1 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">Leaderboard</h3>
              <button className="text-xs font-bold text-indigo-500">See All</button>
            </div>
            <div className="px-3 py-2 space-y-0.5">
              {leaderboard.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">ยังไม่มีข้อมูลคะแนน</p>
              ) : leaderboard.map((entry, i) => {
                const isMe = entry.user.uid === user?.uid
                const initials = entry.user.displayName?.charAt(0).toUpperCase() ?? '?'
                return (
                  <div key={entry.user.uid} className={`flex items-center gap-2.5 px-2 py-2.5 rounded-xl ${isMe ? 'bg-indigo-50' : 'hover:bg-gray-50'} transition-colors`}>
                    {entry.user.photoURL ? (
                      <img src={entry.user.photoURL} alt="" className="size-9 rounded-full object-cover border-2 border-white shadow-sm shrink-0" />
                    ) : (
                      <div className={`size-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isMe ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isMe ? 'text-indigo-700' : 'text-gray-800'}`}>{entry.user.displayName ?? entry.user.email?.split('@')[0]}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs">🔥</span>
                        <span className="text-xs text-gray-400">{Math.max(1, 15 - i * 3)} days</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <svg className="size-3.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                      <span className={`text-xs font-bold ${isMe ? 'text-indigo-600' : 'text-gray-700'}`}>{entry.points.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
              {myPoints === 0 && (
                <div className="mt-2 mx-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-dashed border-gray-200">
                  <p className="text-xs text-gray-400 text-center">ทำแบบทดสอบให้ผ่านเพื่อขึ้น Leaderboard!</p>
                </div>
              )}
            </div>
          </div>
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
            allRecords={allRecords}
            onClose={() => setSelectedUser(null)}
          />
        </div>
      )}
    </div>
  )
}

// ── MiniStat ──────────────────────────────────────────────────────────────────
function MiniStat({
  icon, label, value, bg = 'bg-white border border-gray-100', iconBg = 'bg-gray-50',
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  bg?: string
  iconBg?: string
}) {
  return (
    <div className={`${bg} rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] transition-all duration-150 cursor-default`}>
      <div className={`size-8 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-xs font-normal text-gray-500 mb-0.5">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  )
}

// ── Tenure helper ─────────────────────────────────────────────────────────────
function calcTenure(startDate: Date | undefined | null): string {
  if (!startDate) return '—'
  const start = startDate instanceof Date ? startDate : new Date(startDate as unknown as string)
  if (isNaN(start.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days = now.getDate() - start.getDate()
  if (days < 0) {
    months--
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  return `${years}.${String(months).padStart(2, '0')}.${String(days).padStart(2, '0')}`
}

// ── User Table ────────────────────────────────────────────────────────────────
function UserTable({
  users,
  allRecords,
  onSelect,
  selectedUid,
}: {
  users: UserProfile[]
  allRecords: TrainingRecord[]
  onSelect: (u: UserProfile) => void
  selectedUid?: string
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      (u.employeeId ?? '').toLowerCase().includes(q),
    )
  }, [users, search])

  // Build summary per user: completed count
  const summaryMap = useMemo(() => {
    const m: Record<string, { completed: number; total: number }> = {}
    allRecords.forEach((r) => {
      if (!m[r.userId]) m[r.userId] = { completed: 0, total: 0 }
      m[r.userId].total++
      if (r.status === 'completed') m[r.userId].completed++
    })
    return m
  }, [allRecords])

  const ROLE_BADGE: Record<string, string> = {
    sale: 'bg-gray-100 text-gray-600',
    team_lead: 'bg-blue-100 text-blue-700',
    manager: 'bg-purple-100 text-purple-700',
    super_admin: 'bg-freshket-100 text-freshket-700',
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900">
          รายชื่อพนักงาน
          <span className="ml-2 text-xs font-normal text-gray-400">{users.length} คน</span>
        </h2>
        {/* Search */}
        <div className="relative w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสพนักงาน..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <div className="min-w-[1100px]">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-white border-b border-gray-100 text-xs font-bold text-gray-500">
            <div className="col-span-1">#</div>
            <div className="col-span-1">รหัส</div>
            <div className="col-span-2">ชื่อ</div>
            <div className="col-span-2">แผนก</div>
            <div className="col-span-1">ตำแหน่ง</div>
            <div className="col-span-2">วันที่เริ่มทำงาน</div>
            <div className="col-span-1">อายุงาน</div>
            <div className="col-span-2">Email</div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <p className="text-sm">ไม่พบพนักงาน</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {filtered.map((u, i) => {
                const isSelected = u.uid === selectedUid
                return (
                  <button
                    key={u.uid}
                    onClick={() => onSelect(u)}
                    className={`w-full grid grid-cols-12 gap-2 px-4 py-3 text-left transition-colors hover:bg-indigo-50/60 ${isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                  >
                    {/* # */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-400 tabular-nums">{i + 1}</span>
                    </div>
                    {/* Employee ID */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-500 font-mono truncate">{u.employeeId ?? '—'}</span>
                    </div>
                    {/* Name */}
                    <div className="col-span-2 flex items-center min-w-0">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{u.displayName ?? u.email}</p>
                        {u.nickname && <p className="text-xs text-gray-400 truncate leading-tight">{u.nickname}</p>}
                      </div>
                    </div>
                    {/* Department */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-gray-600 truncate">{u.department ?? '—'}</span>
                    </div>
                    {/* Position */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-500 truncate">{u.position ?? '—'}</span>
                    </div>
                    {/* Start Date */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-gray-500 whitespace-nowrap">{u.startDate ? formatDateEN(u.startDate) : '—'}</span>
                    </div>
                    {/* Tenure */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-500 font-mono tabular-nums whitespace-nowrap">{calcTenure(u.startDate as Date | undefined)}</span>
                    </div>
                    {/* Email */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-gray-400 truncate">{u.email ?? '—'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── User Profile Overlay Card ─────────────────────────────────────────────────
type ProfileTab = 'info' | 'training' | 'shadow' | 'roleplay'

function UserSidePanel({
  user,
  allRecords,
  onClose,
}: {
  user: UserProfile
  allRecords: TrainingRecord[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('info')
  const [selectedShadow, setSelectedShadow] = useState<ShadowRecord | null>(null)
  const { data: shadowRecords } = useShadowRecordsByUser(user.uid)
  const { data: roleplayAssessments } = useRoleplayAssessmentsByUser(user.uid)

  const userRecords = useMemo(
    () => allRecords.filter((r) => r.userId === user.uid).sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt as unknown as string).getTime() : 0
      const tb = b.completedAt ? new Date(b.completedAt as unknown as string).getTime() : 0
      return tb - ta
    }),
    [allRecords, user.uid],
  )

  const completedCount = userRecords.filter((r) => r.status === 'completed').length
  const inProgressCount = userRecords.filter((r) => r.status === 'in_progress').length
  const avgScore = useMemo(() => {
    const scored = userRecords.filter((r) => r.score != null && r.status === 'completed')
    return scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : null
  }, [userRecords])

  const ROLE_BADGE: Record<string, string> = {
    sale:        'bg-freshket-100 text-freshket-700',
    team_lead:   'bg-blue-100 text-blue-700',
    manager:     'bg-purple-100 text-purple-700',
    super_admin: 'bg-orange-100 text-orange-700',
  }

  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: 'info',     label: 'Information' },
    { key: 'training', label: 'Training',   count: userRecords.length },
    { key: 'shadow',   label: 'Shadow',     count: shadowRecords.length },
    { key: 'roleplay', label: 'Role Play',  count: roleplayAssessments.length },
  ]

  return (
    <div
      className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full sm:w-[65vw] max-w-[960px]"
      style={{ height: '85vh', animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
      onClick={e => e.stopPropagation()}
    >
      <style>{`@keyframes popIn { from { transform: scale(0.93); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="size-11 rounded-full object-cover border-2 border-freshket-200 shadow-sm shrink-0" />
        ) : (
          <div className="size-11 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-base font-black text-freshket-700 shrink-0">
            {user.displayName?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 truncate">{user.displayName ?? user.email}</p>
            {user.nickname && <span className="text-xs text-gray-400">{user.nickname}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {user.employeeId && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{user.employeeId}</span>
            )}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="text-center px-3 py-2 bg-freshket-50 rounded-xl min-w-[52px]">
            <p className="text-base font-black text-freshket-600 leading-none">{completedCount}</p>
            <p className="text-xs text-freshket-700 mt-0.5">Passed</p>
          </div>
          <div className="text-center px-3 py-2 bg-blue-50 rounded-xl min-w-[52px]">
            <p className="text-base font-black text-blue-600 leading-none">{shadowRecords.length}</p>
            <p className="text-xs text-blue-700 mt-0.5">Shadow</p>
          </div>
          <div className="text-center px-3 py-2 bg-purple-50 rounded-xl min-w-[52px]">
            <p className="text-base font-black text-purple-600 leading-none">{roleplayAssessments.length}</p>
            <p className="text-xs text-purple-700 mt-0.5">RolePlay</p>
          </div>
        </div>
        <button onClick={onClose} className="shrink-0 p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 shrink-0 px-6 gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full leading-none font-bold ${
                tab === t.key ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Tab: Information */}
        {tab === 'info' && (
          <div className="p-6 space-y-6">
            {/* Contact */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Contact</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Email" value={user.email} />
                <ProfileField label="Employee ID" value={user.employeeId ?? '—'} />
                <ProfileField label="Nickname" value={user.nickname ?? '—'} />
              </div>
            </section>
            {/* Role & Department */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Role & Department</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Role" value={ROLE_LABELS[user.role]} />
                <ProfileField label="Department" value={user.department ?? '—'} />
                <ProfileField label="Position" value={user.position ?? '—'} />
                <ProfileField label="Line Manager" value={(user as UserProfile & { lineManager?: string }).lineManager ?? '—'} />
              </div>
            </section>
            {/* Employment */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Employment</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Start Date" value={user.startDate ? new Date(user.startDate as unknown as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <ProfileField label="Tenure" value={calcTenure(user.startDate as Date | undefined)} />
              </div>
            </section>
          </div>
        )}

        {/* Tab: Training Record */}
        {tab === 'training' && (
          <div className="p-6 space-y-3">
            {userRecords.length === 0 ? (
              <EmptyState label="ยังไม่มีประวัติการอบรม" />
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-500">
                  <div className="col-span-5">หลักสูตร</div>
                  <div className="col-span-2 text-center">สถานะ</div>
                  <div className="col-span-2 text-center">คะแนน</div>
                  <div className="col-span-3 text-right">วันที่อบรม</div>
                </div>
                {userRecords.map(rec => {
                  const dateStr = rec.completedAt
                    ? new Date(rec.completedAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                    : rec.startedAt
                    ? new Date(rec.startedAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                    : '—'
                  const scoreColor = rec.score != null
                    ? rec.score >= 80 ? 'text-freshket-600' : rec.score >= 60 ? 'text-amber-600' : 'text-rose-600'
                    : 'text-gray-400'
                  return (
                    <div key={rec.id} className="grid grid-cols-12 gap-2 px-3 py-3 bg-white border border-gray-100 rounded-xl items-center hover:bg-gray-50 transition-colors">
                      <div className="col-span-5 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate leading-snug">{rec.courseTitle}</p>
                        <p className="text-xs text-gray-400 mt-0.5">ครั้งที่ {rec.attemptCount}</p>
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[rec.status]}`}>
                          {STATUS_LABELS[rec.status]}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-sm font-black ${scoreColor}`}>
                          {rec.score != null ? rec.score : '—'}
                        </span>
                        {rec.passScore != null && (
                          <span className="text-xs text-gray-400 block leading-none">/{rec.passScore}</span>
                        )}
                      </div>
                      <div className="col-span-3 text-right">
                        <span className="text-xs text-gray-500 whitespace-nowrap">{dateStr}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Shadow Visit */}
        {tab === 'shadow' && !selectedShadow && (
          <div className="p-6 space-y-2.5">
            {shadowRecords.length === 0 ? (
              <EmptyState label="ยังไม่มีบันทึก Shadow Visit" />
            ) : (
              shadowRecords.map(rec => (
                <ShadowCard key={rec.id} record={rec} onClick={() => setSelectedShadow(rec)} />
              ))
            )}
          </div>
        )}

        {/* Shadow Detail — push navigation within the card */}
        {tab === 'shadow' && selectedShadow && (
          <ShadowDetailPanel record={selectedShadow} onBack={() => setSelectedShadow(null)} />
        )}

        {/* Tab: Role Play */}
        {tab === 'roleplay' && (
          <RolePlayTab assessments={roleplayAssessments} />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 w-28">{label}</span>
      <span className="text-xs font-bold text-gray-800 text-right break-all flex-1">{value}</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg className="size-10 text-gray-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  )
}

const SEGMENT_STYLE: Record<string, string> = {
  'Mini Chain':  'bg-blue-100 text-blue-700',
  'Stand alone': 'bg-amber-100 text-amber-700',
  'Chain':       'bg-purple-100 text-purple-700',
}
const PERSONA_STYLE: Record<string, string> = {
  'Chef':       'bg-freshket-100 text-freshket-700',
  'Owner':      'bg-sky-100 text-sky-700',
  'Purchasing': 'bg-indigo-100 text-indigo-700',
  'Manager':    'bg-orange-100 text-orange-700',
}

function ShadowCard({ record, onClick }: { record: ShadowRecord; onClick?: () => void }) {
  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-freshket-200 hover:bg-freshket-50/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-freshket-100 transition-colors">
          <svg className="size-4 text-slate-500 group-hover:text-freshket-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">{record.storeName}</p>
            <span className="text-xs text-gray-400 shrink-0">{dateStr}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
            <span className="text-xs text-gray-400">Mentor: <span className="font-bold text-gray-600">{record.mentorName}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {record.ratingScore != null && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{record.ratingScore}/5</span>
          )}
          <svg className="size-4 text-gray-300 group-hover:text-freshket-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </button>
  )
}

// ── ShadowDetailPanel ─────────────────────────────────────────────────────────

const EVAL_DETAIL_FIELDS: { key: keyof ShadowRecord; label: string; color: string }[] = [
  { key: 'opening',            label: 'Opening / Hook',       color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'interestPoint',      label: 'Interest Point',       color: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'customerPain',       label: 'Customer Pain',        color: 'bg-rose-100 text-rose-700 border border-rose-200' },
  { key: 'diagnosticApproach', label: 'Diagnostic Approach',  color: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { key: 'closingNextStep',    label: 'Closing / Next Step',  color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  { key: 'bestPractice',       label: 'Best Practice',        color: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
  { key: 'beyondClassroom',    label: 'Beyond Classroom',     color: 'bg-teal-100 text-teal-700 border border-teal-200' },
]

function ShadowDetailPanel({ record, onBack }: { record: ShadowRecord; onBack: () => void }) {
  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50/60 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-freshket-600 transition-colors"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Shadow Visit
        </button>
        <span className="text-gray-300">/</span>
        <p className="text-xs font-bold text-gray-700 flex-1 truncate">{record.storeName}</p>
        <span className="text-xs text-gray-400 shrink-0">{dateStr}</span>
      </div>

      {/* Scrollable detail content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
          <span className="text-xs text-gray-500 ml-1">
            Mentor: <span className="font-bold text-gray-700">{record.mentorName}</span>
            {record.mentorPosition && <span className="text-gray-400"> · {record.mentorPosition}</span>}
          </span>
          {record.ratingScore != null && (
            <div className="flex items-center gap-1 ml-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <svg key={i} className={`size-3.5 ${i < record.ratingScore! ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                </svg>
              ))}
              <span className="text-xs font-bold text-amber-600 ml-1">{record.ratingScore}/5</span>
            </div>
          )}
        </div>

        {/* Evaluator feedback (if any) */}
        {record.evaluationFeedback && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-xs font-bold text-blue-600 mb-1.5">Evaluator Feedback</p>
            <p className="text-sm text-gray-700 leading-relaxed">{record.evaluationFeedback}</p>
          </div>
        )}

        {/* 7 evaluation fields */}
        {EVAL_DETAIL_FIELDS.map(f => {
          const val = record[f.key] as string | undefined
          if (!val) return null
          return (
            <div key={f.key} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${f.color}`}>{f.label}</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                {val.split('\n').map((line, i) => (
                  <p key={i} className="text-sm text-gray-700 leading-relaxed">{line || ' '}</p>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── RolePlayTab ───────────────────────────────────────────────────────────────

function avgTopicsForGroups(assessments: RoleplayAssessment[]): number[] {
  return RADAR_GROUPS.map(g => {
    let sum = 0, cnt = 0
    assessments.forEach(a => {
      g.keys.forEach(k => {
        const t = a.topics.find(t => t.key === k)
        if (t) { sum += t.rating; cnt++ }
      })
    })
    return cnt > 0 ? sum / cnt : 0
  })
}

function RolePlayTab({ assessments }: { assessments: RoleplayAssessment[] }) {
  const [viewMode, setViewMode] = useState<'overall' | 'pre' | 'post'>('overall')
  const [selectedRound, setSelectedRound] = useState<number>(1)

  const preRounds  = useMemo(() => Array.from(new Set(assessments.filter(a => a.type === 'pre').map(a => a.round))).sort((a,b)=>a-b), [assessments])
  const postRounds = useMemo(() => Array.from(new Set(assessments.filter(a => a.type === 'post').map(a => a.round))).sort((a,b)=>a-b), [assessments])

  const chartAssessments = useMemo(() => {
    if (viewMode === 'overall') return assessments
    const filtered = assessments.filter(a => a.type === viewMode && a.round === selectedRound)
    return filtered
  }, [assessments, viewMode, selectedRound])

  if (assessments.length === 0) return <EmptyState label="ยังไม่มีผล Role Play" />

  const overallScores  = avgTopicsForGroups(assessments)
  const preAvgScores   = avgTopicsForGroups(assessments.filter(a => a.type === 'pre'))
  const postAvgScores  = avgTopicsForGroups(assessments.filter(a => a.type === 'post'))

  const radarSets: { scores: number[]; color: string; label: string }[] = viewMode === 'overall'
    ? [
        ...(preAvgScores.some(s => s > 0)  ? [{ scores: preAvgScores,  color: '#3b82f6', label: 'Pre avg'  }] : []),
        ...(postAvgScores.some(s => s > 0) ? [{ scores: postAvgScores, color: '#00ce7c', label: 'Post avg' }] : []),
      ]
    : [{ scores: avgTopicsForGroups(chartAssessments), color: viewMode === 'pre' ? '#3b82f6' : '#00ce7c', label: viewMode === 'pre' ? `Pre รอบ ${selectedRound}` : `Post รอบ ${selectedRound}` }]

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['overall', 'pre', 'post'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setViewMode(m); if (m === 'pre' && preRounds.length) setSelectedRound(preRounds[0]); if (m === 'post' && postRounds.length) setSelectedRound(postRounds[0]) }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              viewMode === m
                ? m === 'overall' ? 'bg-gray-800 text-white' : m === 'pre' ? 'bg-blue-500 text-white' : 'bg-freshket-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {m === 'overall' ? 'ภาพรวม' : m === 'pre' ? `Pre (${preRounds.length} รอบ)` : `Post (${postRounds.length} รอบ)`}
          </button>
        ))}
        {viewMode !== 'overall' && (
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(Number(e.target.value))}
            className="ml-2 text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-freshket-300"
          >
            {(viewMode === 'pre' ? preRounds : postRounds).map(r => (
              <option key={r} value={r}>รอบที่ {r}</option>
            ))}
          </select>
        )}
      </div>

      {/* Radar chart */}
      <div className="bg-gray-50 rounded-2xl p-2">
        <ProfileRadarChart radarSets={radarSets} />
      </div>

      {/* Group scores breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {RADAR_GROUPS.map((g, i) => {
          const score = viewMode === 'overall'
            ? overallScores[i]
            : avgTopicsForGroups(chartAssessments)[i]
          const pct = (score / 10) * 100
          const barColor = score >= 7 ? '#00ce7c' : score >= 5 ? '#f59e0b' : '#f87171'
          return (
            <div key={g.label} className="bg-white rounded-xl p-3 border border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600 font-bold truncate">{g.shortLabel}</span>
                <span className="text-xs font-black" style={{ color: barColor }}>{score > 0 ? score.toFixed(1) : '—'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Assessor notes */}
      {chartAssessments.map(a => a.overallNote && (
        <div key={a.id} className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-600 mb-1">{a.assessorName} · {a.type === 'pre' ? 'Pre' : 'Post'} รอบ {a.round}</p>
          <p className="text-xs text-gray-700 leading-relaxed">{a.overallNote}</p>
        </div>
      ))}
    </div>
  )
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────
const AXIS_COLORS = ['#2563eb','#7c3aed','#0891b2','#0d9488','#16a34a','#d97706','#dc2626','#9333ea']

function ProfileRadarChart({ radarSets }: { radarSets: { scores: number[]; color: string; label: string }[] }) {
  const cx = 200, cy = 190, maxR = 85, n = RADAR_GROUPS.length
  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) })
  const poly = (scores: number[]) =>
    scores.map((s, i) => pt(i, (s / 10) * maxR)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'
  const gridPcts = [0.2, 0.4, 0.6, 0.8, 1.0]
  const gridPolys = gridPcts.map(pct =>
    RADAR_GROUPS.map((_, i) => pt(i, maxR * pct)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'
  )
  return (
    <svg viewBox="30 40 340 300" className="w-full">
      <path d={gridPolys[4]} fill="#f8fafc" />
      {gridPolys.map((d, i) => <path key={i} d={d} fill="none" stroke={i === 4 ? '#d1d5db' : '#e5e7eb'} strokeWidth={i === 4 ? '1' : '0.75'} />)}
      {RADAR_GROUPS.map((_, i) => { const o = pt(i, maxR); return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#e5e7eb" strokeWidth="0.75" /> })}
      {[2,4,6,8,10].map((v, idx) => { const p = pt(0, maxR * gridPcts[idx]); return <text key={idx} x={p.x+4} y={p.y+1} fontSize="7" fill="#cbd5e1" fontFamily="Inter,sans-serif">{v}</text> })}
      {radarSets.map((rs, ri) => (
        <g key={ri}>
          <path d={poly(rs.scores)} fill={`${rs.color}1a`} stroke={rs.color} strokeWidth="2" strokeLinejoin="round" />
          {rs.scores.map((s, i) => { if (s <= 0) return null; const vp = pt(i, (s/10)*maxR); return <circle key={i} cx={vp.x} cy={vp.y} r="3.5" fill={rs.color} stroke="white" strokeWidth="1.5" /> })}
        </g>
      ))}
      {radarSets.length > 1 && radarSets.map((rs, ri) => {
        const x = cx - (radarSets.length * 45) / 2 + ri * 90
        const y = cy + maxR + 32
        return <g key={ri}><rect x={x} y={y} width={22} height={9} rx="2" fill={`${rs.color}1a`} stroke={rs.color} strokeWidth="1.5" /><text x={x+27} y={y+7.5} fontSize="8.5" fill="#64748b" fontFamily="Inter,sans-serif">{rs.label}</text></g>
      })}
      {RADAR_GROUPS.map((g, i) => {
        const p = pt(i, maxR + 22)
        const anchor = Math.abs(p.x - cx) < 10 ? 'middle' : p.x > cx ? 'start' : 'end'
        return <text key={i} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" fontSize="9" fill={AXIS_COLORS[i]} fontFamily="Noto Sans Thai,Inter,sans-serif" fontWeight="700">{g.shortLabel}</text>
      })}
    </svg>
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

function _InfoRowUnused({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-bold text-gray-800 text-right break-all">{value}</span>
    </div>
  )
}


