'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CATEGORY_LABELS, LEVEL_LABELS, LEVEL_COLORS,
  type Course, type CourseCategory,
} from '@/types/course'
import {
  STATUS_LABELS, STATUS_COLORS, recordProgressPercent,
  type TrainingRecord, type TrainingStatus,
} from '@/types/tracking'

// Learner course dashboard. Every number here is derived from real data:
//   • stats + progress   → the learner's own trainingRecords (written by the
//                          course detail page as they work through lessons)
//   • popular courses    → assignment reach on the course docs themselves
//                          (deliberately NOT the whole trainingRecords
//                          collection — that subscription cost users × courses
//                          reads per learner visit)
//   • level / category   → fields the admin sets on the course form
// Nothing is mocked, so what an admin configures is what a learner sees.

const DONUT_COLORS: Record<CourseCategory, string> = {
  product:     '#818cf8',
  sales_skill: '#00ce7c',
  compliance:  '#fbbf24',
  onboarding:  '#a78bfa',
  leadership:  '#fb7185',
}

function countLessons(c: Course): number {
  return (c.topics ?? []).reduce((s, t) => s + t.lessons.length, 0)
}

function fmtHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.round(minutes / 60)
  return `${h}h`
}

const COURSE_TABS: { key: 'all' | 'ongoing' | 'completed'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ongoing', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
]
const COURSE_TAB_EMPTY: Record<'all' | 'ongoing' | 'completed', string> = {
  all: 'ยังไม่มีหลักสูตรสำหรับคุณ',
  ongoing: 'ไม่มีหลักสูตรที่กำลังเรียนอยู่',
  completed: 'ยังไม่มีหลักสูตรที่เรียนจบ',
}

export function LearnerCourseDashboard({
  courses, myRecords,
}: {
  courses: Course[]              // courses visible to this learner (published + targeted)
  myRecords: TrainingRecord[]    // this learner's own training records
}) {
  const router = useRouter()

  const recordByCourse = useMemo(() => {
    const m: Record<string, TrainingRecord> = {}
    myRecords.forEach((r) => { m[r.courseId] = r })
    return m
  }, [myRecords])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let ongoing = 0, complete = 0, certificate = 0
    for (const c of courses) {
      const rec = recordByCourse[c.id]
      if (!rec) continue
      if (rec.status === 'in_progress') ongoing++
      if (rec.status === 'completed') {
        complete++
        if (c.hasCertificate) certificate++
      }
    }
    return { ongoing, complete, certificate }
  }, [courses, recordByCourse])

  // ── Continue learning — in-progress, most recently touched first ────────────
  const continueLearning = useMemo(
    () => courses
      .filter((c) => recordByCourse[c.id]?.status === 'in_progress')
      .slice(0, 3),
    [courses, recordByCourse],
  )

  // My Course = anything the learner has actually engaged with, else all visible
  const myCourses = useMemo(() => {
    const engaged = courses.filter((c) => recordByCourse[c.id])
    return engaged.length > 0 ? engaged : courses
  }, [courses, recordByCourse])

  // My Course tab filter — All / In Progress / Completed
  const [tab, setTab] = useState<'all' | 'ongoing' | 'completed'>('all')
  const tabCourses = useMemo(() => {
    if (tab === 'ongoing') return myCourses.filter((c) => recordByCourse[c.id]?.status === 'in_progress')
    if (tab === 'completed') return myCourses.filter((c) => recordByCourse[c.id]?.status === 'completed')
    return myCourses
  }, [tab, myCourses, recordByCourse])

  // ── Hero "resume" course — the LMS front door ───────────────────────────────
  // Priority: most recent in-progress course; else the first course the learner
  // hasn't started. One obvious next action beats a wall of equal choices.
  const heroCourse = useMemo(
    () => continueLearning[0] ?? courses.find((c) => !recordByCourse[c.id]) ?? null,
    [continueLearning, courses, recordByCourse],
  )
  const heroStarted = heroCourse ? !!recordByCourse[heroCourse.id] : false

  // Overall completion across everything visible to this learner
  const overallPct = courses.length > 0 ? Math.round((stats.complete / courses.length) * 100) : 0

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Resume hero — single clear next action */}
      {heroCourse && (
        <section>
          <button
            onClick={() => router.push(`/courses/${heroCourse.id}`)}
            style={{ border: 'var(--card-border)' }}
            className="w-full bg-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 text-left hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 group"
          >
            <Thumb course={heroCourse} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: DONUT_COLORS[heroCourse.category] }}>
                {heroStarted ? 'เรียนต่อจากที่ค้างไว้' : 'เริ่มเรียนหลักสูตรถัดไป'}
              </p>
              <p className="text-base font-bold text-gray-900 truncate group-hover:text-freshket-600 transition-colors">
                {heroCourse.title}
              </p>
              {(() => {
                const rec = recordByCourse[heroCourse.id]
                const pct = recordProgressPercent(rec)
                const total = countLessons(heroCourse)
                const done = rec?.completedLessonIds?.length ?? 0
                return (
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#00ce7c' }} />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {total > 0 ? `${Math.min(done, total)}/${total} บทเรียน · ` : ''}{pct}%
                    </span>
                  </div>
                )
              })()}
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 self-start sm:self-center px-5 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold group-hover:bg-freshket-600 transition-colors">
              {heroStarted ? 'เรียนต่อ' : 'เริ่มเรียน'}
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </button>
        </section>
      )}

      {/* Dashboard stats */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-4">
          <h2 className="text-sm font-bold text-gray-900">Dashboard</h2>
          {courses.length > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                จบแล้ว {stats.complete}/{courses.length} หลักสูตร
              </span>
              <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallPct}%`, background: '#00ce7c' }} />
              </div>
              <span className="text-xs font-bold text-freshket-600 tabular-nums">{overallPct}%</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Ongoing"     value={stats.ongoing}     tone="blue"
            icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 2.25-4.5 2.25v-4.5z" /></svg>} />
          <StatCard label="Complete"    value={stats.complete}    tone="green"
            icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
          <StatCard label="Certificate" value={stats.certificate} tone="orange"
            icon={<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443" /></svg>} />
        </div>
      </section>

      {/* My course — tabbed card grid (All / In Progress / Completed) */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-gray-900">My Course</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {COURSE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {tabCourses.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center" style={{ border: 'var(--card-border)' }}>
            <p className="text-sm text-gray-400">{COURSE_TAB_EMPTY[tab]}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tabCourses.map((c) => (
              <LearnerCourseGridCard
                key={c.id}
                course={c}
                record={recordByCourse[c.id]}
                onClick={() => router.push(`/courses/${c.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────
// DS 2026: white card + rgba border, colour lives in the SVG icon on a soft
// tinted pill (not a solid block), lift + shadow on hover. Each stat carries a
// distinct, meaningful icon rather than the same checkmark.
const TONES: Record<string, { pill: string; icon: string }> = {
  blue:   { pill: 'bg-blue-100',     icon: 'text-blue-500' },
  green:  { pill: 'bg-freshket-100', icon: 'text-freshket-600' },
  orange: { pill: 'bg-orange-100',   icon: 'text-orange-500' },
  purple: { pill: 'bg-purple-100',   icon: 'text-purple-500' },
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  const t = TONES[tone] ?? TONES.blue
  return (
    <div
      className="bg-white rounded-2xl p-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] transition-all duration-150 cursor-default"
      style={{ border: 'var(--card-border)' }}
    >
      <div className={`size-8 rounded-xl ${t.pill} ${t.icon} flex items-center justify-center mb-3`}>{icon}</div>
      <span className="text-xs text-gray-500 block mb-0.5 truncate">{label}</span>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  )
}

// ── Course thumbnail ─────────────────────────────────────────────────────────
function Thumb({ course, size = 'sm' }: { course: Course; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'size-12 rounded-xl' : 'size-9 rounded-lg'
  const isImg = !!course.thumbnailUrl && (course.thumbnailUrl.startsWith('http') || course.thumbnailUrl.startsWith('/'))
  if (isImg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={course.thumbnailUrl} alt="" className={`${cls} object-cover shrink-0`} />
  }
  return (
    <span className={`${cls} shrink-0 flex items-center justify-center`}
      style={{ background: course.thumbnailUrl || `${DONUT_COLORS[course.category]}22` }}>
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke={DONUT_COLORS[course.category]} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    </span>
  )
}

// ── My Course grid card — thumbnail + level badge, category, title,
// lesson/duration meta, progress bar + status (replaces price on the
// reference layout, since that's the number that matters to a learner). ────
export function LearnerCourseGridCard({ course, record, onClick }: {
  course: Course; record?: TrainingRecord; onClick: () => void
}) {
  const status: TrainingStatus = record?.status ?? 'not_started'
  const total = countLessons(course)
  const pct = recordProgressPercent(record)
  const isImg = !!course.thumbnailUrl && (course.thumbnailUrl.startsWith('http') || course.thumbnailUrl.startsWith('/'))
  return (
    <button
      onClick={onClick}
      style={{ border: 'var(--card-border)' }}
      className="flex flex-col text-left bg-white rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 group"
    >
      <div className="h-32 w-full relative shrink-0" style={{ background: isImg ? undefined : `${DONUT_COLORS[course.category]}22` }}>
        {isImg && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        )}
        {course.level && (
          <span className={`absolute top-2.5 left-2.5 text-xs font-bold px-2 py-0.5 rounded-full ${LEVEL_COLORS[course.level]}`}>
            {LEVEL_LABELS[course.level]}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 p-3.5 gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: DONUT_COLORS[course.category] }}>
          {CATEGORY_LABELS[course.category]}
        </p>
        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-freshket-600 transition-colors">
          {course.title}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
          {total > 0 && (
            <span className="flex items-center gap-1">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              {total} บทเรียน
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {fmtHours(course.durationMinutes ?? 0)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-auto pt-2.5 border-t border-gray-100">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: '#00ce7c' }} />
          </div>
          <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>
      </div>
    </button>
  )
}
