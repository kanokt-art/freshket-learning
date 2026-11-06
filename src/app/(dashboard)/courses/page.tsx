'use client'

import { lessonLabel, topicLabel, isUnnamedLesson, isUnnamedTopic, defaultLessonLabel } from '@/lib/courses/labels'
import { isInCourseTarget } from '@/lib/courses/audience'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

// recharts is ~94 kB gzipped and this page only uses it for one admin-only,
// below-the-fold chart inside the course overview modal — a plain learner
// visiting /courses (the most-trafficked tab) never needs it. Loading it on
// demand keeps the chart identical and takes recharts out of the route's
// initial bundle (same fix already applied to /team-lead).
const DeptCompletionChart = dynamic(
  () => import('@/components/features/ProgressChart').then((m) => m.DeptCompletionChart),
  {
    ssr: false,
    loading: () => <div className="h-[120px] rounded-xl bg-gray-50 animate-pulse" />,
  },
)
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useAssessments, useMyTrainingRecords, useAllUsers, useAllTrainingRecords, useDepartments, useTeams } from '@/hooks/useFirestore'
import { QuestionnaireResultCell } from '@/components/features/QuestionnaireResultCell'
import {
  CATEGORY_LABELS,
  LEVEL_LABELS,
  LESSON_TYPE_LABELS,
  type Course,
  type CourseCategory,
  type CourseLevel,
  type CourseTopic,
  type CourseLesson,
  type LessonType,
} from '@/types/course'
import { STATUS_LABELS, STATUS_COLORS, type TrainingStatus, type TrainingRecord } from '@/types/tracking'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_COLORS, type Assessment } from '@/types/assessment'
import type { UserProfile, Department, Team } from '@/types/user'
import { save, remove, patch } from '@/lib/data/collection'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { MyCourseTabs } from '@/components/layout/MyCourseTabs'
import { CourseSubTabs } from '@/components/layout/CourseSubTabs'
import { LearnerCourseDashboard } from '@/components/features/LearnerCourseDashboard'
import { CourseResultsImport } from '@/components/features/CourseResultsImport'

import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import { COURSE_IMAGE_CATALOG } from '@/lib/utils/mockData'
import { CoverImagePicker } from '@/components/features/CoverImagePicker'
import { InfoTooltip } from '@/components/common/InfoTooltip'
import { alertError, confirmAction } from '@/lib/ui/alert'
import { CopyableText } from '@/components/common/EmployeeCells'
import { formatPersonName } from '@/lib/users/displayName'
import { CourseDashboard } from '@/components/features/CourseDashboard'
import { IndividualAssignmentPanel, fmtDate, approxProgressPct } from '@/components/features/LearnerAssignment'
import { authedFetch } from '@/lib/api/authedFetch'
import { BUCKET_ASSESSMENT_LIST, getBucketAssessment, MBTI_DEFINITION } from '@/lib/bucketAssessments'
const DEMO_MODE = getDemoMode()
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CourseCategory[]

const CAT_GRADIENT: Record<CourseCategory, string> = {
  product:     'from-blue-200 to-sky-100',
  sales_skill: 'from-freshket-200 to-emerald-100',
  compliance:  'from-amber-200 to-yellow-100',
  onboarding:  'from-purple-200 to-violet-100',
  leadership:  'from-rose-200 to-pink-100',
}

const CAT_ICON_COLOR: Record<CourseCategory, string> = {
  product:     'text-blue-400',
  sales_skill: 'text-freshket-500',
  compliance:  'text-amber-400',
  onboarding:  'text-purple-400',
  leadership:  'text-rose-400',
}

const STATUS_BADGE: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress:  'bg-blue-100 text-blue-700',
  completed:    'bg-freshket-100 text-freshket-700',
  failed:       'bg-rose-100 text-rose-600',
}

function isImageUrl(s: string) { return s.startsWith('http') || s.startsWith('/') }

function fmtDuration(min: number) {
  if (min < 60) return `${min} นาที`
  const h = Math.floor(min / 60); const m = min % 60
  return m ? `${h}h ${m}m` : `${h} ชม.`
}

function CategoryIcon({ category, className }: { category: CourseCategory; className?: string }) {
  const cls = `${className ?? 'size-10'} ${CAT_ICON_COLOR[category]}`
  if (category === 'product') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-9 5.25-9-5.25v-2.25" />
    </svg>
  )
  if (category === 'sales_skill') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  )
  if (category === 'compliance') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
  if (category === 'onboarding') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CoursesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const isAdminView = user?.role === 'super_admin'
  const { data: allCourses, loading } = useCourses()
  // Admin-only: these docs contain the quiz answer keys, and rules now restrict
  // reads to super_admin. Learners lose only the "N questions / max score"
  // figures on a course card, which are cosmetic.
  const { data: allAssessments } = useAssessments(isAdminView)
  // Whole-collection reads (users roster, every training record, teams) exist
  // for the admin management UI only — a learner visiting My Course shouldn't
  // subscribe to them at all. Gating them by role is the single biggest
  // Firestore saving on this page (users × courses docs per learner visit).
  const { data: allUsers } = useAllUsers(isAdminView)
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: allTrainingRecords } = useAllTrainingRecords(isAdminView)
  const { data: departments } = useDepartments(isAdminView)
  const { data: teams } = useTeams(isAdminView)
  const [activeCategory, setActiveCategory] = useState<CourseCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [localCreated, setLocalCreated] = useState<Course[]>([])
  const [localUpdated, setLocalUpdated] = useState<Record<string, Course>>({})
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<Course | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [learnerResultsCourse, setLearnerResultsCourse] = useState<Course | null>(null)
  const [showImportResults, setShowImportResults] = useState(false)

  const isSuperAdmin = user?.role === 'super_admin'
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)

  const recordMap = useMemo(() => {
    const m: Record<string, TrainingStatus> = {}
    myRecords.forEach((r) => { m[r.courseId] = r.status })
    return m
  }, [myRecords])
  // Finished courses the learner took off their own lists.
  const dismissedIds = useMemo(() => new Set(myRecords.filter((r) => r.dismissedAt).map((r) => r.courseId)), [myRecords])

  const visible = useMemo(() => {
    // Includes the saved department/team conditions, so someone who joined after
    // the course was published still gets it without waiting for a sync.
    const isTargeted = (c: Course) =>
      isInCourseTarget(c, { uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId })
    if (DEMO_MODE) {
      return allCourses.filter((c) =>
        isSuperAdmin ? true : c.isPublished && isTargeted(c),
      )
    }
    // localCreated is an optimistic copy shown before Firestore's live snapshot
    // catches up. Once the same doc id appears in allCourses, drop the local
    // copy — otherwise the course renders twice (the local copy, plus the live
    // one once its onSnapshot listener syncs).
    const liveIds = new Set(allCourses.map((c) => c.id))
    return [
      ...localCreated.filter((c) => !localDeleted.has(c.id) && !liveIds.has(c.id)),
      ...allCourses
        .filter((c) => {
          if (localDeleted.has(c.id)) return false
          if (isSuperAdmin) return true
          return c.isPublished && isTargeted(c) && !dismissedIds.has(c.id)
        })
        .map((c) => localUpdated[c.id] ?? c),
    ]
  }, [allCourses, localCreated, localUpdated, localDeleted, user, isSuperAdmin, dismissedIds])

  const filtered = useMemo(() => {
    let list = activeCategory === 'all' ? visible : visible.filter((c) => c.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    }
    return list
  }, [visible, activeCategory, search])

  const availableCategories = useMemo(
    () => ALL_CATEGORIES.filter((cat) => visible.some((c) => c.category === cat)),
    [visible],
  )

  const enrollmentByCourseid = useMemo(() => {
    const m: Record<string, { enrolled: number; completed: number; in_progress: number }> = {}
    allTrainingRecords.forEach((r) => {
      if (!m[r.courseId]) m[r.courseId] = { enrolled: 0, completed: 0, in_progress: 0 }
      m[r.courseId].enrolled++
      if (r.status === 'completed') m[r.courseId].completed++
      if (r.status === 'in_progress') m[r.courseId].in_progress++
    })
    return m
  }, [allTrainingRecords])


  async function handleDelete(course: Course) {
    setDeleting(true)
    try {
      if (DEMO_MODE) {
        demoStore.deleteCourse(course.id)
      } else {
        await remove('courses', course.id)
        setLocalDeleted((p) => { const s = new Set(p); s.add(course.id); return s })
      }
      setConfirmDelete(null)
    } catch (e) {
      void alertError('ลบไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  if (!user) return null

  if (moduleLoading) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!allowedModules.has('lms')) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xs">
            <div className="size-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="size-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">Module ไม่ได้เปิดใช้งาน</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              หลักสูตร ยังไม่ได้เปิดสำหรับแผนกของคุณ<br />กรุณาติดต่อ Admin
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      <div className="bg-freshket-500 lg:bg-white border-b border-freshket-600 lg:border-gray-100 px-6 py-4 shrink-0 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white lg:text-gray-900">{isSuperAdmin ? 'หลักสูตรทั้งหมด' : 'My Course'}</h1>
          <p className="text-xs text-freshket-200 lg:text-gray-400 mt-0.5">{visible.length} หลักสูตร</p>
        </div>
      </div>

      {isSuperAdmin && <CourseManagementTabs />}
      <MyCourseTabs />
      <CourseSubTabs />

      <div className="flex-1 overflow-auto">
        {/* Create moved to the "Course ▾" tab dropdown (สร้างหลักสูตรใหม่). */}

        {/* ── Learner dashboard (stats / popular / my course / topics) ───────── */}
        {!isSuperAdmin && (
          <LearnerCourseDashboard
            courses={visible}
            myRecords={myRecords}
          />
        )}

        {/* ── Browse-all (search / filter / grid) — admin management only.
            Learners only ever see courses actually assigned to them, via
            LearnerCourseDashboard's My Course tabs above — not a catalog of
            every course in the system. ────────────────────────────────────── */}
        {isSuperAdmin && (
          <>
        {/* ── Search bar + actions ───────────────────────────────────────── */}
        <div className="px-6 pt-4 pb-1">
          <div className="flex items-center gap-2">
            {/* Search input */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาหลักสูตรจากชื่อหรือคำอธิบาย..."
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400 shadow-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Import course results (super_admin) — เลือกหลักสูตร + upload CSV */}
            {isSuperAdmin && (
              <button
                onClick={() => setShowImportResults(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:border-freshket-500 hover:text-freshket-600 transition-colors shadow-sm"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                นำเข้าผลคะแนน
              </button>
            )}
            {/* Create a course (super_admin) */}
            {isSuperAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-freshket-500 text-sm font-bold text-white hover:bg-freshket-600 transition-all duration-150 shadow-sm"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                สร้างหลักสูตร
              </button>
            )}
          </div>
          {search && (
            <p className="text-xs text-gray-400 mt-1.5 px-1">พบ {filtered.length} หลักสูตรจาก &ldquo;{search}&rdquo;</p>
          )}
        </div>

        {/* ── Filter chips ──────────────────────────────────────────────────── */}
        <div className="px-6 pt-3 pb-2">
          <div className="relative">
            <div className="flex items-center gap-2 overflow-x-auto pr-4" style={{ scrollbarWidth: 'none' }}>
              <FilterChip label="ทั้งหมด" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
              {availableCategories.map((cat) => (
                <FilterChip key={cat} label={CATEGORY_LABELS[cat]} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
              ))}
            </div>
            <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-slate-50 pointer-events-none" />
          </div>
        </div>

        {/* ── Course list ───────────────────────────────────────────────────── */}
        <div className="px-6 pb-8 pt-2">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="size-12 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              <p className="text-sm">ไม่พบหลักสูตร</p>
            </div>
          ) : (
            <CourseTable
              courses={filtered}
              allAssessments={allAssessments}
              allUsers={allUsers}
              isSuperAdmin={isSuperAdmin}
              recordMap={recordMap}
              enrollmentByCourseid={enrollmentByCourseid}
              onEdit={(course) => setEditingCourse(course)}
              onDelete={(course) => setConfirmDelete(course)}
              onViewLearners={(course) => setLearnerResultsCourse(course)}
              onNavigate={(course) => router.push(`/courses/${course.id}`)}
            />
          )}
        </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="animate-pop-in bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
            <div className="size-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <svg className="size-7 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">ลบหลักสูตรนี้?</h3>
            <p className="text-sm text-gray-500 mb-1 line-clamp-2 font-normal">{confirmDelete.title}</p>
            <p className="text-xs text-gray-400 mb-6">การลบไม่สามารถยกเลิกได้ ข้อมูลการเรียนของผู้ใช้ที่เชื่อมกับหลักสูตรนี้จะยังคงอยู่</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60">
                ยกเลิก
              </button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-bold hover:bg-rose-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting ? <><span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังลบ...</> : 'ลบหลักสูตร'}
              </button>
            </div>
          </div>
        </div>
      )}

      {learnerResultsCourse && (
        <CourseOverviewModal
          course={learnerResultsCourse}
          allUsers={allUsers}
          allTrainingRecords={allTrainingRecords}
          onClose={() => setLearnerResultsCourse(null)}
        />
      )}

      {showImportResults && (
        <CourseResultsImport
          courses={visible}
          onClose={() => setShowImportResults(false)}
        />
      )}

      {(showCreate || editingCourse) && (
        <CourseFormModal
          // Keyed so switching between "create new" and editing a course (or
          // between two courses) REMOUNTS the modal. Without this, React reuses
          // the instance and its useState initialiser never re-runs, so the new
          // form opened with the previously edited course's topics still in it
          // — a brand-new course would arrive carrying that course's lessons.
          key={editingCourse?.id ?? '__new__'}
          assessments={allAssessments}
          allUsers={allUsers}
          onDone={(c) => {
            if (c) {
              if (DEMO_MODE) {
                if (editingCourse) demoStore.updateCourse(c.id, c)
                else demoStore.addCourse(c)
              } else {
                if (editingCourse) setLocalUpdated((p) => ({ ...p, [c.id]: c }))
                else setLocalCreated((p) => [c, ...p])
              }
            }
            setShowCreate(false)
            setEditingCourse(null)
          }}
          userId={user?.uid ?? ''}
          editCourse={editingCourse ?? undefined}
        />
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────────
function CreateCardHorizontal({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-4 bg-white rounded-2xl border-2 border-dashed border-freshket-200 hover:border-freshket-400 hover:bg-freshket-50/40 transition-all duration-200 group text-left"
    >
      <div className="size-11 rounded-xl bg-freshket-100 flex items-center justify-center shrink-0 group-hover:bg-freshket-500 transition-colors duration-200">
        <svg className="size-5 text-freshket-600 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-freshket-600 group-hover:text-freshket-700 transition-colors">สร้างหลักสูตรใหม่</p>
        <p className="text-xs text-gray-400 mt-0.5">คลิกเพื่อเพิ่มหลักสูตรพร้อมตั้งค่าแบบทดสอบและกลุ่มเป้าหมาย</p>
      </div>
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-freshket-500 text-white text-xs font-bold group-hover:bg-freshket-600 transition-colors">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        สร้าง
      </div>
    </button>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}>
      {label}
    </button>
  )
}

// ── Course Table (list view) ────────────────────────────────────────────────────
function CourseTable({ courses, allAssessments, allUsers, isSuperAdmin, recordMap = {}, enrollmentByCourseid, onEdit, onDelete, onViewLearners, onNavigate }: {
  courses: Course[]; allAssessments: Assessment[]; allUsers: UserProfile[]; isSuperAdmin: boolean
  recordMap?: Record<string, TrainingStatus>
  enrollmentByCourseid: Record<string, { enrolled: number; completed: number; in_progress: number }>
  onEdit: (c: Course) => void; onDelete: (c: Course) => void; onViewLearners: (c: Course) => void; onNavigate: (c: Course) => void
}) {
  // Learners get a clean, read-only list — no authoring/publish/enrolment columns
  // and no edit/delete. They only see the course, its category, and their own
  // learning status.
  if (!isSuperAdmin) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Course</th>
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Category</th>
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => {
              const myStatus: TrainingStatus = recordMap[course.id] ?? 'not_started'
              return (
                <tr key={course.id} className="group border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <button type="button" onClick={() => onNavigate(course)} className="flex items-center gap-3 text-left w-full">
                      <div className="size-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                        {course.thumbnailUrl && isImageUrl(course.thumbnailUrl)
                          ? <img src={course.thumbnailUrl} alt={course.title} className="size-full object-cover" />
                          : <CategoryIcon category={course.category} className="size-5 opacity-50" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-freshket-600 truncate group-hover:underline">{course.title}</p>
                        <p className="text-xs text-gray-400 truncate">{course.description || '—'}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{CATEGORY_LABELS[course.category]}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_BADGE[myStatus]}`}>{STATUS_LABELS[myStatus]}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Course</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Score</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Category</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Published</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Last Updated</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Learners</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => {
            const lessonQuizAssessmentIds = new Set(
              (course.topics ?? []).flatMap((t) => t.lessons.filter((l) => l.type === 'quiz' && l.assessmentId).map((l) => l.assessmentId as string)),
            )
            const linkedAssessments = allAssessments.filter((a) => lessonQuizAssessmentIds.has(a.id))
            const maxScore = linkedAssessments.reduce((sum, a) => sum + a.questions.reduce((s, q) => s + (q.points ?? 0), 0), 0)
            const creatorName = allUsers.find((u) => u.uid === course.createdBy)?.displayName ?? '—'
            const rec = enrollmentByCourseid[course.id] ?? { enrolled: 0, completed: 0, in_progress: 0 }
            return (
              <tr key={course.id} className="group border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 max-w-xs">
                  <button type="button" onClick={() => (isSuperAdmin ? onEdit(course) : onNavigate(course))} className="flex items-center gap-3 text-left w-full">
                    <div className="size-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {course.thumbnailUrl && isImageUrl(course.thumbnailUrl)
                        ? <img src={course.thumbnailUrl} alt={course.title} className="size-full object-cover" />
                        : <CategoryIcon category={course.category} className="size-5 opacity-50" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-freshket-600 truncate group-hover:underline">{course.title}</p>
                      <p className="text-xs text-gray-400 truncate">{course.description || '—'}</p>
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{maxScore > 0 ? maxScore : '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{CATEGORY_LABELS[course.category]}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="text-xs text-gray-700">{fmtDate(course.createdAt)}</p>
                  <p className="text-xs text-gray-400">{creatorName}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="text-xs text-gray-700">{fmtDate(course.updatedAt)}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="flex items-center gap-1 text-xs text-gray-600">
                    <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    {rec.enrolled}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {/* Launching is a Course Design's job: "เผยแพร่แล้ว" = in a live Course Design, "ปิดเผยแพร่" = was open (has records) and no longer is, "ร่าง" = never launched. */}
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${course.isPublished ? 'bg-freshket-100 text-freshket-700' : rec.enrolled > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {course.isPublished ? 'เผยแพร่แล้ว' : rec.enrolled > 0 ? 'ปิดเผยแพร่' : 'ร่าง'}
                    </span>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button type="button" title="ดูข้อมูลผู้เรียน" onClick={(e) => { e.stopPropagation(); onViewLearners(course) }}
                          className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
                          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button type="button" title="ลบหลักสูตร" onClick={(e) => { e.stopPropagation(); onDelete(course) }}
                          className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all">
                          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Learner Results Modal (80% of screen) ───────────────────────────────────────
const RESULT_STATUS_FILTERS: (TrainingStatus | 'all')[] = ['all', 'not_started', 'in_progress', 'completed', 'failed']

type CourseOverviewTab = 'overview' | 'learners'
const OVERVIEW_TABS: { id: CourseOverviewTab; label: string }[] = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'learners', label: 'สรุปข้อมูลผู้เรียน' },
]

// Replaces the old learner-only results table with a 3-tab course dashboard:
// completion overview + per-department bar chart, the learner list (former
// LearnerResultsModal content), and a quick publish/unpublish toggle so a
// super_admin doesn't have to open the full edit form just to open/close a course.
function CourseOverviewModal({ course, allUsers, allTrainingRecords, onClose }: {
  course: Course; allUsers: UserProfile[]; allTrainingRecords: TrainingRecord[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<CourseOverviewTab>('overview')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | 'all'>('all')

  const targetUsers = useMemo(() => {
    if (course.assignedUserIds && course.assignedUserIds.length > 0) {
      const ids = new Set(course.assignedUserIds)
      return allUsers.filter((u) => ids.has(u.uid))
    }
    return allUsers.filter((u) => (course.targetRoles as string[]).includes(u.role))
  }, [course, allUsers])

  const rows = useMemo(() => targetUsers.map((u) => {
    const record = allTrainingRecords.find((r) => r.courseId === course.id && r.userId === u.uid)
    const status: TrainingStatus = record?.status ?? 'not_started'
    const lastActivity = record?.completedAt ?? record?.startedAt
    return { user: u, record, status, lastActivity }
  }), [targetUsers, allTrainingRecords, course.id])

  const departments = useMemo(() => Array.from(new Set(targetUsers.map((u) => u.department).filter(Boolean))).sort() as string[], [targetUsers])

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (deptFilter && r.user.department !== deptFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    return true
  }), [rows, deptFilter, statusFilter])

  const completedCount = useMemo(() => rows.filter((r) => r.status === 'completed').length, [rows])
  const inProgressCount = useMemo(() => rows.filter((r) => r.status === 'in_progress').length, [rows])
  const failedCount = useMemo(() => rows.filter((r) => r.status === 'failed').length, [rows])
  const notStartedCount = rows.length - completedCount - inProgressCount - failedCount

  // One bar per department = % of that department's assigned learners who
  // completed the course, ranked highest-first.
  const deptChartData = useMemo(() => {
    return departments
      .map((dept) => {
        const deptRows = rows.filter((r) => r.user.department === dept)
        const completed = deptRows.filter((r) => r.status === 'completed').length
        return {
          name: dept,
          completedPct: deptRows.length > 0 ? Math.round((completed / deptRows.length) * 100) : 0,
          total: deptRows.length,
        }
      })
      .sort((a, b) => b.completedPct - a.completedPct)
  }, [departments, rows])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-[80vw] h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">{course.title}</h3>
            <p className="text-xs text-gray-400 truncate">{rows.length} คนที่ถูกมอบหมาย</p>
          </div>
          <button type="button" onClick={onClose}
            className="size-9 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-gray-100 shrink-0 px-6">
          {OVERVIEW_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-bold border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-freshket-500 text-freshket-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl p-4 bg-gray-50">
                <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
                <p className="text-xs text-gray-500 mt-1">ทั้งหมด</p>
              </div>
              <div className="rounded-2xl p-4 bg-freshket-50">
                <p className="text-2xl font-bold text-freshket-600">{completedCount}</p>
                <p className="text-xs text-gray-500 mt-1">เรียนจบแล้ว</p>
              </div>
              <div className="rounded-2xl p-4 bg-blue-50">
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
                <p className="text-xs text-gray-500 mt-1">กำลังเรียน</p>
              </div>
              <div className="rounded-2xl p-4 bg-gray-50">
                <p className="text-2xl font-bold text-gray-500">{notStartedCount}</p>
                <p className="text-xs text-gray-500 mt-1">ยังไม่เริ่ม</p>
              </div>
            </div>
            {failedCount > 0 && (
              <p className="text-xs font-bold text-rose-500">{failedCount} คนสอบไม่ผ่าน</p>
            )}

            <div>
              <p className="text-sm font-bold text-gray-900 mb-3">อัตราเรียนจบแยกตามแผนก</p>
              {deptChartData.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-10">ยังไม่มีข้อมูลแผนก</p>
              ) : (
                <DeptCompletionChart data={deptChartData} />
              )}
            </div>
          </div>
        )}

        {tab === 'learners' && (
          <>
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 shrink-0">
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                className="text-xs rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-freshket-300 bg-white text-gray-600">
                <option value="">ทุกแผนก</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex items-center gap-1.5 flex-wrap">
                {RESULT_STATUS_FILTERS.map((s) => (
                  <button key={s} type="button" onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}>
                    {s === 'all' ? 'ทั้งหมด' : STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400 ml-auto shrink-0">{filteredRows.length}/{rows.length} คน</span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 sticky top-0 bg-white">
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Name</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Position</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Department</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Started</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Last Activity</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Progress</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Score</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-400 text-sm py-10">ไม่พบข้อมูลผู้เรียน</td></tr>
                  ) : filteredRows.map(({ user: u, record, status, lastActivity }) => {
                    const pct = approxProgressPct(status, record)
                    return (
                      <tr key={u.uid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                              {u.photoURL
                                ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                                : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600"><CopyableText text={u.position} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600"><CopyableText text={u.department} /></td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(record?.startedAt)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(lastActivity)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 w-28">
                            <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-freshket-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                          {record?.score != null ? `${record.score}${record.passScore != null ? `/${record.passScore}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Quiz Preview Modal — mocks the learner-facing take-assessment flow ────────
// Read-only: no answers are graded or saved. It exists so an admin editing a
// lesson's linked assessment can see how the intro screen and question paging
// (per_question / per_topic / all_in_one) will look before publishing.
// Renders the take-assessment preview (intro → form/quiz → done) with no modal
// chrome of its own, so it can sit directly in LessonPreviewModal's right-hand
// pane next to the video/file/link previews. A quiz lesson then behaves like
// every other lesson type there — content appears in place rather than in a
// second modal stacked on top of the first.
function QuizPreviewInline({ assessment }: { assessment?: Assessment }) {
  const isGoogleForm = !!assessment?.googleFormUrl
  const questions = (assessment?.questions ?? []).slice().sort((a, b) => a.order - b.order)
  // Google Form has no intro/paging screens of its own — it goes straight
  // from "intro" to the embedded form, skipping "quiz" entirely (there are no
  // questions[] to page through; Google owns the response collection).
  const [screen, setScreen] = useState<'intro' | 'quiz' | 'form' | 'done'>('intro')
  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const [resolvedFormUrl, setResolvedFormUrl] = useState<string | null>(null)
  const [resolvingForm, setResolvingForm] = useState(false)
  useEffect(() => {
    if (!isGoogleForm || !assessment?.googleFormUrl?.includes('forms.gle')) return
    let cancelled = false
    setResolvingForm(true)
    // Bounded so a slow/unreachable forms.gle can't leave the spinner stuck
    // forever — always falls through to the "open new tab" fallback within 10s.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    authedFetch('/api/resolve-form-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: assessment.googleFormUrl }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setResolvedFormUrl(json.resolvedUrl)
      })
      .catch(() => { /* falls back to the "open new tab" branch below */ })
      .finally(() => { clearTimeout(timeout); if (!cancelled) setResolvingForm(false) })
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [isGoogleForm, assessment?.googleFormUrl])
  const formEmbedUrl = isGoogleForm ? toFormEmbedUrl(resolvedFormUrl ?? assessment?.googleFormUrl ?? '') : null

  const answerViewMode = assessment?.answerViewMode ?? 'per_topic'
  const perPage = answerViewMode === 'all_in_one' ? Math.max(questions.length, 1)
    : answerViewMode === 'per_topic' ? 5
    : 1
  const pages = Math.max(Math.ceil(questions.length / perPage), 1)
  const pageQuestions = questions.slice(page * perPage, page * perPage + perPage)

  function setAnswer(id: string, val: string) {
    setAnswers((p) => ({ ...p, [id]: val }))
  }

  function reset() {
    setScreen('intro'); setPage(0); setAnswers({})
  }

  return (
    <>
      {/* Fills whatever height the host pane gives it, so the 'form' screen's
          iframe can stretch; in a short host it simply sizes to its content. */}
      <div className="flex-1 min-h-0 flex flex-col">
          {!assessment ? (
            <div className="py-10 text-center text-sm text-gray-400">
              ยังไม่ได้เลือกชุดคำถาม — เลือกชุดคำถามในหัวข้อ &ldquo;ชุดคำถาม&rdquo; ก่อนเพื่อดูตัวอย่าง
            </div>
          ) : screen === 'intro' ? (
            <div className="text-center space-y-4">
              <div className="size-14 rounded-2xl bg-freshket-100 flex items-center justify-center mx-auto">
                <svg className="size-7 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">{assessment.title || 'แบบทดสอบ'}</h3>
                {assessment.description && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{assessment.description}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {isGoogleForm ? (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Google Form</span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{questions.length} ข้อ</span>
                )}
                {Number(assessment.timeLimitMinutes) > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{assessment.timeLimitMinutes} นาที</span>
                )}
                {!isGoogleForm && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700">ผ่านที่ {assessment.passingScore}%</span>
                )}
                {assessment.antiCheatEnabled && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-600">Anti-Cheat</span>
                )}
                {/* No "ต้องเปิดกล้อง" badge: camera proctoring is not implemented,
                    and showing it implied an enforcement that never ran. */}
              </div>
              {isGoogleForm ? (
                <button type="button" onClick={() => setScreen('form')}
                  className="px-6 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
                  เริ่มทำแบบทดสอบ
                </button>
              ) : questions.length === 0 ? (
                <p className="text-xs text-gray-400">ชุดคำถามนี้ยังไม่มีคำถาม</p>
              ) : (
                <button type="button" onClick={() => setScreen('quiz')}
                  className="px-6 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
                  เริ่มทำแบบทดสอบ
                </button>
              )}
            </div>
          ) : screen === 'form' ? (
            <div className="space-y-4 h-full flex flex-col">
              {resolvingForm ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <span className="size-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  กำลังตรวจสอบลิงก์แบบฟอร์ม...
                </div>
              ) : formEmbedUrl ? (
                <>
                  {/* The form owns the full height of the pane. A short fixed
                      height here just moved the scrolling inside Google's own
                      frame, which reads as a cramped box rather than the
                      learner's actual view. */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 flex-1 min-h-0">
                    <iframe src={formEmbedUrl} className="w-full h-full block" title={assessment.title} style={{ border: 'none' }} />
                  </div>
                  <button type="button" onClick={() => setScreen('done')}
                    className="w-full py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
                    เสร็จสิ้น (ตัวอย่างเท่านั้น)
                  </button>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-gray-400">
                  <p>ไม่สามารถแสดงตัวอย่างในหน้านี้ได้</p>
                  {assessment.googleFormUrl && (
                    <a href={assessment.googleFormUrl} target="_blank" rel="noopener noreferrer"
                      className="text-freshket-600 font-bold hover:underline">เปิดลิงก์ Google Form</a>
                  )}
                </div>
              )}
            </div>
          ) : screen === 'quiz' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                  <span>{answerViewMode === 'per_topic' ? `หัวข้อ ${page + 1}/${pages}` : `หน้า ${page + 1}/${pages}`}</span>
                  <span>{Object.keys(answers).length}/{questions.length} ตอบแล้ว</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-freshket-500 transition-all duration-300" style={{ width: `${((page + 1) / pages) * 100}%` }} />
                </div>
              </div>

              {pageQuestions.map((q, i) => (
                <div key={q.id} className="rounded-xl border border-gray-100 p-3.5 space-y-2.5">
                  <p className="text-sm font-bold text-gray-800">{page * perPage + i + 1}. {q.text}</p>
                  {q.type === 'multiple_choice' && q.choices?.map((c) => (
                    <label key={c.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-all ${answers[q.id] === c.id ? 'border-freshket-400 bg-freshket-50 text-freshket-700 font-bold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === c.id} onChange={() => setAnswer(q.id, c.id)}
                        className="text-freshket-500 focus:ring-freshket-300" />
                      {c.text}
                    </label>
                  ))}
                  {q.type === 'open_ended' && (
                    <textarea rows={2} placeholder="พิมพ์คำตอบ..." value={answers[q.id] ?? ''}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
                    />
                  )}
                  {q.type === 'drag_drop' && (
                    <div className="space-y-1.5">
                      {q.dragPairs?.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="px-2.5 py-1.5 rounded-lg bg-gray-100 font-bold shrink-0">{p.left}</span>
                          <svg className="size-3.5 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                          </svg>
                          <span className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-400 flex-1">เลือกคำตอบที่ตรงกัน</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  ย้อนกลับ
                </button>
                {page < pages - 1 ? (
                  <button type="button" onClick={() => setPage((p) => p + 1)}
                    className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-all">
                    ถัดไป
                  </button>
                ) : (
                  <button type="button" onClick={() => setScreen('done')}
                    className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-all">
                    ส่งคำตอบ
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <div className="size-14 rounded-full bg-freshket-100 flex items-center justify-center mx-auto">
                <svg className="size-7 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900">ทำแบบทดสอบเสร็จสิ้น</h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">นี่คือหน้าจอตัวอย่างเท่านั้น — ไม่มีการบันทึกคะแนนหรือคำตอบจริง</p>
              <button type="button" onClick={reset}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
                ดูอีกครั้ง
              </button>
            </div>
          )}
      </div>
    </>
  )
}

// ── Course Builder (full-page, sidebar tabs) ──────────────────────────────────
type BuilderTab = 'details' | 'lessons' | 'quiz'

// Order = setup first, then the read-only report. "สรุปผลการเรียน" sits last
// because it reports on the course rather than configuring it. "แบบทดสอบ"
// follows "บทเรียน" because it configures the quiz lessons created there.
const BUILDER_TABS: { id: BuilderTab; label: string }[] = [
  { id: 'details',  label: 'รายละเอียดคอร์ส' },
  { id: 'lessons',  label: 'บทเรียน' },
  { id: 'quiz',     label: 'แบบทดสอบ' },
]

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type FormState = {
  title: string; description: string; category: CourseCategory; level: CourseLevel
  durationMinutes: string; isRequired: boolean
  thumbnailUrl: string; slideUrl: string; formUrl: string
  instructorId: string; courseAdminIds: string[]; introVideoUrl: string
  hasCertificate: boolean; allowRetake: boolean
  openEnrollment: boolean
  topics: CourseTopic[]
  hasKeyTakeAway: boolean; keyTakeAwayPrompt: string
  quizEnabled: boolean
  // Challenge
  isChallenge: boolean
  challengeWindowStart: string
  challengeWindowEnd: string
  challengeMultiplier: string
}

function formFromCourse(c: Course): FormState {
  const toInputDate = (d?: Date | string) => {
    if (!d) return ''
    const date = new Date(d as string)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().split('T')[0]
  }
  return {
    title: c.title, description: c.description, category: c.category,
    level: c.level ?? 'beginner',
    durationMinutes: String(c.durationMinutes), isRequired: c.isRequired,
    thumbnailUrl: c.thumbnailUrl ?? '', slideUrl: (c as Course & { slideUrl?: string }).slideUrl ?? '',
    formUrl: c.formUrl ?? '',
    instructorId: c.instructorId ?? '', courseAdminIds: c.courseAdminIds ?? [],
    introVideoUrl: c.introVideoUrl ?? '',
    hasCertificate: !!c.hasCertificate, allowRetake: !!c.allowRetake,
    openEnrollment: !!c.openEnrollment,
    topics: c.topics ?? [],
    hasKeyTakeAway: !!c.hasKeyTakeAway,
    keyTakeAwayPrompt: c.keyTakeAwayPrompt ?? '',
    // Older courses predate this flag: infer it from whether any lesson
    // already carries a pre/post role, so opening one doesn't silently read
    // as "quizzes off" and strip the roles on the next save.
    quizEnabled: c.quizEnabled ?? (c.topics ?? []).some((t) => t.lessons.some((l) => !!l.quizRole)),
    isChallenge: !!c.isChallenge,
    challengeWindowStart: toInputDate(c.challengeWindowStart),
    challengeWindowEnd: toInputDate(c.challengeWindowEnd),
    challengeMultiplier: String(c.challengeMultiplier ?? 2),
  }
}

function BuilderTabIcon({ id, className }: { id: BuilderTab; className?: string }) {
  const cls = className ?? 'size-4'
  if (id === 'details') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
  if (id === 'lessons') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
    </svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )
}

// article/link/assignment removed from the picker — unused lesson formats.
// 'quiz' is absent on purpose too, but for a different reason: quiz lessons
// are system-managed. The "แบบทดสอบ" switch creates them and pins them to
// the ends of the course, so hand-authoring one here would produce a quiz
// sitting in the middle that nothing grades.
// Existing lessons of the removed types are left as-is in Firestore; this
// only stops new ones from being created.
const LESSON_TYPES: LessonType[] = ['video', 'file']

function LessonTypeIcon({ type, className }: { type: LessonType; className?: string }) {
  const cls = className ?? 'size-4'
  if (type === 'video') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-2.72a.75.75 0 011.28.53v7.38a.75.75 0 01-1.28.53l-4.72-2.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-7.5A2.25 2.25 0 0013.5 6.75h-9A2.25 2.25 0 002.25 9v7.5a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
  if (type === 'article') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
  if (type === 'file') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21h9M12 18.25V21" />
    </svg>
  )
  if (type === 'link') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
  if (type === 'quiz') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )
  if (type === 'personality') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

// ── Lesson/course preview (learner view) ──────────────────────────────────────
// Media URL detection mirrors courses/[id]/page.tsx's learner-facing embed
// logic — kept as a local copy (not shared) since this is a read-only preview
// that never needs progress-gating, unlike the real YouTubeGatedPlayer.
type PreviewMediaType = 'google_slides' | 'youtube' | 'google_drive' | 'unknown'

function detectPreviewMediaType(url: string): PreviewMediaType {
  if (!url) return 'unknown'
  if (url.includes('docs.google.com/presentation')) return 'google_slides'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('drive.google.com')) return 'google_drive'
  return 'unknown'
}

function toPreviewEmbedUrl(url: string): string | null {
  if (!url || url.includes('example-')) return null
  const type = detectPreviewMediaType(url)

  if (type === 'google_slides') {
    const base = url
      .replace(/\/edit(\?.*)?$/, '/embed')
      .replace(/\/pub(\?.*)?$/, '/embed')
      .replace(/\/present(\?.*)?$/, '/embed')
    return base.includes('/embed') ? (base.includes('?') ? base : `${base}?start=false&loop=false&delayms=3000`) : null
  }
  if (type === 'youtube') {
    const m1 = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/)
    const m2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const vid = (m1 ?? m2)?.[1]
    return vid ? `https://www.youtube.com/embed/${vid}?rel=0` : null
  }
  if (type === 'google_drive') {
    const m1 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    const fileId = (m1 ?? m2)?.[1]
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null
  }
  return null
}

// Mirrors courses/[id]/page.tsx's toFormEmbedUrl — converts an ALREADY-RESOLVED
// docs.google.com URL into its embeddable form. forms.gle resolving happens
// separately via /api/resolve-form-url (a browser can't follow that redirect
// itself; the target host sends no CORS headers for a cross-origin fetch).
function toFormEmbedUrl(url: string): string | null {
  if (!url || url.includes('example-')) return null
  if (url.includes('docs.google.com/forms')) {
    const base = url.split('?')[0].replace(/\/(edit|pub|closedform)$/, '/viewform')
    const viewBase = base.endsWith('/viewform') ? base : `${base}/viewform`
    return `${viewBase}?embedded=true`
  }
  return null
}

// What a learner sees at the Key Take Away step, for the admin to read: the question the course puts to them and
// the box they write in. Typing here is only to see how it feels; nothing is saved and nobody is told.
function TakeAwayPreview({ prompt }: { prompt?: string }) {
  const [text, setText] = useState('')
  const question = prompt?.trim() || 'สรุปสิ่งที่คุณได้เรียนรู้จากหลักสูตรนี้'
  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl flex items-center justify-center bg-purple-50 text-purple-500">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900">Key Take Away</h3>
          <p className="text-xs text-gray-400">สรุปสิ่งที่ได้เรียนรู้หลังจบหลักสูตร</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-2">{question}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="เขียนสิ่งที่คุณได้เรียนรู้ สิ่งที่จะนำไปปรับใช้กับงาน หรือข้อสังเกตที่น่าสนใจ..."
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-gray-400 mt-1.5 text-right">{text.trim().length} ตัวอักษร (ขั้นต่ำ 10)</p>
        </div>
        <button type="button" disabled
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-freshket-500 text-white opacity-40 cursor-not-allowed flex items-center justify-center gap-2">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          บันทึก Key Take Away
        </button>
      </div>

      <p className="text-xs text-amber-600">ตัวอย่างมุมมองผู้เรียน: ข้อความที่พิมพ์ไม่ถูกบันทึกและไม่แจ้งเตือนใคร</p>
    </div>
  )
}

// Full course preview: browse every topic/lesson exactly as a learner's lesson
// list is laid out. Takes the full assessments list (not one resolved
// assessment) because "เริ่มทำแบบฝึกหัด" on a quiz-type lesson needs THAT
// lesson's own assessmentId — each quiz-type lesson can link a different
// question set.
// The Key Take Away step is not a lesson, so the preview gives it a fixed id of its own.
const TAKEAWAY_PREVIEW_ID = '__key_take_away__'
// So is the last step, "จบการเรียน" (the page where a learner finishes the course).
const FINISH_PREVIEW_ID = '__finish__'

function LessonPreviewModal({ topics, assessments, courseId, hasKeyTakeAway, keyTakeAwayPrompt, onClose }: {
  topics: CourseTopic[]; assessments: Assessment[]
  /** Whether the course asks learners for a Key Take Away after the lessons, and the question it puts to them. */
  hasKeyTakeAway?: boolean
  keyTakeAwayPrompt?: string
  /** The saved course, so a quiz or questionnaire can really be tried. None for a course not saved yet. */
  courseId?: string
  onClose: () => void
}) {
  const router = useRouter()
  const sortedTopics = topics.slice().sort((a, b) => a.order - b.order)
  const firstLesson = sortedTopics.find((t) => t.lessons.length > 0)?.lessons[0]
  const [selectedId, setSelectedId] = useState<string | undefined>(firstLesson?.id)
  // Pressing จบการเรียน here only shows what a learner would see; nothing is saved.
  const [finishPressed, setFinishPressed] = useState(false)

  const selectedLesson = sortedTopics
    .flatMap((t) => t.lessons)
    .find((l) => l.id === selectedId)

  const activeQuizAssessment = assessments.find((a) => a.id === selectedLesson?.assessmentId)

  // Try the quiz for real, exactly as a learner would (same page, same grading).
  function tryQuiz(lesson: CourseLesson) {
    const step = lesson.quizRole === 'pre_test' ? 'pre' : lesson.quizRole === 'post_test' ? 'post' : undefined
    sessionStorage.setItem('assessment_return', JSON.stringify({
      courseId,
      ...(step ? { step, lessonId: lesson.id } : {}),
    }))
    router.push(`/assessment/${lesson.assessmentId}?preview=1`)
  }

  const embedUrl = selectedLesson?.type === 'video' ? toPreviewEmbedUrl(selectedLesson.videoUrl ?? '')
    : selectedLesson?.type === 'file' ? toPreviewEmbedUrl(selectedLesson.fileUrl ?? '')
    : null

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            พรีวิวมุมมองผู้เรียน
          </span>
          <button type="button" onClick={onClose}
            className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {sortedTopics.every((t) => t.lessons.length === 0) && !hasKeyTakeAway ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">ยังไม่มีบทเรียน — เพิ่มหัวข้อและบทเรียนก่อนเพื่อดูตัวอย่าง</div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: topics/lessons list */}
            <div className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto p-3 space-y-3">
              {sortedTopics.map((t, ti) => (
                <div key={t.id}>
                  <p className="text-xs font-bold text-gray-400 px-1.5 mb-1 truncate">{topicLabel(t.title, ti)}</p>
                  <div className="space-y-0.5">
                    {t.lessons.slice().sort((a, b) => a.order - b.order).map((l, li) => (
                      <button key={l.id} type="button" onClick={() => setSelectedId(l.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${selectedId === l.id ? 'bg-freshket-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <LessonTypeIcon type={l.type} className="size-3.5 shrink-0" />
                        <span className="flex-1 truncate">{lessonLabel(l.title, li)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {hasKeyTakeAway && (
                <div>
                  <p className="text-xs font-bold text-gray-400 px-1.5 mb-1 truncate">หลังเรียนจบ</p>
                  <button type="button" onClick={() => setSelectedId(TAKEAWAY_PREVIEW_ID)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${selectedId === TAKEAWAY_PREVIEW_ID ? 'bg-freshket-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    <span className="flex-1 truncate">Key Take Away</span>
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100">
                <button type="button" onClick={() => { setSelectedId(FINISH_PREVIEW_ID); setFinishPressed(false) }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${selectedId === FINISH_PREVIEW_ID ? 'bg-freshket-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                  </svg>
                  <span className="flex-1 truncate">จบการเรียน</span>
                </button>
              </div>
            </div>

            {/* Right: content viewer. A quiz lesson gets the full height of the
                pane (and no max-width) so an embedded Google Form renders at
                the size a learner actually sees, instead of scrolling inside a
                short box. Every other lesson type keeps the reading column. */}
            <div className={`flex-1 p-6 ${selectedLesson?.type === 'quiz' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
              {selectedId === TAKEAWAY_PREVIEW_ID ? (
                <TakeAwayPreview prompt={keyTakeAwayPrompt} />
              ) : selectedId === FINISH_PREVIEW_ID ? (
                <div className="space-y-4 max-w-2xl">
                  <h3 className="text-base font-bold text-gray-900">จบการเรียน</h3>
                  <p className="text-xs text-gray-500">
                    {finishPressed
                      ? 'ผู้เรียนจะเห็นว่าเรียนจบหลักสูตรแล้ว'
                      : 'ผู้เรียนต้องผ่านครบทุกบทเรียนก่อน จึงกดปุ่มด้านล่างเพื่อจบการเรียนได้'}
                  </p>
                  <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                    {sortedTopics.flatMap((t, ti) => t.lessons.slice().sort((a, b) => a.order - b.order).map((l, li) => (
                      <button key={`${t.id}:${l.id}`} type="button" onClick={() => setSelectedId(l.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                        <span className={`size-5 rounded-full flex items-center justify-center shrink-0 ${finishPressed ? 'bg-freshket-500' : 'border-2 border-gray-200'}`}>
                          {finishPressed && (
                            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-gray-900 truncate">{lessonLabel(l.title, li)}</span>
                          <span className="block text-xs text-gray-400 truncate">{topicLabel(t.title, ti)}</span>
                        </span>
                      </button>
                    )))}
                  </div>
                  {finishPressed ? (
                    <p className="inline-flex items-center gap-2 text-sm font-bold text-freshket-700">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      เรียนจบหลักสูตรแล้ว
                    </p>
                  ) : (
                    <button type="button" onClick={() => setFinishPressed(true)}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold bg-freshket-500 text-white hover:bg-freshket-600 transition-all shadow-sm">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      จบการเรียน
                    </button>
                  )}
                  <p className="text-xs text-amber-600">ตัวอย่างมุมมองผู้เรียน: กดแล้วไม่บันทึกอะไร ไม่นับว่าเรียนจบ และไม่แจ้งเตือนใคร</p>
                </div>
              ) : !selectedLesson ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">เลือกบทเรียนทางซ้าย</div>
              ) : (
                <div className={`space-y-4 ${selectedLesson.type === 'quiz' ? 'flex-1 min-h-0 flex flex-col' : 'max-w-2xl'}`}>
                  <h3 className="text-base font-bold text-gray-900">{selectedLesson.title}</h3>
                  {selectedLesson.description && <p className="text-xs text-gray-400">{selectedLesson.description}</p>}

                  {selectedLesson.type === 'video' && (
                    embedUrl ? (
                      <div className="rounded-xl overflow-hidden border border-gray-100" style={{ aspectRatio: '16/9' }}>
                        <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={selectedLesson.title} style={{ border: 'none' }} />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">ยังไม่ได้ใส่ลิงก์วิดีโอ หรือลิงก์ไม่สามารถแสดงตัวอย่างได้</p>
                    )
                  )}

                  {selectedLesson.type === 'article' && (
                    selectedLesson.articleBody
                      ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selectedLesson.articleBody}</p>
                      : <p className="text-xs text-gray-400">ยังไม่ได้กรอกเนื้อหาบทความ</p>
                  )}

                  {selectedLesson.type === 'file' && (
                    embedUrl ? (
                      <div className="rounded-xl overflow-hidden border border-gray-100" style={{ aspectRatio: '16/9' }}>
                        <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={selectedLesson.title} style={{ border: 'none' }} />
                      </div>
                    ) : selectedLesson.fileUrl ? (
                      <a href={selectedLesson.fileUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                        เปิดเอกสาร
                      </a>
                    ) : (
                      <p className="text-xs text-gray-400">ยังไม่ได้ใส่ลิงก์เอกสาร</p>
                    )
                  )}

                  {selectedLesson.type === 'link' && (
                    selectedLesson.linkUrl ? (
                      <a href={selectedLesson.linkUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                        เปิดลิงก์ภายนอก
                      </a>
                    ) : (
                      <p className="text-xs text-gray-400">ยังไม่ได้ใส่ลิงก์ภายนอก</p>
                    )
                  )}

                  {selectedLesson.type === 'quiz' && (
                    selectedLesson.assessmentId ? (
                      <div className="flex-1 min-h-0 flex flex-col gap-3">
                        {courseId ? (
                          <div className="shrink-0 flex flex-wrap items-center gap-3">
                            <button type="button" onClick={() => tryQuiz(selectedLesson)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                              ทดลองทำแบบทดสอบ
                            </button>
                            <p className="text-xs text-amber-600">ทดลองเหมือนผู้เรียน: ไม่บันทึกคะแนนและไม่แจ้งเตือนใคร</p>
                          </div>
                        ) : (
                          <p className="shrink-0 text-xs text-gray-400">บันทึกหลักสูตรก่อน จึงจะทดลองทำแบบทดสอบจริงได้</p>
                        )}
                        <div className="flex-1 min-h-0 flex flex-col">
                          <QuizPreviewInline key={selectedLesson.id} assessment={activeQuizAssessment} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">ยังไม่ได้เลือกชุดคำถามสำหรับบทเรียนนี้ — ไปที่การ์ด &quot;เลือกแบบฝึกหัด&quot; ด้านซ้ายเพื่อเลือก</p>
                    )
                  )}

                  {selectedLesson.type === 'personality' && (() => {
                    const def = getBucketAssessment(selectedLesson.bucketAssessmentId) ?? MBTI_DEFINITION
                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-400">
                          แบบประเมิน {def.questions.length} ข้อ ไม่มีคำตอบถูกผิดและไม่มีคะแนนผ่าน/ไม่ผ่าน ผลจะถูกบันทึกไว้ในโปรไฟล์ของผู้เรียน (ตอนทดลองจะไม่บันทึก)
                        </p>
                        {courseId ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <button type="button"
                              onClick={() => router.push(`/personality?assessment=${def.id}&courseId=${courseId}&lessonId=${selectedLesson.id}&preview=1`)}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">
                              ลองทำแบบประเมิน
                            </button>
                            <p className="text-xs text-amber-600">ทดลองเหมือนผู้เรียน: ผลไม่ถูกบันทึกในโปรไฟล์</p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">บันทึกหลักสูตรก่อน จึงจะลองทำแบบประเมินได้</p>
                        )}
                      </div>
                    )
                  })()}

                  {selectedLesson.type === 'assignment' && (
                    <div className="space-y-2">
                      {selectedLesson.assignmentPrompt
                        ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedLesson.assignmentPrompt}</p>
                        : <p className="text-xs text-gray-400">ยังไม่ได้กรอกคำสั่งการบ้าน</p>}
                      <textarea rows={4} disabled placeholder="พิมพ์คำตอบของคุณที่นี่..."
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 placeholder:text-gray-300 resize-none bg-gray-50" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Course Admin Picker (small multi-select) ──────────────────────────────────
function CourseAdminPicker({ users, selectedIds, onChange }: {
  users: UserProfile[]; selectedIds: string[]; onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Staged selection: checkbox toggles only update this draft; onChange commits
  // to the parent form only when ตกลง (Confirm) is pressed, so an accidental
  // click doesn't silently change course admins.
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds)
  const selected = users.filter((u) => selectedIds.includes(u.uid))
  const ref = useRef<HTMLDivElement>(null)

  // Clicking outside discards the in-progress draft, same as ยกเลิก.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = users.filter((u) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  function openPicker() {
    setDraftIds(selectedIds)
    setSearch('')
    setOpen(true)
  }

  function toggleDraft(uid: string) {
    setDraftIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]))
  }

  function confirm() {
    onChange(draftIds)
    setOpen(false)
  }

  function removeChip(uid: string) {
    onChange(selectedIds.filter((id) => id !== uid))
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((u) => (
          <span key={u.uid} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-freshket-100 border border-freshket-200 text-xs font-bold text-freshket-700">
            <span className="size-5 rounded-full bg-white overflow-hidden flex items-center justify-center shrink-0 text-xs">
              {u.photoURL ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" /> : u.displayName[0]}
            </span>
            {formatInstructorName(u)}
            <button type="button" onClick={() => removeChip(u.uid)} className="text-freshket-500 hover:text-rose-600 transition-colors">
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <button type="button" onClick={openPicker}
          className="size-7 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-freshket-400 hover:text-freshket-500 transition-all shrink-0">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อหรืออีเมล..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">ไม่พบพนักงาน</p>
              : filtered.map((u) => {
                const checked = draftIds.includes(u.uid)
                return (
                  <button key={u.uid} type="button" onClick={() => toggleDraft(u.uid)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${checked ? 'bg-freshket-50' : 'hover:bg-gray-50'}`}>
                    <span className={`size-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                      checked ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300'
                    }`}>
                      {checked && (
                        <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="size-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                      {u.photoURL ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" /> : u.displayName[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-800 truncate">{formatInstructorName(u)}</p>
                      <p className="text-xs text-gray-400 truncate">{u.department ?? u.email}</p>
                    </span>
                  </button>
                )
              })}
          </div>
          <div className="p-2 border-t border-gray-100 flex gap-2">
            <button type="button" onClick={() => setOpen(false)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 transition-colors">
              ยกเลิก
            </button>
            <button type="button" onClick={confirm}
              className="flex-1 px-3 py-1.5 rounded-lg bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-colors">
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// "Firstname Lastname (nickname)" — same English-name-first convention as
// IndividualAssignmentPanel's roster, since Thai display names aren't useful
// for matching against the HR system / English-language reporting.
function formatInstructorName(u: UserProfile): string {
  return formatPersonName(u)
}

// Searchable single-select for "ผู้สอน" — a native <select> can't show the
// department under each name or be filtered by typing, so this mirrors
// CourseAdminPicker's dropdown pattern (search box, click-outside-to-close)
// but commits a pick immediately instead of staging a multi-select draft.
function InstructorPicker({ users, value, onChange }: {
  users: UserProfile[]; value: string; onChange: (uid: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selectedUser = users.find((u) => u.uid === value)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? users.filter((u) =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.nickname ?? '').toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q))
    : users

  function pick(uid: string) {
    onChange(uid)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white text-left">
        {selectedUser ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="size-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
              {selectedUser.photoURL ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="size-full object-cover" /> : selectedUser.displayName?.[0]}
            </span>
            <span className="truncate text-gray-800">{formatInstructorName(selectedUser)}</span>
          </span>
        ) : (
          <span className="text-gray-400">ไม่ระบุ</span>
        )}
        <svg className={`size-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-full min-w-[260px] bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input type="text" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button type="button" onClick={() => pick('')}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${!value ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-400 hover:bg-gray-50'}`}>
              ไม่ระบุ
            </button>
            {filtered.length === 0
              ? <p className="text-xs text-gray-400 text-center py-4">ไม่พบพนักงาน</p>
              : filtered.map((u) => {
                const isSelected = u.uid === value
                return (
                  <button key={u.uid} type="button" onClick={() => pick(u.uid)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${isSelected ? 'bg-freshket-50' : 'hover:bg-gray-50'}`}>
                    <span className="size-6 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                      {u.photoURL ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" /> : u.displayName?.[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-freshket-700' : 'text-gray-800'}`}>{formatInstructorName(u)}</p>
                      {u.department && <p className="text-xs text-gray-400 truncate">{u.department}</p>}
                    </span>
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Assessment content preview ("ดูโจทย์") ────────────────────────────────────
// Admin-facing preview of what's actually inside the linked assessment, opened
// from the lesson quiz picker. A Google Form assessment has no questions[] to
// list (Google owns the response collection) so it embeds the form itself
// instead; a self-authored one lists every question — WITH the correct answer
// shown, unlike the learner-facing take page, because this is a pre-publish
// content check for whoever is wiring up the lesson, not an attempt.
function AssessmentPreviewContent({ assessment }: { assessment: Assessment }) {
  const isGoogleForm = !!assessment.googleFormUrl
  const [resolvedFormUrl, setResolvedFormUrl] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!isGoogleForm || !assessment.googleFormUrl?.includes('forms.gle')) return
    let cancelled = false
    setResolving(true)
    // Bounded so a slow/unreachable forms.gle (or a hung server-side fetch in
    // the API route) can't leave the spinner stuck forever — the effect always
    // falls through to the raw-link fallback within 10s.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    authedFetch('/api/resolve-form-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: assessment.googleFormUrl }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setResolvedFormUrl(json.resolvedUrl)
      })
      .catch(() => { /* falls back to showing the raw link below */ })
      .finally(() => { clearTimeout(timeout); if (!cancelled) setResolving(false) })
    return () => { cancelled = true; clearTimeout(timeout); controller.abort() }
  }, [isGoogleForm, assessment.googleFormUrl])

  const embedUrl = isGoogleForm ? toFormEmbedUrl(resolvedFormUrl ?? assessment.googleFormUrl ?? '') : null
  const sortedQuestions = assessment.questions.slice().sort((a, b) => a.order - b.order)

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-800">{assessment.title}</p>
        <p className="text-xs text-gray-400">{isGoogleForm ? 'Google Form' : `${sortedQuestions.length} ข้อ`}</p>
      </div>

      {isGoogleForm ? (
        resolving ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-16">
            <span className="size-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            กำลังตรวจสอบลิงก์แบบฟอร์ม...
          </div>
        ) : embedUrl ? (
          <div className="w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: '640px' }}>
            <iframe src={embedUrl} className="w-full h-full" title={assessment.title} style={{ border: 'none' }} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 text-sm text-gray-400 py-16">
            <p>ไม่สามารถแสดงตัวอย่างในหน้านี้ได้</p>
            {assessment.googleFormUrl && (
              <a href={assessment.googleFormUrl} target="_blank" rel="noopener noreferrer"
                className="text-freshket-600 font-bold hover:underline">เปิดลิงก์ Google Form</a>
            )}
          </div>
        )
      ) : sortedQuestions.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-gray-400 py-16">ชุดคำถามนี้ยังไม่มีคำถาม</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedQuestions.map((q, i) => (
            <div key={q.id} className="rounded-xl border border-gray-200 p-4 space-y-2.5 bg-white">
              <div className="flex items-center gap-2">
                <span className="size-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${QUESTION_TYPE_COLORS[q.type]}`}>{QUESTION_TYPE_LABELS[q.type]}</span>
                <span className="text-xs text-gray-400 ml-auto shrink-0">{q.points} pt</span>
              </div>
              <p className="text-sm font-bold text-gray-800">{q.text || <span className="text-gray-300 font-normal">(ยังไม่ได้กรอกคำถาม)</span>}</p>
              {q.description && <p className="text-xs text-gray-400">{q.description}</p>}

              {q.type === 'multiple_choice' && (
                <div className="space-y-1.5">
                  {q.choices?.map((c) => (
                    <div key={c.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${c.isCorrect ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-600'}`}>
                      {c.isCorrect ? (
                        <svg className="size-3.5 shrink-0 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border-2 border-gray-300" />
                      )}
                      <span className="truncate">{c.text || '(ยังไม่ได้กรอกตัวเลือก)'}</span>
                    </div>
                  ))}
                </div>
              )}

              {q.type === 'open_ended' && q.sampleAnswer && (
                <p className="text-xs text-gray-500 italic">เฉลย (อ้างอิง): {q.sampleAnswer}</p>
              )}

              {q.type === 'drag_drop' && (
                <div className="space-y-1">
                  {q.dragPairs?.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="px-2 py-1 rounded-lg bg-gray-100 font-bold shrink-0 truncate max-w-[45%]">{p.left || '—'}</span>
                      <svg className="size-3.5 text-gray-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                      </svg>
                      <span className="px-2 py-1 rounded-lg bg-freshket-50 text-freshket-700 font-bold flex-1 truncate">{p.right || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lesson Editor (right pane of the Lessons tab) ─────────────────────────────
// Edits video / file / link / assignment lessons with a live preview on the
// right. Quiz lessons are handled entirely by the "แบบทดสอบ" tab instead
// (see QuizSettingsTab / QuizStripPreview) and never reach this component.
function LessonEditor({ lesson, index, assessments, onChange, onDelete }: {
  /** Position in its topic: what an unnamed lesson is called. */
  index: number
  lesson: CourseLesson; assessments: Assessment[]
  onChange: (patch: Partial<CourseLesson>) => void
  onDelete: () => void
}) {
  // Quiz lessons never reach this editor — they are system-managed and hidden
  // from the Lessons tab entirely (see LessonsBuilder / QuizStripPreview), so
  // this only ever edits video / file / link / assignment. The right column
  // shows a live preview of whatever is currently filled in on the left.

  // URL fields are drafted locally and only committed to lesson state (and
  // thus the preview) when the user clicks "บันทึกลิงก์" — typing a partial
  // URL must not thrash the iframe on every keystroke.
  const [videoUrlDraft, setVideoUrlDraft] = useState(lesson.videoUrl ?? '')
  const [fileUrlDraft, setFileUrlDraft] = useState(lesson.fileUrl ?? '')
  useEffect(() => { setVideoUrlDraft(lesson.videoUrl ?? '') }, [lesson.id, lesson.videoUrl])
  useEffect(() => { setFileUrlDraft(lesson.fileUrl ?? '') }, [lesson.id, lesson.fileUrl])

  // A saved Google Slide URL is locked (read-only, grayed) until the user
  // explicitly clicks the edit-pencil icon — guards against accidentally
  // retyping over a working link. Unlocks automatically when there's nothing
  // saved yet, and re-locks whenever the lesson selection changes.
  const [fileUrlUnlocked, setFileUrlUnlocked] = useState(false)
  useEffect(() => { setFileUrlUnlocked(false) }, [lesson.id])
  const fileUrlLocked = !!(lesson.fileUrl && !fileUrlUnlocked)

  const embedUrl = lesson.type === 'video' ? toPreviewEmbedUrl(lesson.videoUrl ?? '')
    : lesson.type === 'file' ? toPreviewEmbedUrl(lesson.fileUrl ?? '')
    : null

  // The MBTI questionnaire is system-managed like the quiz lessons: its
  // questions live in code, not in this form, so there is nothing here to edit.
  // Showing the ordinary editor would offer a format picker and a URL field
  // that would only break it.
  if (lesson.type === 'personality') {
    const def = getBucketAssessment(lesson.bucketAssessmentId) ?? MBTI_DEFINITION
    const questions = def.questions.slice().sort((a, b) => a.order - b.order)
    return (
      <div className="h-full flex gap-6">
        <div className="w-[31.25rem] shrink-0 space-y-5 overflow-y-auto pr-1">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700">
              แบบประเมินผลลัพธ์
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-start gap-2">
            <svg className="size-4 shrink-0 mt-0.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-gray-500">
              แบบประเมินประเภทนี้ไม่มีคำตอบถูกผิดและไม่มีคะแนน — ผลลัพธ์มาจากตัวเลือกที่ผู้เรียนเลือกมากที่สุด
              ชุดคำถามเป็นชุดมาตรฐานของระบบ จึงแก้ไขคำถามที่นี่ไม่ได้
            </p>
          </div>

          {/* Which questionnaire this lesson runs. */}
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-2">เลือกแบบประเมิน</label>
            <div className="space-y-2">
              {BUCKET_ASSESSMENT_LIST.map((d) => {
                const active = d.id === def.id
                return (
                  <button key={d.id} type="button"
                    onClick={() => onChange({ bucketAssessmentId: d.id, title: d.title })}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      active
                        ? 'border-freshket-300 bg-freshket-50'
                        : 'border-gray-200 bg-white hover:border-freshket-200 hover:bg-gray-50'
                    }`}>
                    <span className="flex items-start gap-2.5">
                      <span className={`shrink-0 size-4 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        active ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300'
                      }`}>
                        {active && (
                          <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm font-bold ${active ? 'text-freshket-700' : 'text-gray-700'}`}>{d.title}</span>
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {d.questions.length} ข้อ · ผลลัพธ์ {d.outcomes.length} แบบ
                        </span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-white p-3.5">
              <p className="text-xs text-gray-400 mb-1">จำนวนคำถาม</p>
              <p className="text-sm font-bold text-gray-800">{questions.length} ข้อ</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3.5">
              <p className="text-xs text-gray-400 mb-1">ผลลัพธ์ที่เป็นไปได้</p>
              <p className="text-sm font-bold text-gray-800">{def.outcomes.length} แบบ</p>
              <p className="text-xs text-gray-400 mt-1">
                {def.outcomes.map((o) => o.title).join(' · ')}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-3.5">
              <p className="text-xs text-gray-400 mb-1">การให้คะแนน</p>
              <p className="text-sm font-bold text-gray-800">ไม่มีคะแนนผ่าน/ไม่ผ่าน</p>
              <p className="text-xs text-gray-400 mt-1">
                ผลจะถูกบันทึกในโปรไฟล์ของผู้เรียน ไม่นำไปคิดรวมกับคะแนนแบบทดสอบ
              </p>
            </div>
          </div>
        </div>

        {/* Right: the questions themselves, read-only, so an admin can see
            exactly what the learner will be asked. */}
        <div className="flex-1 min-w-0 overflow-y-auto border-l border-gray-100 pl-6">
          <p className="text-sm font-bold text-gray-800 mb-1">ตัวอย่างคำถาม</p>
          <p className="text-xs text-gray-400 mb-4">ผู้เรียนจะเห็นทีละข้อ</p>
          <div className="space-y-3">
            {questions.map((q, i) => {
              const dim = def.dimensions.find((d) => d.id === q.dimensionId)
              return (
                <div key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="size-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    {dim && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">{dim.label}</span>
                    )}
                  </div>
                  {q.text && <p className="text-sm font-bold text-gray-800 mb-2">{q.text}</p>}
                  {q.likert ? (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-gray-400 shrink-0">เห็นด้วย</span>
                      <div className="flex-1 flex items-center justify-between gap-1">
                        {q.options.map((_, oi) => (
                          <span key={oi}
                            className="shrink-0 rounded-full border-2 border-gray-300"
                            style={{ width: 12 + Math.abs(oi - (q.options.length - 1) / 2) * 3, height: 12 + Math.abs(oi - (q.options.length - 1) / 2) * 3 }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">ไม่เห็นด้วย</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {q.options.map((o) => (
                        <div key={o.id} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-xs text-gray-600">
                          <span className="shrink-0 size-3.5 rounded-full border-2 border-gray-300 mt-0.5" />
                          <span className="flex-1 leading-relaxed">{o.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex gap-6">
      <div className="w-[31.25rem] shrink-0 space-y-5 overflow-y-auto pr-1">
      {/* Format cards — large tile selector */}
      <div>
        <label className="text-xs font-bold text-gray-600 block mb-2">รูปแบบบทเรียน</label>
        <div className="grid grid-cols-2 gap-2.5">
          {LESSON_TYPES.map((t) => {
            const active = lesson.type === t
            return (
              <button key={t} type="button" onClick={() => onChange({ type: t })}
                className={`flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border-2 transition-all ${
                  active
                    ? 'border-freshket-200 bg-freshket-100 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-freshket-300 hover:bg-gray-50'
                }`}>
                <span className={`size-11 rounded-xl flex items-center justify-center transition-colors ${
                  active ? 'bg-white text-freshket-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <LessonTypeIcon type={t} className="size-6" />
                </span>
                <span className={`text-xs font-bold text-center leading-tight ${active ? 'text-freshket-700' : 'text-gray-500'}`}>
                  {LESSON_TYPE_LABELS[t]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อบทเรียน <span className="font-normal text-gray-400">(เว้นว่างไว้ = เรียงเลขตามลำดับอัตโนมัติ)</span></label>
        <input type="text" value={isUnnamedLesson(lesson.title) ? '' : lesson.title} onChange={(e) => onChange({ title: e.target.value })}
          placeholder={defaultLessonLabel(index)}
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
        />
      </div>

      {lesson.type === 'video' && (
        <>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">รูปแบบวิดีโอ</label>
            <select value={lesson.videoProvider ?? 'youtube'} onChange={(e) => onChange({ videoProvider: e.target.value as 'youtube' | 'google_drive' })}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
              <option value="youtube">YouTube</option>
              <option value="google_drive">Google Drive</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">{lesson.videoProvider === 'google_drive' ? 'Google Drive URL' : 'YouTube URL'}<span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-2">
              <input type="url" value={videoUrlDraft} onChange={(e) => setVideoUrlDraft(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
              />
              <button type="button" onClick={() => onChange({ videoUrl: videoUrlDraft })}
                disabled={videoUrlDraft === (lesson.videoUrl ?? '')}
                className="shrink-0 px-3 py-2.5 text-xs font-bold rounded-xl bg-freshket-100 text-freshket-700 border border-freshket-200 hover:bg-freshket-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-freshket-100">
                บันทึกลิงก์
              </button>
            </div>
          </div>
        </>
      )}

      {lesson.type === 'article' && (
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1.5">เนื้อหาบทความ</label>
          <textarea rows={8} value={lesson.articleBody ?? ''} onChange={(e) => onChange({ articleBody: e.target.value })}
            placeholder="พิมพ์เนื้อหาบทความที่นี่..."
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
          />
        </div>
      )}

      {lesson.type === 'file' && (
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-600 block">Google Slide URL</label>
          <div className="flex items-center gap-2">
            <input type="url" value={fileUrlDraft} onChange={(e) => setFileUrlDraft(e.target.value)}
              readOnly={fileUrlLocked}
              disabled={fileUrlLocked}
              placeholder="https://docs.google.com/presentation/d/..."
              className={`flex-1 min-w-0 px-3 py-2.5 text-sm rounded-xl border font-mono ${
                fileUrlLocked
                  ? 'border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed select-none'
                  : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300'
              }`}
            />
            {fileUrlLocked ? (
              <button type="button" onClick={() => setFileUrlUnlocked(true)} title="แก้ไขลิงก์"
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold rounded-xl bg-freshket-100 text-freshket-700 border border-freshket-200 hover:bg-freshket-200 transition-all">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 4.5l3.75 3.75" />
                </svg>
                แก้ไขลิงก์
              </button>
            ) : (
              <button type="button" onClick={() => { onChange({ fileUrl: fileUrlDraft }); setFileUrlUnlocked(false) }}
                disabled={!fileUrlDraft.trim()}
                className="shrink-0 px-3 py-2.5 text-xs font-bold rounded-xl bg-freshket-100 text-freshket-700 border border-freshket-200 hover:bg-freshket-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-freshket-100">
                บันทึกลิงก์
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {fileUrlLocked
              ? 'ลิงก์นี้ถูกบันทึกแล้วและล็อกไว้กันแก้ไขพลาด — กด "แก้ไขลิงก์" ด้านขวาเพื่อเปลี่ยนลิงก์'
              : 'วางลิงก์ Google Slides (ตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์" ก่อน) กดบันทึกลิงก์เพื่ออัปเดตตัวอย่าง — ไฟล์ประเภทอื่นที่แชร์ลิงก์แบบสาธารณะยังเปิดได้ แต่จะเปิดเป็นแท็บใหม่แทน'}
          </p>
        </div>
      )}

      {lesson.type === 'link' && (
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1.5">URL ลิงก์ภายนอก</label>
          <input type="url" value={lesson.linkUrl ?? ''} onChange={(e) => onChange({ linkUrl: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
          />
        </div>
      )}

      {lesson.type === 'assignment' && (
        <div>
          <label className="text-xs font-bold text-gray-600 block mb-1.5">โจทย์การบ้าน</label>
          <textarea rows={6} value={lesson.assignmentPrompt ?? ''} onChange={(e) => onChange({ assignmentPrompt: e.target.value })}
            placeholder="อธิบายโจทย์การบ้านที่ผู้เรียนต้องทำ..."
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-bold text-gray-600 block mb-1.5">คำอธิบาย (ถ้ามี)</label>
        <textarea rows={2} value={lesson.description ?? ''} onChange={(e) => onChange({ description: e.target.value })}
          placeholder="กรอกคำอธิบายบทเรียน"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
        />
      </div>

      <div className="pt-2 border-t border-gray-100">
        <button type="button" onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 transition-all">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          ลบบทเรียนนี้
        </button>
      </div>
      </div>

      {/* Right: a small fixed-size preview window — capped, not stretched to
          the pane's full height, so it reads as a thumbnail of the embed a
          learner would see rather than taking over the layout. */}
      <div className="flex-1 min-w-0 overflow-y-auto border-l border-gray-100 pl-6">
        {lesson.type === 'video' || lesson.type === 'file' ? (
          embedUrl ? (
            <div className="w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ aspectRatio: '16/9' }}>
              <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={lesson.title || 'preview'} style={{ border: 'none' }} />
            </div>
          ) : (
            <div className="w-full rounded-xl border border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-sm text-gray-300 text-center px-6 py-10" style={{ aspectRatio: '16/9' }}>
              <svg className="size-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs">{lesson.type === 'video' ? (lesson.videoUrl ? 'ไม่สามารถแสดงตัวอย่างวิดีโอนี้ได้' : 'วางลิงก์วิดีโอทางซ้ายเพื่อดูตัวอย่าง') : (lesson.fileUrl ? 'ไม่สามารถแสดงตัวอย่าง Google Slide นี้ได้ — ตรวจสอบว่าตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์" แล้ว' : 'วางลิงก์ Google Slide ทางซ้ายเพื่อดูตัวอย่าง')}</p>
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-300">
            บทเรียนประเภทนี้ไม่มีตัวอย่างแสดงผล
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lessons Builder (topics + lessons, two-pane) ──────────────────────────────
// ── Quiz tab (course builder sidebar) ────────────────────────────────────────
// One row per quiz lesson in the course. Each row is switched on by its own
// toggle; switching it on is what assigns a pre/post role, picks the source
// (internal or Google Form) and reveals the timer / anti-cheat settings.
//
// Two different stores are written from here, which is why saving is split:
//   · quizRole lives on the LESSON, part of the unsaved course draft — applied
//     immediately through onChangeTopics, committed by the course's own save.
//   · timeLimitMinutes / antiCheatEnabled live on the ASSESSMENT document,
//     shared by every course that links it, so they go straight to Firestore.
// Quiz lessons are system-managed, not authored by hand. Given the course's
// topics, returns them with exactly the quiz lessons the settings imply:
// a post-test pinned to the very end, and — when `withPreTest` — a pre-test
// pinned to the very front. Existing quiz lessons are reused (so the linked
// assessment and title survive a toggle) rather than recreated.
function withQuizLessons(topics: CourseTopic[], withPreTest: boolean): CourseTopic[] {
  const existing = topics.flatMap((t) => t.lessons).filter((l) => l.type === 'quiz')
  const keptPre = existing.find((l) => l.quizRole === 'pre_test')
  // Any quiz that is not the pre-test can serve as the post-test; prefer one
  // already tagged, else reuse whatever quiz lesson is left over.
  const keptPost = existing.find((l) => l.quizRole === 'post_test')
    ?? existing.find((l) => l.id !== keptPre?.id)

  // Both sittings must run the SAME assessment for the before/after scores to
  // be comparable, so a newly created lesson inherits whichever one is already
  // linked rather than starting empty.
  const linkedAssessmentId = (keptPost ?? keptPre)?.assessmentId

  // keptPost may be a lesson recycled from the OTHER role (see keptPost's
  // fallback above) — if its title is still the untouched default for that
  // other role, relabel it so it doesn't keep reading "Pre-Test" once it's
  // serving as the post-test (or vice versa). A title the user actually
  // edited is left alone.
  const preLesson: CourseLesson = {
    ...(keptPre ?? { id: makeId(), title: 'Pre-Test', type: 'quiz' as const, order: 0 }),
    type: 'quiz', quizRole: 'pre_test', assessmentId: linkedAssessmentId,
    title: keptPre?.title && keptPre.title !== 'Post-Test' ? keptPre.title : 'Pre-Test',
  }
  const postLesson: CourseLesson = {
    ...(keptPost ?? { id: makeId(), title: 'Post-Test', type: 'quiz' as const, order: 0 }),
    type: 'quiz', quizRole: 'post_test', assessmentId: linkedAssessmentId,
    title: keptPost?.title && keptPost.title !== 'Pre-Test' ? keptPost.title : 'Post-Test',
  }

  // Strip every existing quiz lesson, then re-insert at the two ends.
  const stripped = topics.map((t) => ({
    ...t,
    lessons: t.lessons.filter((l) => l.type !== 'quiz').map((l, i) => ({ ...l, order: i })),
  }))
  if (stripped.length === 0) {
    return [{
      id: makeId(), title: 'แบบทดสอบ', order: 0,
      lessons: (withPreTest ? [preLesson, postLesson] : [postLesson]).map((l, i) => ({ ...l, order: i })),
    }]
  }

  const out = stripped.map((t) => ({ ...t, lessons: [...t.lessons] }))
  if (withPreTest) {
    out[0].lessons = [preLesson, ...out[0].lessons]
  }
  out[out.length - 1].lessons = [...out[out.length - 1].lessons, postLesson]
  return out.map((t) => ({ ...t, lessons: t.lessons.map((l, i) => ({ ...l, order: i })) }))
}

function QuizSettingsTab({ enabled, topics, onChangeTopics, assessments }: {
  enabled: boolean
  topics: CourseTopic[]
  onChangeTopics: (t: CourseTopic[]) => void
  assessments: Assessment[]
}) {
  // The course's quiz lessons are system-managed (see withQuizLessons): a
  // post-test at the end, plus a pre-test at the front when enabled. The card
  // configures the post-test — the pre-test sits the same assessment, so
  // there is nothing separate to configure for it.
  const allQuizLessons = topics
    .flatMap((t) => t.lessons.map((l) => ({ topic: t, lesson: l })))
    .filter(({ lesson }) => lesson.type === 'quiz')
  const postEntry = allQuizLessons.find(({ lesson }) => lesson.quizRole === 'post_test') ?? allQuizLessons[0]
  const hasPreTest = allQuizLessons.some(({ lesson }) => lesson.quizRole === 'pre_test')

  // Adding/removing the pre-test rebuilds the quiz lessons so it lands at the
  // front of the course, rather than wherever it happened to be.
  function setPreTestEnabled(next: boolean) {
    onChangeTopics(withQuizLessons(topics, next))
  }

  // Both sittings use the SAME assessment — that is what makes the before/
  // after scores comparable — so this writes to every quiz lesson at once.
  function setQuizAssessment(assessmentId: string | undefined) {
    onChangeTopics(topics.map((t) => ({
      ...t,
      lessons: t.lessons.map((l) => (l.type === 'quiz' ? { ...l, assessmentId } : l)),
    })))
  }

  // Nothing to show when the quiz is off — the sidebar switch is the only
  // control that matters, so an empty-state card here would just be a second
  // way to say what the switch already says.
  if (!enabled) return null

  return (
    <div className="w-full px-6 py-8 space-y-4">
      <p className="text-xs text-gray-400">
        คอร์สนี้ใช้แบบทดสอบหลังเรียน — หากต้องการให้ผู้เรียนทำชุดเดียวกันนี้ก่อนเรียนด้วย เพื่อเทียบคะแนนก่อน-หลัง ให้เปิด &ldquo;ใช้เป็นแบบทดสอบก่อนเรียน&rdquo;
      </p>
      {postEntry && (
        <QuizLessonSettingsCard
          key={postEntry.lesson.id}
          topicTitle={postEntry.topic.title}
          lesson={postEntry.lesson}
          assessments={assessments}
          hasPreTest={hasPreTest}
          onSetPreTest={setPreTestEnabled}
          onSetAssessment={setQuizAssessment}
        />
      )}
    </div>
  )
}

function QuizLessonSettingsCard({
  topicTitle, lesson, assessments, hasPreTest,
  onSetPreTest, onSetAssessment,
}: {
  topicTitle: string
  lesson: CourseLesson
  assessments: Assessment[]
  hasPreTest: boolean
  onSetPreTest: (next: boolean) => void
  onSetAssessment: (assessmentId: string | undefined) => void
}) {
  const router = useRouter()
  const currentAssessment = assessments.find((a) => a.id === lesson.assessmentId)
  const [source, setSource] = useState<'self' | 'google_form'>(
    currentAssessment?.googleFormUrl ? 'google_form' : 'self',
  )
  const [search, setSearch] = useState('')

  // /assessment is a full page, not a modal — navigating there leaves this
  // course draft behind unsaved (CourseFormModal's form state isn't
  // persisted). Confirm first so a stray click doesn't silently lose an
  // in-progress edit.
  async function handleCreateNewAssessment() {
    const ok = await confirmAction({
      title: 'ออกจากหน้าแก้ไขหลักสูตร?',
      text: 'การเปลี่ยนแปลงที่ยังไม่ได้บันทึกในหลักสูตรนี้จะหายไป — สร้างแบบทดสอบเสร็จแล้วค่อยกลับมาเลือกได้',
      confirmText: 'ไปสร้างแบบทดสอบ',
      cancelText: 'อยู่หน้านี้ต่อ',
      danger: true,
    })
    if (ok) router.push('/assessment')
  }

  // Assessment-level settings, written straight to Firestore on save.
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('0')
  const [antiCheatEnabled, setAntiCheatEnabled] = useState(false)
  const [description, setDescription] = useState('')
  useEffect(() => {
    setTitle(currentAssessment?.title ?? '')
    setTimeLimitMinutes(String(currentAssessment?.timeLimitMinutes ?? 0))
    setAntiCheatEnabled(currentAssessment?.antiCheatEnabled ?? false)
    setDescription(currentAssessment?.description ?? '')
  }, [currentAssessment?.id, currentAssessment?.title, currentAssessment?.timeLimitMinutes,
    currentAssessment?.antiCheatEnabled, currentAssessment?.description])

  // "ใช้เป็นแบบทดสอบก่อนเรียน": ON means the learner also sits this quiz
  // BEFORE the course, so the pair produces a before/after score; OFF leaves
  // it as the post-test only. Same lesson either way — this only widens or
  // narrows when it is taken, so there is no tag to move between lessons.
  function handleSetRole(next: boolean) {
    onSetPreTest(next)
  }

  // Swapping the linked assessment changes what learners already in progress
  // see next time they open this lesson — confirm before committing.
  async function handlePickAssessment(a: Assessment, active: boolean) {
    if (active) { onSetAssessment(undefined); return }
    if (lesson.assessmentId) {
      const ok = await confirmAction({
        title: 'เปลี่ยนแบบทดสอบของบทเรียนนี้?',
        text: `จาก "${currentAssessment?.title ?? '(ไม่พบแบบทดสอบนี้แล้ว)'}" เป็น "${a.title}"`,
        confirmText: 'ยืนยันเปลี่ยน',
        cancelText: 'ยกเลิก',
      })
      if (!ok) return
    }
    onSetAssessment(a.id)
  }

  async function handleSaveSettings() {
    if (!currentAssessment) return
    if (!title.trim()) {
      void alertError('กรอกชื่อแบบทดสอบก่อน', 'ชื่อแบบทดสอบเป็นสิ่งที่ผู้เรียนเห็นก่อนเริ่มทำ')
      return
    }
    setSaving(true)
    try {
      // passingScore is intentionally absent: it is owned by the assessment
      // editor. Writing it from here would push this screen's stale copy over
      // a value the quiz author may have just changed.
      await patch('assessments', currentAssessment.id, {
        title: title.trim(),
        timeLimitMinutes: Number(timeLimitMinutes) || 0,
        antiCheatEnabled,
        description: description.trim(),
      })
    } catch (e) {
      void alertError('บันทึกการตั้งค่าไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const isPreTest = hasPreTest
  // Unpublished assessments are drafts — a learner opening the lesson would hit
  // a 403 from /api/assessment/[id]/take, so they must not be selectable here.
  const filtered = assessments
    .filter((a) => a.isPublished)
    .filter((a) => (source === 'google_form' ? !!a.googleFormUrl : !a.googleFormUrl))
    .filter((a) => a.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="rounded-2xl border border-freshket-200 bg-white shadow-sm transition-all">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 truncate">{topicTitle}</p>
        </div>
        <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700">
          {isPreTest ? 'Pre-Test + Post-Test' : 'Post-Test'}
        </span>
      </div>

      <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">

          {/* Source tab — which kind of assessment this lesson uses. */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            <button type="button" onClick={() => setSource('self')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${source === 'self' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              สร้างเอง (Internal)
            </button>
            <button type="button" onClick={() => setSource('google_form')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${source === 'google_form' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Google Form
            </button>
          </div>

          <div>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาแบบทดสอบ..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300 mb-1.5"
            />
            <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-1.5 bg-gray-50/50">
              {filtered.length === 0
                ? (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-xs text-gray-400">ไม่พบแบบทดสอบ{source === 'google_form' ? 'ชนิด Google Form' : 'ที่สร้างเอง'}</p>
                    <button type="button" onClick={handleCreateNewAssessment}
                      className="text-xs font-bold text-freshket-600 hover:text-freshket-700 hover:underline">
                      + สร้างแบบทดสอบใหม่
                    </button>
                  </div>
                )
                : filtered.map((a) => {
                  const active = lesson.assessmentId === a.id
                  return (
                    <button key={a.id} type="button" onClick={() => handlePickAssessment(a, active)}
                      className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                        active ? 'bg-freshket-100 text-freshket-700 font-bold border-freshket-300' : 'bg-white hover:bg-gray-100 text-gray-700 border-transparent'
                      }`}>
                      <span className={`shrink-0 size-4 rounded-full border-2 flex items-center justify-center ${active ? 'border-freshket-500 bg-freshket-500' : 'border-gray-300'}`}>
                        {active && <svg className="size-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" /></svg>}
                      </span>
                      <span className="flex-1 truncate">{a.title}</span>
                      <span className="text-gray-400 shrink-0">({a.questions.length} ข้อ)</span>
                    </button>
                  )
                })}
            </div>
          </div>

          {currentAssessment ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อแบบทดสอบ <span className="text-rose-500">*</span></label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    placeholder="เช่น แบบทดสอบเริ่มต้นใช้งานสำหรับพนักงาน"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1.5">เวลาในการทำแบบทดสอบ</label>
                  <div className="relative">
                    <input type="number" min={0} value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-freshket-500 pr-12" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">นาที</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">ใส่ 0 = ไม่จำกัดเวลา</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-gray-600">ใช้เป็นแบบทดสอบก่อนเรียน</label>
                  <InfoTooltip text="ผู้เรียนจะต้องทำแบบทดสอบนี้ทั้งก่อนเริ่มเรียนและหลังเรียนจบครบทุกบทเรียนแล้ว หากไม่เปิดใช้งานส่วนนี้ แบบทดสอบนี้จะถูกใช้เพื่อทดสอบหลังเรียนเพียงอย่างเดียว" />
                </div>
                <button type="button" onClick={() => handleSetRole(!isPreTest)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 shrink-0 ${isPreTest ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${isPreTest ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 -mt-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <label className="text-xs font-bold text-gray-600">ระบบป้องกันการทุจริต (Anti-Cheat)</label>
                  <InfoTooltip text="บังคับเข้าโหมดเต็มจอ ห้ามสลับแท็บ/หน้าต่างระหว่างทำแบบทดสอบ ระบบแจ้งเตือนทุกครั้งที่ตรวจพบการสลับหน้าจอ และส่งคำตอบอัตโนมัติเมื่อแจ้งเตือนครบ 3 ครั้ง" />
                </div>
                <button type="button" onClick={() => setAntiCheatEnabled((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 shrink-0 ${antiCheatEnabled ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${antiCheatEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">คำอธิบายแบบทดสอบ</label>
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="กรอกคำอธิบายแบบทดสอบ"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">แสดงให้ผู้เรียนเห็นก่อนเริ่มทำแบบทดสอบ</p>
              </div>

              {/* The pass threshold is deliberately NOT editable here. It is set
                  once where the quiz itself is authored (แบบทดสอบ → สร้าง/แก้ไข)
                  and a second input for the same assessment field just invites
                  the two screens to disagree. The current value is shown
                  read-only so the setting is still visible in context. */}
              {!currentAssessment.googleFormUrl && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-xs font-bold text-gray-600">เกณฑ์ผ่าน</label>
                    <InfoTooltip text="ตั้งค่าได้ที่หน้าแบบทดสอบ (เมนู ⋮ → แก้ไข) เพื่อไม่ให้ตั้งซ้ำสองที่" />
                  </div>
                  {/* Same weight/colour the assessment table uses for this
                      value, so the two screens read as one setting. */}
                  <span className="shrink-0 text-sm font-normal text-gray-600">
                    {currentAssessment.passingScore}%
                  </span>
                </div>
              )}

              {/* These fields belong to the assessment document, not the
                  course draft, so they need their own save — the course's
                  "บันทึกการแก้ไข" button never touches them. */}
              <button type="button" onClick={handleSaveSettings} disabled={saving}
                className="w-full py-2.5 rounded-xl bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                {saving
                  ? <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าแบบทดสอบ'}
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400">เลือกแบบทดสอบก่อน จึงจะตั้งค่ารายละเอียดได้</p>
          )}
      </div>
    </div>
  )
}

// Quiz lessons are hidden from this builder entirely: they are created and
// positioned by the "แบบทดสอบ" switch, and configured in that tab. Showing
// them here would invite reordering or deleting a lesson the system owns. They
// are stripped on the way in and re-attached on the way out, so an edit to the
// content lessons never drops them.
// Read-only view of a system-managed quiz lesson, opened from its strip in
// the Lessons tab. Shows the same settings the "แบบทดสอบ" tab edits — name,
// timer, anti-cheat, description, passing score, source — plus the full
// question/choice content via AssessmentPreviewContent, but nothing here is
// editable: that avoids two places writing to the same assessment document
// with different validation (the tab enforces the 0-100 passing-score range
// and the non-empty title; this view must not bypass that).
function QuizStripPreview({ lesson, role, assessments }: {
  lesson?: CourseLesson
  role: 'pre' | 'post'
  assessments: Assessment[]
}) {
  const assessment = assessments.find((a) => a.id === lesson?.assessmentId)
  const roleLabel = role === 'pre' ? 'Pre-Test' : 'Post-Test'

  return (
    <div className="h-full flex gap-6">
      {/* Left: read-only settings summary — fixed width so the question
          preview on the right gets the room it needs to lay out its own grid.
          Matches the lesson-format editor's left column width (w-[31.25rem]) so
          the two preview panes read as the same layout. */}
      <div className="w-[31.25rem] shrink-0 space-y-5 overflow-y-auto">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700">
            {roleLabel}
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-start gap-2">
          <svg className="size-4 shrink-0 mt-0.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-gray-500">
            บทเรียนนี้จัดการโดยระบบ ({roleLabel}) แก้ไขชื่อ เวลา Anti-Cheat คำอธิบาย เกณฑ์ผ่าน และแบบทดสอบที่ใช้ ได้ที่แท็บ &quot;แบบทดสอบ&quot;
          </p>
        </div>

        {!assessment ? (
          <p className="text-sm text-gray-400">ยังไม่ได้เลือกแบบทดสอบ — ไปที่แท็บ &quot;แบบทดสอบ&quot; เพื่อเลือก</p>
        ) : (
          <>
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                <p className="text-xs text-gray-400 mb-1">ชื่อแบบทดสอบ</p>
                <p className="text-sm font-bold text-gray-800 truncate">{assessment.title}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                <p className="text-xs text-gray-400 mb-1">แหล่งแบบทดสอบ</p>
                <p className="text-sm font-bold text-gray-800">{assessment.googleFormUrl ? 'Google Form' : 'สร้างเอง (Internal)'}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                <p className="text-xs text-gray-400 mb-1">เวลาในการทำแบบทดสอบ</p>
                <p className="text-sm font-bold text-gray-800">{Number(assessment.timeLimitMinutes) > 0 ? `${assessment.timeLimitMinutes} นาที` : 'ไม่จำกัดเวลา'}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-gray-400">ระบบป้องกันการทุจริต</p>
                  <InfoTooltip text="บังคับเข้าโหมดเต็มจอ ห้ามสลับแท็บ/หน้าต่างระหว่างทำแบบทดสอบ ระบบแจ้งเตือนทุกครั้งที่ตรวจพบการสลับหน้าจอ และส่งคำตอบอัตโนมัติเมื่อแจ้งเตือนครบ 3 ครั้ง" />
                </div>
                <p className="text-sm font-bold text-gray-800">{assessment.antiCheatEnabled ? 'เปิด' : 'ปิด'}</p>
              </div>
              {!assessment.googleFormUrl && (
                <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                  <p className="text-xs text-gray-400 mb-1">ทำซ้ำเมื่อสอบไม่ผ่าน</p>
                  <p className="text-sm font-bold text-gray-800">{assessment.allowRetakeOnFail === false ? 'ไม่อนุญาต' : 'อนุญาต'}</p>
                </div>
              )}
              {!assessment.googleFormUrl && (
                <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                  <p className="text-xs text-gray-400 mb-1">เกณฑ์ผ่าน</p>
                  <p className="text-sm font-bold text-gray-800">{assessment.passingScore}%</p>
                </div>
              )}
            </div>
            {assessment.description && (
              <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                <p className="text-xs text-gray-400 mb-1">คำอธิบายแบบทดสอบ</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{assessment.description}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: the actual question/choice content, or the Google Form embed. */}
      <div className="flex-1 min-w-0 overflow-y-auto border-l border-gray-100 pl-6">
        {assessment ? (
          <AssessmentPreviewContent assessment={assessment} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-300">
            เลือกแบบทดสอบก่อนเพื่อดูตัวอย่าง
          </div>
        )}
      </div>
    </div>
  )
}

function LessonsBuilder({ topics: allTopics, onChange: onChangeAll, assessments }: {
  topics: CourseTopic[]; onChange: (t: CourseTopic[]) => void; assessments: Assessment[]
}) {
  const topics = useMemo(
    () => allTopics.map((t) => ({ ...t, lessons: t.lessons.filter((l) => l.type !== 'quiz') })),
    [allTopics],
  )
  // Shown as read-only strips bracketing the topic list — quiz lessons are
  // created and positioned by the "แบบทดสอบ" tab, not edited here, but an
  // admin scanning the Lessons tab should still see that the course opens and
  // closes with one, matching the actual learner-facing order.
  const preTestLesson = allTopics.flatMap((t) => t.lessons).find((l) => l.quizRole === 'pre_test')
  const postTestLesson = allTopics.flatMap((t) => t.lessons).find((l) => l.quizRole === 'post_test')
  function onChange(next: CourseTopic[]) {
    const quizzes = allTopics.flatMap((t) => t.lessons).filter((l) => l.type === 'quiz')
    const pre = quizzes.find((l) => l.quizRole === 'pre_test')
    const post = quizzes.find((l) => l.quizRole !== 'pre_test')
    if (next.length === 0 || (!pre && !post)) { onChangeAll(next); return }
    const out = next.map((t) => ({ ...t, lessons: [...t.lessons] }))
    if (pre) out[0].lessons = [pre, ...out[0].lessons]
    if (post) out[out.length - 1].lessons = [...out[out.length - 1].lessons, post]
    onChangeAll(out.map((t) => ({ ...t, lessons: t.lessons.map((l, i) => ({ ...l, order: i })) })))
  }

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // Which quiz strip (if any) is open for read-only preview — selecting
  // one clears the normal lesson selection and vice versa, since the right
  // pane shows either a lesson editor or a quiz preview, never both.
  const [selectedQuiz, setSelectedQuiz] = useState<'pre' | 'post' | null>(null)
  const [dragTopic, setDragTopic] = useState<number | null>(null)
  const [dragLesson, setDragLesson] = useState<{ topicId: string; index: number } | null>(null)
  const [dropTopic, setDropTopic] = useState<number | null>(null)

  function addTopic() {
    const t: CourseTopic = { id: makeId(), title: '', order: topics.length, lessons: [] }
    onChange([...topics, t])
  }
  function updateTopic(id: string, patch: Partial<CourseTopic>) {
    onChange(topics.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  // Deleting a topic takes every lesson inside it, so the count goes in the
  // prompt — "ลบหัวข้อนี้?" alone hides how much is about to disappear. An empty
  // topic has nothing to lose, so that case deletes straight away rather than
  // training people to click through a dialog that never matters.
  async function removeTopic(id: string) {
    const topic = topics.find((t) => t.id === id)
    if (!topic) return

    if (topic.lessons.length > 0) {
      const quizCount = topic.lessons.filter((l) => l.type === 'quiz').length
      const ok = await confirmAction({
        title: `ลบหัวข้อ "${topicLabel(topic.title, topics.indexOf(topic))}"?`,
        text: `บทเรียน ${topic.lessons.length} รายการในหัวข้อนี้จะถูกลบไปด้วย และกู้คืนไม่ได้`
          // Same distinction the lesson prompt draws: the assessment documents
          // themselves live elsewhere and survive.
          + (quizCount > 0 ? ` (ตัวแบบทดสอบ ${quizCount} ชุดและคะแนนที่ผู้เรียนทำไว้จะยังอยู่)` : ''),
        confirmText: 'ลบหัวข้อ',
        cancelText: 'ยกเลิก',
        danger: true,
      })
      if (!ok) return
    }

    onChange(topics.filter((t) => t.id !== id))
    if (selectedKey?.startsWith(`${id}:`)) setSelectedKey(null)
  }
  function reorderTopics(to: number) {
    const from = dragTopic
    setDragTopic(null); setDropTopic(null)
    if (from === null || from === to) return
    const next = [...topics]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next.map((t, i) => ({ ...t, order: i })))
  }
  function addLesson(topicId: string) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const lesson: CourseLesson = { id: makeId(), title: '', type: 'video', order: topic.lessons.length }
    updateTopic(topicId, { lessons: [...topic.lessons, lesson] })
    setSelectedKey(`${topicId}:${lesson.id}`)
  }
  function updateLesson(topicId: string, lessonId: string, patch: Partial<CourseLesson>) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    updateTopic(topicId, { lessons: topic.lessons.map((l) => (l.id === lessonId ? { ...l, ...patch } : l)) })
  }
  // Exactly one lesson per course may hold each pre/post role — assigning it
  // here strips it from whichever OTHER lesson held it, across every topic,
  // in the same update so the two writes can't land as separate saves.
  // Deleting is the one action here that can't be undone by re-dragging or
  // re-typing — the lesson's URL, article body or linked quiz goes with it — so
  // it asks first. Both entry points (the × in the list and ลบบทเรียนนี้ in the
  // editor) route through here, so one guard covers both.
  async function removeLesson(topicId: string, lessonId: string) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const lesson = topic.lessons.find((l) => l.id === lessonId)
    if (!lesson) return

    const ok = await confirmAction({
      title: `ลบบทเรียน "${lessonLabel(lesson.title, topic.lessons.indexOf(lesson))}"?`,
      text: lesson.type === 'quiz'
        // The assessment itself lives in its own collection and is reused by
        // other courses, so say plainly that only the link is being removed.
        ? 'บทเรียนนี้จะถูกลบออกจากหลักสูตร (ตัวแบบทดสอบและคะแนนที่ผู้เรียนทำไว้จะยังอยู่)'
        : 'เนื้อหาของบทเรียนนี้จะถูกลบออกจากหลักสูตร และกู้คืนไม่ได้',
      confirmText: 'ลบบทเรียน',
      cancelText: 'ยกเลิก',
      danger: true,
    })
    if (!ok) return

    updateTopic(topicId, { lessons: topic.lessons.filter((l) => l.id !== lessonId) })
    if (selectedKey === `${topicId}:${lessonId}`) setSelectedKey(null)
  }
  function reorderLessons(topicId: string, to: number) {
    const drag = dragLesson
    setDragLesson(null)
    if (!drag || drag.topicId !== topicId || drag.index === to) return
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const next = [...topic.lessons]
    const [moved] = next.splice(drag.index, 1)
    next.splice(to, 0, moved)
    updateTopic(topicId, { lessons: next.map((l, i) => ({ ...l, order: i })) })
  }

  let selectedTopic: CourseTopic | undefined
  let selectedLesson: CourseLesson | undefined
  if (selectedKey) {
    const [tId, lId] = selectedKey.split(':')
    selectedTopic = topics.find((t) => t.id === tId)
    selectedLesson = selectedTopic?.lessons.find((l) => l.id === lId)
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: topics + lessons list — drag the handle to reorder */}
      <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col min-h-0">
        <div className="p-3 border-b border-gray-100 shrink-0">
          <button type="button" onClick={addTopic}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-freshket-300 hover:bg-freshket-50/40 text-sm font-bold text-gray-500 hover:text-freshket-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            เพิ่มหัวข้อ
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
          {preTestLesson && (
            <button type="button" onClick={() => { setSelectedQuiz('pre'); setSelectedKey(null) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                selectedQuiz === 'pre' ? 'bg-freshket-500 border-freshket-500 text-white' : 'border-freshket-200 bg-freshket-50 text-freshket-700 hover:bg-freshket-100'
              }`}>
              <LessonTypeIcon type="quiz" className="size-4 shrink-0" />
              <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${selectedQuiz === 'pre' ? 'bg-white/20' : 'bg-freshket-100'}`}>Pre-Test</span>
              <span className="flex-1 min-w-0" />
            </button>
          )}
          {topics.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10 px-2">ยังไม่มีหัวข้อ — เริ่มด้วยการเพิ่มหัวข้อแรก</p>
          ) : topics.map((topic, ti) => (
            <div
              key={topic.id}
              onDragOver={(e) => { if (dragTopic !== null) { e.preventDefault(); setDropTopic(ti) } }}
              onDrop={(e) => { if (dragTopic !== null) { e.preventDefault(); reorderTopics(ti) } }}
              className={`rounded-xl border bg-gray-50/50 overflow-hidden transition-all ${
                dropTopic === ti && dragTopic !== null && dragTopic !== ti ? 'border-freshket-400 ring-2 ring-freshket-200' : 'border-gray-100'
              } ${dragTopic === ti ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-1.5 px-2 py-2.5 bg-white border-b border-gray-100">
                <span
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragTopic(ti) }}
                  onDragEnd={() => { setDragTopic(null); setDropTopic(null) }}
                  className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors p-0.5"
                  title="ลากเพื่อสลับหัวข้อ"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-1.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-1.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 19a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                </span>
                <input value={isUnnamedTopic(topic.title) ? '' : topic.title} placeholder={topicLabel('', ti)} onChange={(e) => updateTopic(topic.id, { title: e.target.value })}
                  className="flex-1 min-w-0 text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:ring-1 focus:ring-freshket-300 rounded px-1.5 py-1"
                />
                <button type="button" onClick={() => void removeTopic(topic.id)}
                  className="size-6 flex items-center justify-center rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-2 space-y-1">
                {topic.lessons.map((lesson, li) => {
                  const key = `${topic.id}:${lesson.id}`
                  const selected = selectedKey === key
                  return (
                    <div
                      key={lesson.id}
                      onDragOver={(e) => { if (dragLesson?.topicId === topic.id) e.preventDefault() }}
                      onDrop={(e) => { if (dragLesson?.topicId === topic.id) { e.preventDefault(); reorderLessons(topic.id, li) } }}
                      className={`flex items-center gap-1 rounded-lg transition-all ${selected ? 'bg-freshket-500' : 'hover:bg-white'} ${
                        dragLesson?.topicId === topic.id && dragLesson.index === li ? 'opacity-40' : ''
                      }`}
                    >
                      <span
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragLesson({ topicId: topic.id, index: li }) }}
                        onDragEnd={() => setDragLesson(null)}
                        className={`shrink-0 cursor-grab active:cursor-grabbing pl-1.5 py-2 transition-colors ${selected ? 'text-white/60 hover:text-white' : 'text-gray-300 hover:text-gray-500'}`}
                        title="ลากเพื่อสลับบทเรียน"
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-1.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm-1.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 19a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                      </span>
                      <button type="button" onClick={() => { setSelectedKey(key); setSelectedQuiz(null) }}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-1.5 py-2.5 text-left text-sm ${selected ? 'text-white' : 'text-gray-600'}`}>
                        <LessonTypeIcon type={lesson.type} className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{lessonLabel(lesson.title, li)}</span>
                      </button>
                      <button type="button" onClick={() => void removeLesson(topic.id, lesson.id)}
                        className={`size-6 flex items-center justify-center rounded shrink-0 mr-1 transition-all ${selected ? 'text-white/70 hover:bg-white/20' : 'text-gray-300 hover:text-rose-600 hover:bg-rose-50'}`}>
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )
                })}
                <button type="button" onClick={() => addLesson(topic.id)}
                  className="w-full flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-sm text-gray-400 hover:bg-white hover:text-freshket-600 transition-all">
                  + เพิ่มบทเรียน
                </button>
              </div>
            </div>
          ))}
          {postTestLesson && (
            <button type="button" onClick={() => { setSelectedQuiz('post'); setSelectedKey(null) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                selectedQuiz === 'post' ? 'bg-freshket-500 border-freshket-500 text-white' : 'border-freshket-200 bg-freshket-50 text-freshket-700 hover:bg-freshket-100'
              }`}>
              <LessonTypeIcon type="quiz" className="size-4 shrink-0" />
              <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${selectedQuiz === 'post' ? 'bg-white/20' : 'bg-freshket-100'}`}>Post-Test</span>
              <span className="flex-1 min-w-0" />
            </button>
          )}
        </div>
      </div>

      {/* Right: lesson editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedQuiz ? (
          <QuizStripPreview
            lesson={selectedQuiz === 'pre' ? preTestLesson : postTestLesson}
            role={selectedQuiz}
            assessments={assessments}
          />
        ) : selectedLesson && selectedTopic ? (
          <LessonEditor
            lesson={selectedLesson}
            index={selectedTopic.lessons.indexOf(selectedLesson)}
            assessments={assessments}
            onChange={(patch) => updateLesson(selectedTopic!.id, selectedLesson!.id, patch)}
            onDelete={() => void removeLesson(selectedTopic!.id, selectedLesson!.id)}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <svg className="size-12 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
            </svg>
            <p className="text-xs">เลือกบทเรียนทางซ้าย หรือเพิ่มหัวข้อ/บทเรียนใหม่</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CourseFormModal({ assessments, allUsers, onDone, userId, editCourse }: {
  assessments: Assessment[]; allUsers: UserProfile[]
  onDone: (c?: Course) => void; userId: string; editCourse?: Course
}) {
  const isEdit = !!editCourse

  const [tab, setTab] = useState<BuilderTab>('details')
  const [form, setForm] = useState<FormState>(editCourse ? formFromCourse(editCourse) : {
    title: '', description: '', category: 'product', level: 'beginner', durationMinutes: '60',
    isRequired: false,
    thumbnailUrl: '', slideUrl: '', formUrl: '',
    instructorId: '', courseAdminIds: [], introVideoUrl: '',
    hasCertificate: false, allowRetake: false, openEnrollment: false, topics: [],
    hasKeyTakeAway: false, keyTakeAwayPrompt: '', quizEnabled: false,
    isChallenge: false, challengeWindowStart: '', challengeWindowEnd: '', challengeMultiplier: '2',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Save / Save draft / Cancel only show once something has been changed: the form as it opened is the baseline.
  // (Saving closes the editor, so the baseline never has to move.) A brand-new course always shows them.
  const baselineRef = useRef<string | null>(null)
  if (baselineRef.current === null) baselineRef.current = JSON.stringify(form)
  const formJson = useMemo(() => JSON.stringify(form), [form])
  const isDirty = !isEdit || formJson !== baselineRef.current

  const [showLessonPreview, setShowLessonPreview] = useState(false)

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  // Master switch for the course's quiz. Quiz lessons are system-managed: they
  // are not authored in the Lessons tab, they are created by this switch and
  // pinned to the ends of the course — the pre-test first, the post-test last
  // — which is where a before/after pair has to sit to mean anything. Turning
  // the switch off deletes them again.
  async function toggleQuizEnabled() {
    if (form.quizEnabled) {
      const quizzes = form.topics.flatMap((t) => t.lessons).filter((l) => l.type === 'quiz')
      // Only worth confirming if an assessment is actually attached — empty
      // quiz lessons carry no scores, so switching off discards nothing.
      if (quizzes.some((l) => l.assessmentId)) {
        const ok = await confirmAction({
          title: 'ปิดใช้งานแบบทดสอบทั้งคอร์ส?',
          text: `บทเรียนแบบทดสอบ ${quizzes.length} รายการจะถูกลบออกจากหลักสูตร และคะแนนจะไม่ถูกบันทึกลงคอลัมน์ Pre/Post อีก`,
          confirmText: 'ปิดใช้งาน',
          cancelText: 'ยกเลิก',
          danger: true,
        })
        if (!ok) return
      }
      setForm((p) => ({
        ...p,
        quizEnabled: false,
        topics: p.topics.map((t) => ({ ...t, lessons: t.lessons.filter((l) => l.type !== 'quiz') })),
      }))
      return
    }
    setForm((p) => ({ ...p, quizEnabled: true, topics: withQuizLessons(p.topics, false) }))
    setTab('quiz')
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'กรุณากรอกชื่อหลักสูตร'
    setErrors(e)
    if (Object.keys(e).length > 0) setTab('details')
    return Object.keys(e).length === 0
  }

  function handleSubmitClick(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    void performSave()
  }

  async function performSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const now = new Date()
      // What this saves is the course's CONTENT. Who it is for, when it opens and whether it is live belong to the
      // Course Design that launches it, so none of that is written here (a Course Design keeps them on the course).
      const payload = {
        title: form.title.trim(), description: form.description.trim(),
        category: form.category, level: form.level,
        durationMinutes: Number(form.durationMinutes) || 60,
        isRequired: form.isRequired,
        thumbnailUrl: form.thumbnailUrl.trim() || undefined,
        slideUrl: form.slideUrl.trim() || undefined,
        formUrl: form.formUrl.trim() || undefined,
        instructorId: form.instructorId || undefined,
        courseAdminIds: form.courseAdminIds,
        introVideoUrl: form.introVideoUrl.trim() || undefined,
        hasCertificate: form.hasCertificate,
        allowRetake: form.allowRetake,
        openEnrollment: form.openEnrollment,
        topics: form.topics,
        quizEnabled: form.quizEnabled,
        hasKeyTakeAway: form.hasKeyTakeAway,
        keyTakeAwayPrompt: form.hasKeyTakeAway && form.keyTakeAwayPrompt.trim() ? form.keyTakeAwayPrompt.trim() : undefined,
        isChallenge: form.isChallenge || undefined,
        challengeWindowStart: form.isChallenge && form.challengeWindowStart ? new Date(form.challengeWindowStart) : undefined,
        challengeWindowEnd: form.isChallenge && form.challengeWindowEnd ? new Date(form.challengeWindowEnd) : undefined,
        challengeMultiplier: form.isChallenge ? (Number(form.challengeMultiplier) || 2) : undefined,
      }
      if (DEMO_MODE) {
        if (isEdit && editCourse) onDone({ ...editCourse, ...payload, updatedAt: now })
        else onDone({ id: `local-${Date.now()}`, ...payload, isPublished: false, targetRoles: [], createdBy: userId, createdAt: now, updatedAt: now } as Course)
        return
      }
      if (isEdit && editCourse) {
        await save('courses', { ...payload, id: editCourse.id, updatedAt: now })
        onDone({ ...editCourse, ...payload, updatedAt: now })
      } else {
        // A new course is a draft: nobody is assigned and learners do not see it until a Course Design launches it.
        const { id } = await save('courses', {
          ...payload, id: '', isPublished: false, targetRoles: [], assignedUserIds: [], assignedDepartments: [], assignedTeamIds: [],
          createdBy: userId, createdAt: now, updatedAt: now,
        })
        onDone({ id, ...payload, isPublished: false, targetRoles: [], createdBy: userId, createdAt: now, updatedAt: now } as Course)
      }
    } catch (e) {
      console.error('performSave:', e)
      setSaveError('บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  // Counts what the Lessons tab actually lists — quiz lessons are managed by
  // the แบบทดสอบ switch and hidden there, so counting them would make the
  // badge disagree with the list.
  const lessonCount = form.topics.reduce((s, t) => s + t.lessons.filter((l) => l.type !== 'quiz').length, 0)
  const visibleTabs = BUILDER_TABS

  return (
    <div className="absolute inset-0 z-20 bg-white flex flex-col">

      {/* ── Top bar ── */}
      <div className="shrink-0 border-b border-gray-100 bg-white flex items-center justify-between px-6 py-3.5">
        <div>
          <h2 className="font-bold text-gray-900 text-base">{isEdit ? 'แก้ไขหลักสูตร' : 'สร้างหลักสูตรใหม่'}</h2>
          {form.title && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{form.title}</p>}
        </div>
        <button type="button" onClick={() => onDone()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          ยกเลิก
        </button>
      </div>

      <form onSubmit={handleSubmitClick} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">

          {/* ── Secondary sidebar (desktop) ── */}
          <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 p-3 gap-1 shrink-0 overflow-y-auto">
            {visibleTabs.map((t) => {
              const isActive = tab === t.id
              return (
                <div key={t.id}
                  className={`flex items-center gap-1 rounded-xl transition-colors ${isActive ? 'bg-freshket-50' : ''}`}>
                  <button type="button" onClick={() => setTab(t.id)}
                    className={`flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${isActive ? 'text-freshket-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                    <span className={`shrink-0 size-7 rounded-lg flex items-center justify-center transition-colors ${
                      isActive ? 'bg-freshket-500 text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <BuilderTabIcon id={t.id} className="size-4" />
                    </span>
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.id === 'lessons' && lessonCount > 0 && (
                      <span className={`shrink-0 text-xs font-bold px-1.5 rounded-full ${isActive ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'}`}>{lessonCount}</span>
                    )}
                  </button>
                  {/* Master switch for the whole course's quizzes, sitting in
                      the nav row itself so its state is visible from any tab. */}
                  {t.id === 'quiz' && (
                    <button type="button" onClick={toggleQuizEnabled}
                      title={form.quizEnabled ? 'ปิดใช้งานแบบทดสอบทั้งคอร์ส' : 'เปิดใช้งานแบบทดสอบ'}
                      className={`shrink-0 mr-2.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.quizEnabled ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                      <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.quizEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                    </button>
                  )}
                </div>
              )
            })}
            <div className="pt-2 mt-1 border-t border-gray-100">
              <button type="button" onClick={() => setShowLessonPreview(true)}
                disabled={lessonCount === 0}
                title={lessonCount === 0 ? 'เพิ่มบทเรียนก่อนเพื่อดูตัวอย่าง' : undefined}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-freshket-600 hover:bg-freshket-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="flex-1 truncate text-left">พรีวิวมุมมองผู้เรียน</span>
              </button>
            </div>
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile tab strip */}
            <div className="lg:hidden flex items-center gap-2 overflow-x-auto border-b border-gray-100 px-4 py-2 shrink-0" style={{ scrollbarWidth: 'none' }}>
              {visibleTabs.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${tab === t.id ? 'bg-freshket-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ── Details tab — conditionally rendered (not just CSS-hidden): with
                  ~270 assignees, mounting all tabs made every keystroke on this
                  tab reconcile the hidden learners/summary tables too. ── */}
              {tab === 'details' && (
              <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อคอร์สเรียน <span className="text-rose-500">*</span></label>
                    <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)}
                      placeholder="เช่น Product Knowledge 101"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                    />
                    {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">หมวดหมู่หลักสูตร</label>
                    <select value={form.category} onChange={(e) => set('category', e.target.value as CourseCategory)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
                      {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">รายละเอียดคอร์ส</label>
                    <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
                      placeholder="อธิบายเนื้อหาและวัตถุประสงค์ของหลักสูตร..."
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
                    />
                  </div>
                </div>

                {/* Cover image — compact trigger, popup opens only on click */}
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-2">ภาพปก</label>
                  <CoverImagePicker
                    value={form.thumbnailUrl} onChange={(url) => set('thumbnailUrl', url)}
                    title={form.title} description={form.description} entityId={editCourse?.id}
                    catalog={COURSE_IMAGE_CATALOG} uploadEndpoint="/api/upload/course-image" uploadIdField="courseId"
                    aspect={3 / 1}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => set('hasCertificate', !form.hasCertificate)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.hasCertificate ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                    <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.hasCertificate ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-xs text-gray-600 font-normal">มอบใบประกาศเมื่อผ่านคอร์ส</span>
                </div>

                {/* ── Additional settings ── */}
                <div className="border-t border-gray-100 pt-6 space-y-5">
                  <p className="text-xs font-bold text-gray-700">การตั้งค่าเพิ่มเติม</p>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">ผู้สอน</label>
                      <InstructorPicker users={allUsers} value={form.instructorId} onChange={(uid) => set('instructorId', uid)} />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">ระยะเวลา (นาที)</label>
                      <input type="number" min={1} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">ระดับความยาก (Level)</label>
                      <select value={form.level} onChange={(e) => set('level', e.target.value as CourseLevel)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
                        {(Object.keys(LEVEL_LABELS) as CourseLevel[]).map((lv) => (
                          <option key={lv} value={lv}>{LEVEL_LABELS[lv]}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">แสดงในตาราง My Course ของผู้เรียน</p>
                    </div>

                    <div className="col-span-2">
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">ผู้ดูแลคอร์ส</label>
                      <CourseAdminPicker users={allUsers} selectedIds={form.courseAdminIds} onChange={(ids) => set('courseAdminIds', ids)} />
                    </div>

                    <div className="col-span-2">
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">วิดีโอแนะนำคอร์ส</label>
                      <input type="url" value={form.introVideoUrl} onChange={(e) => set('introVideoUrl', e.target.value)}
                        placeholder="กรอก YouTube URL"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
                      />
                    </div>

                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('isRequired', !form.isRequired)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.isRequired ? 'bg-rose-400' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.isRequired ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">บังคับเรียน</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('isChallenge', !form.isChallenge)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.isChallenge ? 'bg-amber-400' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.isChallenge ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">🏆 Challenge</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('allowRetake', !form.allowRetake)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.allowRetake ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.allowRetake ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">ให้เรียน/สอบซ้ำได้หลังเรียนจบ</span>
                      <InfoTooltip text="ปิด: ผู้เรียนที่เรียนจบแล้วยังเปิดอ่าน slide/วิดีโอได้ แต่ทำแบบทดสอบหรือแบบประเมินใหม่ไม่ได้ เพื่อกันการแก้คะแนน เปิด: ทำซ้ำได้ ถ้าต้องการให้ผู้เรียนบางคนทำใหม่ในคอร์สที่ปิดอยู่ ให้ Super Admin กด ล้างประวัติ ที่ผลของผู้เรียนคนนั้น" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('openEnrollment', !form.openEnrollment)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.openEnrollment ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.openEnrollment ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">เปิดให้ทุกคนเลือกเรียนเอง (Library)</span>
                      <InfoTooltip text="หลักสูตรไม่บังคับ: ทุกคนเห็นในแท็บ Library ของ My Course และกด Enroll เพื่อเรียนเองได้ แม้ไม่ได้อยู่ในกลุ่มเป้าหมาย คนที่ Enroll จะถูกนับในรายงานของ Team Lead และแจ้ง Slack ตอนเรียนจบเหมือนผู้เรียนปกติ ปิด: เห็นเฉพาะกลุ่มเป้าหมาย" />
                    </div>
                  </div>
                </div>

                {form.isChallenge && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-bold text-amber-700">การตั้งค่า Challenge</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">เริ่มแข่งขัน</label>
                        <input type="date" value={form.challengeWindowStart} onChange={(e) => set('challengeWindowStart', e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">สิ้นสุดแข่งขัน</label>
                        <input type="date" value={form.challengeWindowEnd} min={form.challengeWindowStart || undefined} onChange={(e) => set('challengeWindowEnd', e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">Point Multiplier</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="5" step="0.5" value={form.challengeMultiplier} onChange={(e) => set('challengeMultiplier', e.target.value)}
                          className="w-24 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        <span className="text-xs text-gray-500">× คะแนนฐาน (เช่น 2× = สองเท่า)</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Take Away */}
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center ${form.hasKeyTakeAway ? 'bg-freshket-100 text-freshket-600' : 'bg-gray-100 text-gray-400'}`}>
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">Key Take Away</p>
                        <p className="text-sm text-gray-400">ให้ผู้เรียนสรุปสิ่งที่ได้เรียนรู้หลังจบหลักสูตร</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setForm((p) => ({ ...p, hasKeyTakeAway: !p.hasKeyTakeAway }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0 ${form.hasKeyTakeAway ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                      <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.hasKeyTakeAway ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {form.hasKeyTakeAway && (
                    <div className="px-4 pb-4">
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">คำถามสรุปบทเรียน</label>
                      <textarea rows={2} value={form.keyTakeAwayPrompt} onChange={(e) => set('keyTakeAwayPrompt', e.target.value)}
                        placeholder="เช่น สิ่งที่คุณได้เรียนรู้จากคอร์สนี้คืออะไร?"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
                      />
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* ── Lessons tab ── */}
              {tab === 'lessons' && (
              <div className="h-full">
                <LessonsBuilder topics={form.topics} onChange={(topics) => set('topics', topics)} assessments={assessments} />
              </div>
              )}

              {/* ── Quiz tab ── */}
              {tab === 'quiz' && (
                <QuizSettingsTab
                  enabled={form.quizEnabled}
                  topics={form.topics}
                  onChangeTopics={(topics) => set('topics', topics)}
                  assessments={assessments}
                />
              )}

              {/* ── Assign Learners tab ── */}
            </div>
          </div>
        </div>

        {/* Footer: only while there is something to save (or a save just failed) */}
        {(isDirty || saveError) && (
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-2">
          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-600">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {saveError}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => onDone()}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center gap-2">
              {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกเป็นร่าง'}
            </button>
          </div>
        </div>
        )}
      </form>

      {showLessonPreview && (
        <LessonPreviewModal
          topics={form.topics}
          assessments={assessments}
          courseId={editCourse?.id}
          hasKeyTakeAway={form.hasKeyTakeAway}
          keyTakeAwayPrompt={form.keyTakeAwayPrompt}
          onClose={() => setShowLessonPreview(false)}
        />
      )}
    </div>
  )
}
