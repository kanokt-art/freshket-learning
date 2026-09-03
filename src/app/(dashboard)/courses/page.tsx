'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, updateDoc, deleteDoc, doc, collection, Timestamp } from 'firebase/firestore'
import { pushNotification } from '@/lib/notifications/push'
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
import { STATUS_LABELS, STATUS_COLORS, recordProgressPercent, type TrainingStatus, type TrainingRecord } from '@/types/tracking'
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_COLORS, type Assessment } from '@/types/assessment'
import type { UserProfile, UserRole, Department, Team } from '@/types/user'
import { getClientFirestore } from '@/lib/firebase/client'
import { formatDateEN } from '@/lib/utils/dateFormatter'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { MyCourseTabs } from '@/components/layout/MyCourseTabs'
import { LearnerCourseDashboard } from '@/components/features/LearnerCourseDashboard'
import { CourseResultsImport } from '@/components/features/CourseResultsImport'

import { getDemoMode, FRESHKET_LOGO_URL } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import { COURSE_IMAGE_CATALOG } from '@/lib/utils/mockData'
import { CoverImagePicker } from '@/components/features/CoverImagePicker'
import { InfoTooltip } from '@/components/common/InfoTooltip'
import { alertError, confirmAction } from '@/lib/ui/alert'
import { authedFetch } from '@/lib/api/authedFetch'
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

function fmtDate(d: Date | string | undefined) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d as string)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
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

// Notifies the right learners after a course's publish state or roster changes —
// shared by the full edit-form save AND the quick publish toggle on the overview
// modal, so both paths keep the same "don't re-notify already-enrolled users"
// and "only ping newly-added assignees" rules.
function notifyCoursePublishChanges(
  c: Course,
  wasPublished: boolean,
  prevAssignedUserIds: string[] | undefined,
  allUsers: UserProfile[],
  allTrainingRecords: TrainingRecord[],
  currentUid: string | undefined,
) {
  const alreadyEnrolled = new Set(
    allTrainingRecords.filter(r => r.courseId === c.id).map(r => r.userId)
  )

  if (c.isPublished && !wasPublished) {
    // First publish → notify all role-based or individually-assigned targets who aren't already enrolled
    const isNotifyTarget = (u: UserProfile) =>
      ((c.targetRoles as string[]).includes(u.role) || (c.assignedUserIds?.includes(u.uid) ?? false)) && !alreadyEnrolled.has(u.uid)
    const targets = DEMO_MODE
      ? demoStore.getUsers().filter(isNotifyTarget)
      : allUsers.filter(isNotifyTarget)
    targets.forEach(u => {
      if (u.uid !== currentUid) {
        pushNotification(u.uid, {
          type: 'new_course',
          title: `หลักสูตรใหม่: ${c.title}`,
          body: `มีหลักสูตรใหม่สำหรับคุณ — คลิกเพื่อดูรายละเอียด`,
          refId: c.id,
          refPath: `/courses/${c.id}`,
        })
      }
    })
  } else if (c.isPublished && wasPublished && prevAssignedUserIds && (c.assignedUserIds?.length ?? 0) > 0) {
    // Already-published course updated — notify only users newly added to assignedUserIds
    const prevAssigned = new Set(prevAssignedUserIds)
    const newlyAdded = (c.assignedUserIds ?? []).filter(
      id => !prevAssigned.has(id) && !alreadyEnrolled.has(id)
    )
    const targets = allUsers.filter(u => newlyAdded.includes(u.uid))
    targets.forEach(u => {
      if (u.uid !== currentUid) {
        pushNotification(u.uid, {
          type: 'new_course',
          title: `หลักสูตร: ${c.title}`,
          body: `คุณถูกเพิ่มเข้าหลักสูตร — คลิกเพื่อดูรายละเอียด`,
          refId: c.id,
          refPath: `/courses/${c.id}`,
        })
      }
    })
  }
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
  const [learnerResultsCourse, setLearnerResultsCourse] = useState<Course | null>(null)
  const [showImportResults, setShowImportResults] = useState(false)

  const isSuperAdmin = user?.role === 'super_admin'
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)

  // Open the create modal when triggered from the "Course ▾ → สร้างหลักสูตรใหม่"
  // tab item. It works whether we're already on /courses (custom event) or
  // navigating here from another tab (sessionStorage flag read on mount).
  useEffect(() => {
    if (!isSuperAdmin) return
    if (sessionStorage.getItem('fk_open_create_course') === '1') {
      sessionStorage.removeItem('fk_open_create_course')
      setShowCreate(true)
    }
    const handler = () => { sessionStorage.removeItem('fk_open_create_course'); setShowCreate(true) }
    window.addEventListener('fk:create-course', handler)
    return () => window.removeEventListener('fk:create-course', handler)
  }, [isSuperAdmin])

  const recordMap = useMemo(() => {
    const m: Record<string, TrainingStatus> = {}
    myRecords.forEach((r) => { m[r.courseId] = r.status })
    return m
  }, [myRecords])

  const visible = useMemo(() => {
    const isTargeted = (c: Course) =>
      c.targetRoles.includes(user?.role ?? 'sale') || (c.assignedUserIds?.includes(user?.uid ?? '') ?? false)
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
          return c.isPublished && isTargeted(c)
        })
        .map((c) => localUpdated[c.id] ?? c),
    ]
  }, [allCourses, localCreated, localUpdated, localDeleted, user, isSuperAdmin])

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


  // Quick publish/unpublish from the overview modal's Settings tab — bypasses
  // the full edit form but still runs the Firestore write and the same
  // notify-on-publish rules as a normal save (via notifyCoursePublishChanges).
  async function handleTogglePublish(course: Course) {
    const now = new Date()
    const updated: Course = { ...course, isPublished: !course.isPublished, updatedAt: now }
    if (DEMO_MODE) {
      demoStore.updateCourse(course.id, updated)
    } else {
      await updateDoc(doc(getClientFirestore(), 'courses', course.id), {
        isPublished: updated.isPublished,
        updatedAt: Timestamp.fromDate(now),
      })
      setLocalUpdated((p) => ({ ...p, [course.id]: updated }))
    }
    notifyCoursePublishChanges(updated, course.isPublished, course.assignedUserIds, allUsers, allTrainingRecords, user?.uid)
    setLearnerResultsCourse(updated)
  }

  async function handleDelete(course: Course) {
    setDeleting(true)
    try {
      if (DEMO_MODE) {
        demoStore.deleteCourse(course.id)
      } else {
        const db = getClientFirestore()
        await deleteDoc(doc(db, 'courses', course.id))
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
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!allowedModules.has('lms')) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
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
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="bg-freshket-500 lg:bg-white border-b border-freshket-600 lg:border-gray-100 px-6 py-4 shrink-0">
        <h1 className="text-lg font-bold text-white lg:text-gray-900">{isSuperAdmin ? 'หลักสูตรทั้งหมด' : 'My Course'}</h1>
        <p className="text-xs text-freshket-200 lg:text-gray-400 mt-0.5">{visible.length} หลักสูตร</p>
      </div>

      {isSuperAdmin && <CourseManagementTabs />}
      <MyCourseTabs />

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
        {/* ── Search bar + view toggle ───────────────────────────────────────── */}
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
            {/* View toggle — right after search */}
            <div className="flex items-center gap-1 shrink-0 bg-white border border-gray-200 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
            </div>
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
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((course) => (
                <CourseCard key={course.id} course={course} status={recordMap[course.id]}
                  isSuperAdmin={isSuperAdmin}
                  allAssessments={allAssessments}
                  allUsers={allUsers}
                  onEdit={() => setEditingCourse(course)}
                  onDelete={() => setConfirmDelete(course)}
                  onView={() => setLearnerResultsCourse(course)}
                  onClick={() => router.push(`/courses/${course.id}`)}
                />
              ))}
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
          onTogglePublish={() => handleTogglePublish(learnerResultsCourse)}
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
          assessments={allAssessments}
          allUsers={allUsers}
          allTrainingRecords={allTrainingRecords}
          departments={departments}
          teams={teams}
          onDone={(c) => {
            if (c) {
              const wasPublished = editingCourse?.isPublished ?? false
              if (DEMO_MODE) {
                if (editingCourse) demoStore.updateCourse(c.id, c)
                else demoStore.addCourse(c)
              } else {
                if (editingCourse) setLocalUpdated((p) => ({ ...p, [c.id]: c }))
                else setLocalCreated((p) => [c, ...p])
              }
              notifyCoursePublishChanges(c, wasPublished, editingCourse?.assignedUserIds, allUsers, allTrainingRecords, user?.uid)
            }
            setShowCreate(false)
            setEditingCourse(null)
          }}
          userId={user?.uid ?? ''}
          editCourse={editingCourse ?? undefined}
          isSuperAdmin={isSuperAdmin}
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

function CourseCard({ course, status, isSuperAdmin, allAssessments, allUsers, onEdit, onDelete, onView, onClick }: {
  course: Course; status?: TrainingStatus; isSuperAdmin: boolean
  allAssessments: Assessment[]; allUsers: UserProfile[]
  onEdit: () => void; onDelete: () => void; onView: () => void; onClick: () => void
}) {
  const gradient = CAT_GRADIENT[course.category]
  const resolvedStatus = status ?? 'not_started'
  // Module count = number of topics if the course uses the topics/lessons
  // curriculum, else 1 for the legacy single slideUrl course.
  const moduleCount = course.topics?.length || (course.slideUrl ? 1 : 0) || 1

  // Question/score summary now comes from every lesson-level quiz in the
  // course (course-level pre/post-test no longer exists).
  const lessonQuizAssessmentIds = new Set(
    (course.topics ?? []).flatMap((t) => t.lessons.filter((l) => l.type === 'quiz' && l.assessmentId).map((l) => l.assessmentId as string)),
  )
  const linkedAssessments = allAssessments.filter((a) => lessonQuizAssessmentIds.has(a.id))
  const questionCount = linkedAssessments.reduce((sum, a) => sum + a.questions.length, 0)
  const maxScore = linkedAssessments.reduce((sum, a) => sum + a.questions.reduce((s, q) => s + (q.points ?? 0), 0), 0)
  const creatorName = allUsers.find((u) => u.uid === course.createdBy)?.displayName ?? '—'

  return (
    <div className="relative flex flex-col rounded-2xl bg-white border border-gray-100 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 overflow-hidden group">
      {isSuperAdmin && (
        <>
          <button onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="absolute top-2.5 left-2.5 z-10 size-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-gray-600 hover:bg-freshket-500 hover:text-white transition-all duration-150 opacity-0 group-hover:opacity-100"
            title="แก้ไขหลักสูตร">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onView() }}
            className="absolute top-2.5 left-12 z-10 size-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-gray-600 hover:bg-freshket-500 hover:text-white transition-all duration-150 opacity-0 group-hover:opacity-100"
            title="ดูภาพรวมคอร์ส">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="absolute top-2.5 left-20 z-10 size-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-gray-400 hover:bg-rose-500 hover:text-white transition-all duration-150 opacity-0 group-hover:opacity-100"
            title="ลบหลักสูตร">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </>
      )}
      <button onClick={onClick} className="flex flex-col flex-1 text-left">
        <div className={`relative h-44 w-full overflow-hidden bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          {course.thumbnailUrl ? (
            isImageUrl(course.thumbnailUrl)
              ? <img src={course.thumbnailUrl} alt={course.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              : <div className="absolute inset-0" style={{ background: course.thumbnailUrl }} />
          ) : <CategoryIcon category={course.category} className="size-16 opacity-40" />}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm shadow-sm">
            <span className="text-xs font-bold text-gray-800">{CATEGORY_LABELS[course.category]}</span>
          </div>
          <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
            {course.isChallenge && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400 text-white shadow-sm">
                🏆 Challenge
              </span>
            )}
            {course.isRequired && (
              <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-rose-500 text-white shadow-sm">บังคับ</span>
            )}
          </div>
        </div>
        <div className="flex flex-col flex-1 p-4 gap-2">
          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-freshket-600 transition-colors">{course.title}</h3>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="size-5 rounded-full bg-freshket-100 overflow-hidden shrink-0 flex items-center justify-center">
                <img src={FRESHKET_LOGO_URL} alt="Freshket" className="size-4 object-contain" />
              </div>
              <span className="text-xs text-gray-500">Freshket Academy</span>
            </div>
            <span className={`shrink-0 inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[resolvedStatus]}`}>{STATUS_LABELS[resolvedStatus]}</span>
          </div>
          <div className="flex items-center gap-3 mt-auto pt-3 border-t border-gray-100 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122" />
              </svg>
              {moduleCount} โมดูล
            </span>
            <span className="text-gray-200">|</span>
            <span className="flex items-center gap-1">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {fmtDuration(course.durationMinutes)}
            </span>
            {questionCount > 0 && (
              <>
                <span className="text-gray-200">|</span>
                <span className="flex items-center gap-1">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
                  </svg>
                  {questionCount} ข้อ · {maxScore} คะแนน
                </span>
              </>
            )}
          </div>
          {/* Creator + date — authoring info, admin only */}
          {isSuperAdmin && (
            <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
              <span className="truncate">สร้างโดย {creatorName}</span>
              <span className="shrink-0 ml-2">{fmtDate(course.createdAt)}</span>
            </div>
          )}
        </div>
      </button>
    </div>
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
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ชื่อคอร์สเรียน</th>
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">หมวดหมู่</th>
              <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">สถานะการเรียน</th>
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
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ชื่อคอร์สเรียน</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">คะแนน</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">หมวดหมู่</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">เผยแพร่เมื่อ</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">แก้ไขล่าสุด</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ผู้เรียน</th>
            <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">สถานะ</th>
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
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${course.isPublished ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'}`}>
                      {course.isPublished ? 'เผยแพร่แล้ว' : 'ร่าง'}
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

// Real per-lesson progress when the learner's record has it (written by the course
// detail page as they complete lessons); falls back to the coarse status-derived
// estimate for records that predate lesson tracking or came from a CSV import.
function approxProgressPct(status: TrainingStatus, record?: TrainingRecord): number {
  if (record && (record.totalLessons ?? 0) > 0) return recordProgressPercent(record)
  if (status === 'not_started') return 0
  if (status === 'in_progress') return 50
  return 100
}

type CourseOverviewTab = 'overview' | 'learners' | 'settings'
const OVERVIEW_TABS: { id: CourseOverviewTab; label: string }[] = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'learners', label: 'สรุปข้อมูลผู้เรียน' },
  { id: 'settings', label: 'ตั้งค่า' },
]

// Replaces the old learner-only results table with a 3-tab course dashboard:
// completion overview + per-department bar chart, the learner list (former
// LearnerResultsModal content), and a quick publish/unpublish toggle so a
// super_admin doesn't have to open the full edit form just to open/close a course.
function CourseOverviewModal({ course, allUsers, allTrainingRecords, onClose, onTogglePublish }: {
  course: Course; allUsers: UserProfile[]; allTrainingRecords: TrainingRecord[]
  onClose: () => void; onTogglePublish: () => void | Promise<void>
}) {
  const [tab, setTab] = useState<CourseOverviewTab>('overview')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | 'all'>('all')
  const [toggling, setToggling] = useState(false)

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

  async function handleTogglePublish() {
    setToggling(true)
    try {
      await onTogglePublish()
    } finally {
      setToggling(false)
    }
  }

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
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ชื่อ / ตำแหน่ง</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">แผนก</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">วันที่เริ่มเรียน</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">เรียนล่าสุด</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ความคืบหน้า</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ผลการทดสอบ</th>
                    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-gray-400 text-sm py-10">ไม่พบข้อมูลผู้เรียน</td></tr>
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
                              <p className="text-xs text-gray-400 truncate">{u.position ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{u.department ?? '—'}</td>
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

        {tab === 'settings' && (
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-md flex items-center justify-between p-4 rounded-2xl border border-gray-100">
              <div className="min-w-0 pr-4">
                <p className="text-sm font-bold text-gray-900">เผยแพร่หลักสูตร</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {course.isPublished ? 'ผู้เรียนที่เกี่ยวข้องมองเห็นคอร์สนี้อยู่' : 'ซ่อนจากผู้เรียน (สถานะร่าง)'}
                </p>
              </div>
              <button type="button" disabled={toggling} onClick={handleTogglePublish}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0 disabled:opacity-60 ${course.isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                <span className={`inline-block size-4.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${course.isPublished ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Assigned Learners Table Modal (from the "ทั้งหมด" counter in the builder) ──
interface AssignedLearnerRow {
  user: UserProfile
  record?: TrainingRecord
  status: TrainingStatus
  lastActivity?: Date
}

// Super_admin manual correction of one learner's status/score(s) — the only
// path to it, since firestore.rules lets a learner write only their OWN
// record and never `score` at all (see /trainingRecords in firestore.rules).
// Goes through POST /api/training-records/override (Admin SDK); the realtime
// onSnapshot behind useAllTrainingRecords picks up the write on its own, so
// there's no local state to reconcile here after a successful save.
function OverrideRecordModal({ row, courseId, courseTitle, hasPreTest, hasPostTest, onClose }: {
  row: AssignedLearnerRow; courseId: string; courseTitle: string
  hasPreTest: boolean; hasPostTest: boolean; onClose: () => void
}) {
  const [status, setStatus] = useState<TrainingStatus>(row.status)
  const [score, setScore] = useState(row.record?.score != null ? String(row.record.score) : '')
  const [preTestScore, setPreTestScore] = useState(row.record?.preTestScore != null ? String(row.record.preTestScore) : '')
  const [postTestScore, setPostTestScore] = useState(row.record?.postTestScore != null ? String(row.record.postTestScore) : '')
  const [saving, setSaving] = useState(false)

  function toNum(s: string): number | null | undefined {
    if (s.trim() === '') return null // explicit clear
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }

  async function handleSave() {
    // Demo mode has no writable training-records backend — ALL_RECORDS is a
    // static mock array, not React state, so there's nothing to persist to
    // and nothing that would re-render from it either way. Matches every
    // other DEMO_MODE branch in this file: skip the network call entirely.
    if (DEMO_MODE) { onClose(); return }
    setSaving(true)
    try {
      const res = await authedFetch('/api/training-records/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.user.uid,
          courseId,
          courseTitle,
          status,
          score: toNum(score),
          ...(hasPreTest ? { preTestScore: toNum(preTestScore) } : {}),
          ...(hasPostTest ? { postTestScore: toNum(postTestScore) } : {}),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        void alertError('บันทึกไม่สำเร็จ', json.error ?? `HTTP ${res.status}`)
        return
      }
      onClose()
    } catch (e) {
      void alertError('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">แก้ไขสถานะ/คะแนน</p>
          <p className="text-xs text-gray-400 truncate">{row.user.displayName}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TrainingStatus)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-freshket-500">
              {(Object.keys(STATUS_LABELS) as TrainingStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน</label>
            <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)}
              placeholder="เว้นว่าง = ไม่มีคะแนน"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
            />
          </div>
          {hasPreTest && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน Pre-Test</label>
              <input type="number" min={0} max={100} value={preTestScore} onChange={(e) => setPreTestScore(e.target.value)}
                placeholder="เว้นว่าง = ไม่มีคะแนน"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
              />
            </div>
          )}
          {hasPostTest && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน Post-Test</label>
              <input type="number" min={0} max={100} value={postTestScore} onChange={(e) => setPostTestScore(e.target.value)}
                placeholder="เว้นว่าง = ไม่มีคะแนน"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-60">
            ยกเลิก
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center gap-1.5">
            {saving && <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

function computeAssignedRows(assignedUserIds: string[], allUsers: UserProfile[], allTrainingRecords: TrainingRecord[], courseId?: string): AssignedLearnerRow[] {
  return assignedUserIds
    .map((uid) => allUsers.find((u) => u.uid === uid))
    .filter((u): u is UserProfile => !!u)
    .map((u) => {
      const record = courseId ? allTrainingRecords.find((r) => r.courseId === courseId && r.userId === u.uid) : undefined
      const status: TrainingStatus = record?.status ?? 'not_started'
      const lastActivity = record?.completedAt ?? record?.startedAt
      return { user: u, record, status, lastActivity }
    })
}

type AssignedSortKey = 'name' | 'department' | 'startDate' | 'status'

function sortAssignedRows(rows: AssignedLearnerRow[], sortKey: AssignedSortKey | null, sortDir: 'asc' | 'desc'): AssignedLearnerRow[] {
  if (!sortKey) return rows
  const sorted = [...rows].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') cmp = a.user.displayName.localeCompare(b.user.displayName)
    else if (sortKey === 'department') cmp = (a.user.department ?? '').localeCompare(b.user.department ?? '')
    else if (sortKey === 'startDate') cmp = (a.record?.startedAt?.getTime() ?? 0) - (b.record?.startedAt?.getTime() ?? 0)
    else cmp = a.status.localeCompare(b.status)
    return sortDir === 'asc' ? cmp : -cmp
  })
  return sorted
}

function SortableTh({ label, sortKey, activeSortKey, sortDir, onSort }: {
  label: string; sortKey: AssignedSortKey; activeSortKey: AssignedSortKey | null; sortDir: 'asc' | 'desc'
  onSort: (key: AssignedSortKey) => void
}) {
  const active = sortKey === activeSortKey
  return (
    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-600 transition-colors"
      onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <svg className={`size-3 transition-transform ${active ? 'text-gray-600' : 'text-gray-300'} ${active && sortDir === 'desc' ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </span>
    </th>
  )
}

function AssignedLearnersTable({ rows, enrolledUserIds, onRemove, emptyText, courseId, courseTitle, hasPreTest, hasPostTest, isSuperAdmin }: {
  rows: AssignedLearnerRow[]; enrolledUserIds: Set<string>; onRemove: (uid: string) => void; emptyText?: string
  courseId?: string; courseTitle?: string; hasPreTest?: boolean; hasPostTest?: boolean; isSuperAdmin?: boolean
}) {
  const [sortKey, setSortKey] = useState<AssignedSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingRow, setEditingRow] = useState<AssignedLearnerRow | null>(null)

  function handleSort(key: AssignedSortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = useMemo(() => sortAssignedRows(rows, sortKey, sortDir), [rows, sortKey, sortDir])
  // Editing needs a real courseId to write trainingRecords/{uid}_{courseId} —
  // a brand-new, unsaved course has none yet, so the edit affordance is
  // simply unavailable until the course exists.
  const canEdit = isSuperAdmin && !!courseId

  return (
    <>
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 sticky top-0 bg-white">
          <SortableTh label="รายชื่อ" sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="สังกัด" sortKey="department" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="วันที่เริ่มเรียน" sortKey="startDate" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">เรียนล่าสุด</th>
          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ความคืบหน้า</th>
          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ผลการทดสอบ</th>
          {hasPreTest && <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Pre-Test</th>}
          {hasPostTest && <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Post-Test</th>}
          <SortableTh label="สถานะ" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr><td colSpan={7 + (hasPreTest ? 1 : 0) + (hasPostTest ? 1 : 0)} className="text-center text-gray-400 text-sm py-10">{emptyText ?? 'ยังไม่มีผู้เรียนที่กำหนด'}</td></tr>
        ) : sorted.map((row) => {
          const { user: u, record, status, lastActivity } = row
          const pct = approxProgressPct(status, record)
          const isEnrolled = enrolledUserIds.has(u.uid)
          return (
            <tr key={u.uid} className="group border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {u.photoURL
                      ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                      : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{u.position ?? '—'}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{u.department ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(record?.startedAt)}</td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(lastActivity)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2 w-24">
                  <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-freshket-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                {record?.score != null ? `${record.score}${record.passScore != null ? `/${record.passScore}` : ''}` : '—'}
              </td>
              {hasPreTest && (
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{record?.preTestScore ?? '—'}</td>
              )}
              {hasPostTest && (
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{record?.postTestScore ?? '—'}</td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {canEdit && (
                    <button type="button" title="แก้ไขสถานะ/คะแนน" onClick={() => setEditingRow(row)}
                      className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                  )}
                  <button type="button"
                    title={isEnrolled ? 'ผู้เรียนที่เริ่มเรียนแล้วไม่สามารถลบออกได้' : 'ลบออกจากรายชื่อผู้เรียน'}
                    onClick={() => !isEnrolled && onRemove(u.uid)} disabled={isEnrolled}
                    className={`size-7 flex items-center justify-center rounded-lg border transition-all ${
                      isEnrolled ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 text-gray-400 hover:bg-rose-500 hover:text-white hover:border-rose-500'
                    }`}>
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    {editingRow && courseId && (
      <OverrideRecordModal
        row={editingRow}
        courseId={courseId}
        courseTitle={courseTitle ?? ''}
        hasPreTest={!!hasPreTest}
        hasPostTest={!!hasPostTest}
        onClose={() => setEditingRow(null)}
      />
    )}
    </>
  )
}

function AssignedLearnersTableModal({ assignedUserIds, allUsers, allTrainingRecords, enrolledUserIds, courseId, courseTitle, hasPreTest, hasPostTest, isSuperAdmin, onRemove, onClose }: {
  assignedUserIds: string[]; allUsers: UserProfile[]; allTrainingRecords: TrainingRecord[]; enrolledUserIds: Set<string>
  courseId?: string; courseTitle?: string; hasPreTest?: boolean; hasPostTest?: boolean; isSuperAdmin?: boolean
  onRemove: (uid: string) => void; onClose: () => void
}) {
  const rows = useMemo(() => computeAssignedRows(assignedUserIds, allUsers, allTrainingRecords, courseId), [assignedUserIds, allUsers, allTrainingRecords, courseId])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">รายชื่อผู้เรียน</h3>
            <p className="text-xs text-gray-400">{rows.length} คน</p>
          </div>
          <button type="button" onClick={onClose}
            className="size-9 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <AssignedLearnersTable rows={rows} enrolledUserIds={enrolledUserIds} onRemove={onRemove}
            courseId={courseId} courseTitle={courseTitle} hasPreTest={hasPreTest} hasPostTest={hasPostTest} isSuperAdmin={isSuperAdmin} />
        </div>
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
    authedFetch('/api/resolve-form-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: assessment.googleFormUrl }),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setResolvedFormUrl(json.resolvedUrl)
      })
      .catch(() => { /* falls back to the "open new tab" branch below */ })
      .finally(() => { if (!cancelled) setResolvingForm(false) })
    return () => { cancelled = true }
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

// ── Searchable filter dropdown (department/position pickers) ──────────────────
function FilterCombobox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-xs rounded-lg border border-gray-200 px-2.5 py-2 bg-white text-gray-600 hover:border-gray-300 transition-colors">
        <span className={`truncate ${value ? 'text-gray-700 font-bold' : 'text-gray-400'}`}>{value || placeholder}</span>
        <svg className={`size-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input type="text" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!value ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
              {placeholder}
            </button>
            {filtered.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">ไม่พบ</p>
              : filtered.map((o) => (
                <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); setQuery('') }}
                  className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${value === o ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {o}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Side Panel shell (slide-over from the right) ──────────────────────────────
function SidePanel({ title, subtitle, onClose, footer, children }: {
  title: string; subtitle?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[80vw] h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'orgModalIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
        <style>{`@keyframes orgModalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="size-8 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">{footer}</div>}
      </div>
    </div>
  )
}

function PanelFooter({ selectedCount, onCancel, onConfirm }: { selectedCount: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <span className="text-xs font-bold text-gray-500">เลือกแล้ว {selectedCount} คน</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
          ยกเลิก
        </button>
        <button type="button" onClick={onConfirm}
          className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-all">
          เพิ่ม
        </button>
      </div>
    </>
  )
}

type GroupState = 'checked' | 'partial' | 'unchecked' | 'empty'

function computeGroupState(ids: string[], assignedSet: Set<string>, enrolledUserIds: Set<string>): GroupState {
  const selectable = ids.filter((id) => !enrolledUserIds.has(id))
  if (selectable.length === 0) return 'empty'
  if (selectable.every((id) => assignedSet.has(id))) return 'checked'
  if (selectable.some((id) => assignedSet.has(id))) return 'partial'
  return 'unchecked'
}

function GroupCheckbox({ state, onChange }: { state: GroupState; onChange: () => void }) {
  return (
    <input type="checkbox" checked={state === 'checked'} disabled={state === 'empty'}
      ref={(el) => { if (el) el.indeterminate = state === 'partial' }}
      onChange={onChange}
      className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-4 shrink-0 disabled:opacity-30"
    />
  )
}

// ── Individual Assignment Panel ────────────────────────────────────────────────
function IndividualAssignmentPanel({ users, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  users: UserProfile[]; assignedIds: string[]; enrolledUserIds: Set<string>
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [sortByStartDate, setSortByStartDate] = useState<'none' | 'asc' | 'desc'>('none')
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))

  function toggleDraft(uid: string) {
    setDraft((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }

  // Same "only the literal 'Active' counts as inactive" rule as the Employees
  // list (src/app/(dashboard)/users/page.tsx) — a resigned person shouldn't be
  // assignable to a new course, but an undefined status predates the HR sync
  // and is still treated as active.
  const activeUsers = useMemo(
    () => users.filter((u) => !u.employmentStatus || u.employmentStatus === 'Active'),
    [users],
  )

  const departments = useMemo(() => Array.from(new Set(activeUsers.map((u) => u.department).filter(Boolean))).sort() as string[], [activeUsers])
  const positions = useMemo(() => Array.from(new Set(activeUsers.map((u) => u.position).filter(Boolean))).sort() as string[], [activeUsers])

  const filtered = useMemo(() => {
    let list = activeUsers
    if (deptFilter) list = list.filter((u) => u.department === deptFilter)
    if (positionFilter) list = list.filter((u) => u.position === positionFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.displayNameEN?.toLowerCase() ?? '').includes(q) ||
        (u.nickname?.toLowerCase() ?? '').includes(q) ||
        (u.employeeId?.toLowerCase() ?? '').includes(q) ||
        (u.position?.toLowerCase() ?? '').includes(q),
      )
    }
    if (sortByStartDate !== 'none') {
      list = [...list].sort((a, b) => {
        const at = a.startDate?.getTime() ?? 0
        const bt = b.startDate?.getTime() ?? 0
        return sortByStartDate === 'asc' ? at - bt : bt - at
      })
    }
    return list
  }, [activeUsers, search, deptFilter, positionFilter, sortByStartDate])

  const filteredIds = useMemo(() => filtered.map((u) => u.uid), [filtered])
  const selectAllState = computeGroupState(filteredIds, draft, enrolledUserIds)

  function toggleSelectAllFiltered() {
    const selectableIds = filteredIds.filter((id) => !enrolledUserIds.has(id))
    setDraft((p) => {
      const n = new Set(p)
      if (selectAllState === 'checked') selectableIds.forEach((id) => n.delete(id))
      else selectableIds.forEach((id) => n.add(id))
      return n
    })
  }

  return (
    <SidePanel title="มอบหมายรายบุคคล" onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={() => { onConfirm(Array.from(draft)); onClose() }} />}
    >
      <div className="p-3 border-b border-gray-100 sticky top-0 bg-white z-10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัสพนักงาน หรือตำแหน่ง..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          {departments.length > 0 && (
            <div className="w-52 shrink-0">
              <FilterCombobox value={deptFilter} onChange={setDeptFilter} options={departments} placeholder="ทุกแผนก" />
            </div>
          )}
          {positions.length > 0 && (
            <div className="w-52 shrink-0">
              <FilterCombobox value={positionFilter} onChange={setPositionFilter} options={positions} placeholder="ทุกตำแหน่ง" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <GroupCheckbox state={selectAllState} onChange={toggleSelectAllFiltered} />
            <span className="text-xs font-bold text-gray-600">เลือกทั้งหมด ({filteredIds.length} คน)</span>
          </label>
          <button type="button"
            onClick={() => setSortByStartDate((s) => s === 'asc' ? 'desc' : 'asc')}
            className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
              sortByStartDate !== 'none' ? 'text-freshket-600 bg-freshket-50' : 'text-gray-400 hover:bg-gray-50'
            }`}>
            วันเริ่มงาน
            <svg className={`size-3 transition-transform ${sortByStartDate === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบพนักงาน</p>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white z-[5]">
            <tr className="border-b border-gray-100">
              <th className="w-10 px-4 py-2.5"></th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">ชื่อ</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">รหัสพนักงาน</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">ตำแหน่ง</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">แผนก</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">วันเริ่มงาน</th>
              <th className="w-24 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isEnrolled = enrolledUserIds.has(u.uid)
              const checked = draft.has(u.uid) || isEnrolled
              return (
                <tr key={u.uid}
                  onClick={() => !isEnrolled && toggleDraft(u.uid)}
                  className={`border-b border-gray-50 transition-colors ${isEnrolled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={checked} disabled={isEnrolled} onChange={() => toggleDraft(u.uid)} onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-4 shrink-0 disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                        {u.photoURL
                          ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                          : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                      </div>
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {u.displayNameEN || u.displayName}
                        {u.nickname && <span className="text-gray-400 font-normal"> ({u.nickname})</span>}
                      </p>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap font-mono">{u.employeeId ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-600 truncate max-w-48">{u.position ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-600 truncate max-w-48">{u.department ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-600 whitespace-nowrap">{u.startDate ? formatDateEN(u.startDate) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    {isEnrolled && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">เรียนแล้ว</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </SidePanel>
  )
}

// ── Department → Team Picker ───────────────────────────────────────────────────
interface DeptTreeNode {
  id: string; name: string
  teams: { id: string; name: string; memberIds: string[] }[]
  unassignedIds: string[]
}

function DepartmentTeamPicker({ deptTree, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  deptTree: DeptTreeNode[]; assignedIds: string[]; enrolledUserIds: Set<string>
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleDraftGroup(userIds: string[], checked: boolean) {
    setDraft((p) => {
      const n = new Set(p)
      if (checked) userIds.forEach((id) => n.add(id))
      else userIds.forEach((id) => n.delete(id))
      return n
    })
  }

  return (
    <SidePanel title="เลือกสังกัด" onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={() => { onConfirm(Array.from(draft)); onClose() }} />}
    >
      {deptTree.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบข้อมูลแผนก</p>
      ) : deptTree.map((dept) => {
        const allDeptIds = [...dept.unassignedIds, ...dept.teams.flatMap((t) => t.memberIds)]
        const state = computeGroupState(allDeptIds, draft, enrolledUserIds)
        const isOpen = expanded.has(dept.id)
        return (
          <div key={dept.id} className="border-b border-gray-100">
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
              <button type="button" onClick={() => toggleExpand(dept.id)} className="shrink-0 text-gray-400 hover:text-gray-600">
                <svg className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <GroupCheckbox state={state} onChange={() => toggleDraftGroup(allDeptIds.filter((id) => !enrolledUserIds.has(id)), state !== 'checked')} />
              <button type="button" onClick={() => toggleExpand(dept.id)} className="flex-1 min-w-0 text-left">
                <span className="text-sm font-bold text-gray-800 truncate">{dept.name}</span>
              </button>
              <span className="text-xs text-gray-400 shrink-0">{allDeptIds.length} คน</span>
            </div>
            {isOpen && (
              <div className="pl-10 pb-2 space-y-0.5">
                {dept.teams.map((team) => {
                  const tState = computeGroupState(team.memberIds, draft, enrolledUserIds)
                  return (
                    <label key={team.id} className="flex items-center gap-2 pr-4 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                      <GroupCheckbox state={tState} onChange={() => toggleDraftGroup(team.memberIds.filter((id) => !enrolledUserIds.has(id)), tState !== 'checked')} />
                      <span className="text-xs text-gray-600 flex-1 truncate">{team.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{team.memberIds.length} คน</span>
                    </label>
                  )
                })}
                {dept.unassignedIds.length > 0 && (
                  <label className="flex items-center gap-2 pr-4 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                    <GroupCheckbox
                      state={computeGroupState(dept.unassignedIds, draft, enrolledUserIds)}
                      onChange={() => toggleDraftGroup(dept.unassignedIds.filter((id) => !enrolledUserIds.has(id)), computeGroupState(dept.unassignedIds, draft, enrolledUserIds) !== 'checked')}
                    />
                    <span className="text-xs text-gray-400 flex-1 italic">ยังไม่มีทีม</span>
                    <span className="text-xs text-gray-400 shrink-0">{dept.unassignedIds.length} คน</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )
      })}
    </SidePanel>
  )
}

// ── Generic condition group picker (rank / position / tenure) ─────────────────
function ConditionGroupPicker({ title, groups, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  title: string; groups: { key: string; label: string; userIds: string[] }[]
  assignedIds: string[]; enrolledUserIds: Set<string>
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))

  function toggleDraftGroup(userIds: string[], checked: boolean) {
    setDraft((p) => {
      const n = new Set(p)
      if (checked) userIds.forEach((id) => n.add(id))
      else userIds.forEach((id) => n.delete(id))
      return n
    })
  }

  return (
    <SidePanel title={title} onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={() => { onConfirm(Array.from(draft)); onClose() }} />}
    >
      {groups.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบข้อมูล</p>
      ) : groups.map((g) => {
        const state = computeGroupState(g.userIds, draft, enrolledUserIds)
        return (
          <label key={g.key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
            <GroupCheckbox state={state} onChange={() => toggleDraftGroup(g.userIds.filter((id) => !enrolledUserIds.has(id)), state !== 'checked')} />
            <span className="flex-1 text-sm font-bold text-gray-800 truncate">{g.label}</span>
            <span className="text-xs text-gray-400 shrink-0">{g.userIds.length} คน</span>
          </label>
        )
      })}
    </SidePanel>
  )
}

// ── Save confirmation modal ─────────────────────────────────────────────────────
function SaveConfirmationModal({ recipientCount, skippedCount, saving, onBack, onConfirm }: {
  recipientCount: number; skippedCount: number; saving: boolean
  onBack: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="size-14 rounded-full bg-freshket-100 flex items-center justify-center mx-auto mb-4">
          <svg className="size-7 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1">ยืนยันการบันทึกหลักสูตร</h3>
        <p className="text-sm text-gray-600 mb-1">จะแจ้งเตือนผู้เรียน <span className="font-bold text-freshket-600">{recipientCount} คน</span></p>
        {skippedCount > 0 && (
          <p className="text-xs text-gray-400 mb-1">ข้าม {skippedCount} คนที่เรียนไปแล้ว</p>
        )}
        <p className="text-xs text-gray-400 mb-6">ผู้ใช้ที่เคยเรียนคอร์สนี้แล้วจะไม่ถูกส่งซ้ำ</p>
        <div className="flex gap-3">
          <button onClick={onBack} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60">
            ย้อนกลับ
          </button>
          <button onClick={() => onConfirm()} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <><span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังบันทึก...</> : 'ยืนยันและบันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Course Builder (full-page, sidebar tabs) ──────────────────────────────────
type BuilderTab = 'details' | 'lessons' | 'quiz' | 'learners' | 'summary'

// Order = setup first, then the read-only report. "สรุปผลการเรียน" sits last
// because it reports on the course rather than configuring it. "แบบทดสอบ"
// follows "บทเรียน" because it configures the quiz lessons created there.
const BUILDER_TABS: { id: BuilderTab; label: string }[] = [
  { id: 'details',  label: 'รายละเอียดคอร์ส' },
  { id: 'lessons',  label: 'บทเรียน' },
  { id: 'quiz',     label: 'แบบทดสอบ' },
  { id: 'learners', label: 'กำหนดผู้เรียน' },
  { id: 'summary',  label: 'สรุปผลการเรียน' },
]

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type FormState = {
  title: string; description: string; category: CourseCategory; level: CourseLevel
  durationMinutes: string; isRequired: boolean; targetRoles: UserRole[]
  thumbnailUrl: string; slideUrl: string; formUrl: string
  startDate: string; endDate: string
  instructorId: string; courseAdminIds: string[]; introVideoUrl: string
  hasCertificate: boolean; allowRetake: boolean
  topics: CourseTopic[]
  assignedUserIds: string[]
  hasKeyTakeAway: boolean; keyTakeAwayPrompt: string
  quizEnabled: boolean
  isPublished: boolean
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
    targetRoles: c.targetRoles as UserRole[],
    thumbnailUrl: c.thumbnailUrl ?? '', slideUrl: (c as Course & { slideUrl?: string }).slideUrl ?? '',
    formUrl: c.formUrl ?? '',
    startDate: toInputDate(c.startDate), endDate: toInputDate(c.endDate),
    instructorId: c.instructorId ?? '', courseAdminIds: c.courseAdminIds ?? [],
    introVideoUrl: c.introVideoUrl ?? '',
    hasCertificate: !!c.hasCertificate, allowRetake: !!c.allowRetake,
    topics: c.topics ?? [],
    assignedUserIds: c.assignedUserIds ?? [],
    hasKeyTakeAway: !!c.hasKeyTakeAway,
    keyTakeAwayPrompt: c.keyTakeAwayPrompt ?? '',
    // Older courses predate this flag: infer it from whether any lesson
    // already carries a pre/post role, so opening one doesn't silently read
    // as "quizzes off" and strip the roles on the next save.
    quizEnabled: c.quizEnabled ?? (c.topics ?? []).some((t) => t.lessons.some((l) => !!l.quizRole)),
    isPublished: c.isPublished,
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
  if (id === 'learners') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
  if (id === 'summary') return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  )
}

// article/link/assignment removed from the picker — unused lesson formats.
// Existing lessons of those types (if any) are left as-is in Firestore; this
// only stops new ones from being created.
const LESSON_TYPES: LessonType[] = ['video', 'file', 'quiz']

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

// Full course preview: browse every topic/lesson exactly as a learner's lesson
// list is laid out. Takes the full assessments list (not one resolved
// assessment) because "เริ่มทำแบบฝึกหัด" on a quiz-type lesson needs THAT
// lesson's own assessmentId — each quiz-type lesson can link a different
// question set.
function LessonPreviewModal({ topics, assessments, onClose }: {
  topics: CourseTopic[]; assessments: Assessment[]; onClose: () => void
}) {
  const sortedTopics = topics.slice().sort((a, b) => a.order - b.order)
  const firstLesson = sortedTopics.find((t) => t.lessons.length > 0)?.lessons[0]
  const [selectedId, setSelectedId] = useState<string | undefined>(firstLesson?.id)

  const selectedLesson = sortedTopics
    .flatMap((t) => t.lessons)
    .find((l) => l.id === selectedId)

  const activeQuizAssessment = assessments.find((a) => a.id === selectedLesson?.assessmentId)

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

        {sortedTopics.every((t) => t.lessons.length === 0) ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">ยังไม่มีบทเรียน — เพิ่มหัวข้อและบทเรียนก่อนเพื่อดูตัวอย่าง</div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: topics/lessons list */}
            <div className="w-64 shrink-0 border-r border-gray-100 overflow-y-auto p-3 space-y-3">
              {sortedTopics.map((t) => (
                <div key={t.id}>
                  <p className="text-xs font-bold text-gray-400 px-1.5 mb-1 truncate">{t.title}</p>
                  <div className="space-y-0.5">
                    {t.lessons.slice().sort((a, b) => a.order - b.order).map((l) => (
                      <button key={l.id} type="button" onClick={() => setSelectedId(l.id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${selectedId === l.id ? 'bg-freshket-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <LessonTypeIcon type={l.type} className="size-3.5 shrink-0" />
                        <span className="flex-1 truncate">{l.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right: content viewer. A quiz lesson gets the full height of the
                pane (and no max-width) so an embedded Google Form renders at
                the size a learner actually sees, instead of scrolling inside a
                short box. Every other lesson type keeps the reading column. */}
            <div className={`flex-1 p-6 ${selectedLesson?.type === 'quiz' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
              {!selectedLesson ? (
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
                      <div className="flex-1 min-h-0 flex flex-col">
                        <QuizPreviewInline key={selectedLesson.id} assessment={activeQuizAssessment} />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">ยังไม่ได้เลือกชุดคำถามสำหรับบทเรียนนี้ — ไปที่การ์ด &quot;เลือกแบบฝึกหัด&quot; ด้านซ้ายเพื่อเลือก</p>
                    )
                  )}

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
  const full = (u.displayNameEN ?? '').trim() || u.displayName || u.email
  return u.nickname ? `${full} (${u.nickname})` : full
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
    authedFetch('/api/resolve-form-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: assessment.googleFormUrl }),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!cancelled) setResolvedFormUrl(json.resolvedUrl)
      })
      .catch(() => { /* falls back to showing the raw link below */ })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
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
          <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '70vh' }}>
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
// Pre/post roles and per-assessment timer/anti-cheat settings are NOT edited
// here — they live in the course builder's "แบบทดสอบ" tab, which sees every
// quiz lesson at once and so can enforce "one pre-test, one post-test" across
// the whole course. This editor only picks WHICH assessment a lesson links to.
function LessonEditor({ lesson, assessments, onChange, onDelete }: {
  lesson: CourseLesson; assessments: Assessment[]
  onChange: (patch: Partial<CourseLesson>) => void
  onDelete: () => void
}) {
  // "แก้ไข" configures the lesson; "ตัวอย่างแบบทดสอบ" (only shown once an
  // assessment is linked) previews its actual content — embedded form or full
  // question list — without leaving this pane. Resets to "แก้ไข" on lesson
  // switch so opening a different lesson never lands mid-preview.
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit')
  useEffect(() => { setEditorTab('edit') }, [lesson.id])
  const currentAssessment = assessments.find((a) => a.id === lesson.assessmentId)

  return (
    <>
    {/* Sub-tabs: "แก้ไข" configures the lesson; "ตัวอย่างแบบทดสอบ" (quiz
        lessons with an assessment linked only) previews it in place — no
        modal, so switching back and forth keeps the same scroll position. */}
    {lesson.type === 'quiz' && currentAssessment && (
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
        <button type="button" onClick={() => setEditorTab('edit')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${editorTab === 'edit' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          แก้ไข
        </button>
        <button type="button" onClick={() => setEditorTab('preview')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${editorTab === 'preview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          ตัวอย่างแบบทดสอบ
        </button>
      </div>
    )}

    {lesson.type === 'quiz' && currentAssessment && editorTab === 'preview' ? (
      <AssessmentPreviewContent assessment={currentAssessment} />
    ) : (
    <div className="max-w-2xl space-y-5">
      {/* Format cards — large tile selector */}
      <div>
        <label className="text-xs font-bold text-gray-600 block mb-2">รูปแบบบทเรียน</label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
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
        <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อบทเรียน<span className="text-rose-500">*</span></label>
        <input type="text" value={lesson.title} onChange={(e) => onChange({ title: e.target.value })}
          placeholder="เช่น บทเรียน #1"
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
            <input type="url" value={lesson.videoUrl ?? ''} onChange={(e) => onChange({ videoUrl: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
            />
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
          <input type="url" value={lesson.fileUrl ?? ''} onChange={(e) => onChange({ fileUrl: e.target.value })}
            placeholder="https://docs.google.com/presentation/d/..."
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
          />
          <p className="text-xs text-gray-400">วางลิงก์ Google Slides (ตั้งค่าแชร์เป็น "ทุกคนที่มีลิงก์" ก่อน) ระบบจะฝังสไลด์แสดงในหน้าเรียนโดยตรง — ไฟล์ประเภทอื่นที่แชร์ลิงก์แบบสาธารณะยังเปิดได้ แต่จะเปิดเป็นแท็บใหม่แทน</p>
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

      {lesson.type === 'quiz' && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5">
          <p className="text-xs font-bold text-gray-600 mb-1">แบบทดสอบของบทเรียนนี้</p>
          {currentAssessment ? (
            <p className="text-xs text-gray-500">
              กำลังใช้งาน: <span className="font-bold text-freshket-700">{currentAssessment.title}</span>
              {lesson.quizRole && (
                <span className="ml-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">
                  {lesson.quizRole === 'pre_test' ? 'Pre-Test' : 'Post-Test'}
                </span>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-400">ยังไม่ได้เลือกแบบทดสอบ</p>
          )}
          <p className="text-xs text-gray-400 mt-1.5">
            เลือกแบบทดสอบและตั้งค่าเวลา / ก่อน-หลังเรียน ได้ที่แท็บ &quot;แบบทดสอบ&quot; ในเมนูด้านซ้าย
          </p>
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
    )}
    </>
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
function QuizSettingsTab({ enabled, onEnable, topics, onChangeTopics, assessments }: {
  enabled: boolean
  onEnable: () => void
  topics: CourseTopic[]
  onChangeTopics: (t: CourseTopic[]) => void
  assessments: Assessment[]
}) {
  const quizLessons = topics
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((t) => t.lessons.slice().sort((a, b) => a.order - b.order).map((l) => ({ topic: t, lesson: l })))
    .filter(({ lesson }) => lesson.type === 'quiz')

  // Setting a role clears whichever OTHER lesson held it — at most one lesson
  // per course may be the pre-test, and one the post-test.
  function setQuizRole(lessonId: string, role: 'pre_test' | 'post_test' | undefined) {
    onChangeTopics(topics.map((t) => ({
      ...t,
      lessons: t.lessons.map((l) => {
        if (l.id === lessonId) return { ...l, quizRole: role }
        if (role && l.quizRole === role) return { ...l, quizRole: undefined }
        return l
      }),
    })))
  }

  function setLessonAssessment(lessonId: string, assessmentId: string | undefined) {
    onChangeTopics(topics.map((t) => ({
      ...t,
      lessons: t.lessons.map((l) => (l.id === lessonId ? { ...l, assessmentId } : l)),
    })))
  }

  if (!enabled) {
    return (
      <div className="w-full px-6 py-8">
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <div className="size-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="size-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">ยังไม่เปิดใช้งานแบบทดสอบ</p>
          <p className="text-sm text-gray-400 mb-5">เปิดใช้งานเพื่อกำหนดค่าแบบทดสอบสำหรับหลักสูตรนี้</p>
          <button type="button" onClick={onEnable}
            className="px-5 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all">
            เปิดใช้งานแบบทดสอบ
          </button>
        </div>
      </div>
    )
  }

  if (quizLessons.length === 0) {
    return (
      <div className="w-full px-6 py-8">
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <div className="size-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="size-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">ยังไม่มีบทเรียนแบบฝึกหัดในหลักสูตรนี้</p>
          <p className="text-sm text-gray-400">ไปที่แท็บ &quot;บทเรียน&quot; แล้วเพิ่มบทเรียนชนิด &quot;แบบฝึกหัด&quot; ก่อน จากนั้นกลับมาตั้งค่าที่นี่</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-6 py-8 space-y-4">
      <p className="text-xs text-gray-400">
        เปิดใช้งานแบบทดสอบของแต่ละบทเรียน แล้วเลือกว่าเป็นแบบทดสอบก่อนเรียนหรือหลังเรียน และใช้แบบทดสอบจากที่ใด
      </p>
      {quizLessons.map(({ topic, lesson }) => (
        <QuizLessonSettingsCard
          key={lesson.id}
          topicTitle={topic.title}
          lesson={lesson}
          assessments={assessments}
          otherPreTestTitle={topics.flatMap((t) => t.lessons).find((l) => l.id !== lesson.id && l.quizRole === 'pre_test')?.title}
          otherPostTestTitle={topics.flatMap((t) => t.lessons).find((l) => l.id !== lesson.id && l.quizRole === 'post_test')?.title}
          onSetQuizRole={(role) => setQuizRole(lesson.id, role)}
          onSetAssessment={(id) => setLessonAssessment(lesson.id, id)}
        />
      ))}
    </div>
  )
}

function QuizLessonSettingsCard({
  topicTitle, lesson, assessments, otherPreTestTitle, otherPostTestTitle,
  onSetQuizRole, onSetAssessment,
}: {
  topicTitle: string
  lesson: CourseLesson
  assessments: Assessment[]
  otherPreTestTitle?: string
  otherPostTestTitle?: string
  onSetQuizRole: (role: 'pre_test' | 'post_test' | undefined) => void
  onSetAssessment: (assessmentId: string | undefined) => void
}) {
  const router = useRouter()
  const enabled = !!lesson.quizRole
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
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('0')
  const [antiCheatEnabled, setAntiCheatEnabled] = useState(false)
  const [description, setDescription] = useState('')
  useEffect(() => {
    setTimeLimitMinutes(String(currentAssessment?.timeLimitMinutes ?? 0))
    setAntiCheatEnabled(currentAssessment?.antiCheatEnabled ?? false)
    setDescription(currentAssessment?.description ?? '')
  }, [currentAssessment?.id, currentAssessment?.timeLimitMinutes, currentAssessment?.antiCheatEnabled, currentAssessment?.description])

  // Turning the row on defaults to post-test, the commoner case; turning it off
  // clears the role AND the pre/post column this lesson fed.
  async function toggleEnabled() {
    if (enabled) { onSetQuizRole(undefined); return }
    onSetQuizRole('post_test')
  }

  // "ใช้เป็นแบบทดสอบก่อนเรียน": ON means the learner sits this quiz BEFORE the
  // course as well as after, so the pair produces a before/after score; OFF
  // means it is the post-test only. Claiming a role another lesson already
  // holds re-tags it here and clears it there, confirmed first.
  async function handleSetRole(next: boolean) {
    const role = next ? 'pre_test' : 'post_test'
    const holder = next ? otherPreTestTitle : otherPostTestTitle
    if (holder) {
      const ok = await confirmAction({
        title: next ? 'ย้ายป้าย Pre-Test มาที่บทเรียนนี้?' : 'ย้ายป้าย Post-Test มาที่บทเรียนนี้?',
        text: `บทเรียน "${holder}" กำลังถือป้ายนี้อยู่ — จะถูกยกเลิกป้ายนั้นให้อัตโนมัติ`,
        confirmText: 'ยืนยัน',
        cancelText: 'ยกเลิก',
      })
      if (!ok) return
    }
    onSetQuizRole(role)
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
    setSaving(true)
    try {
      if (!DEMO_MODE) {
        await updateDoc(doc(getClientFirestore(), 'assessments', currentAssessment.id), {
          timeLimitMinutes: Number(timeLimitMinutes) || 0,
          antiCheatEnabled,
          description: description.trim(),
        })
      }
    } catch (e) {
      void alertError('บันทึกการตั้งค่าไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const isPreTest = lesson.quizRole === 'pre_test'
  // Unpublished assessments are drafts — a learner opening the lesson would hit
  // a 403 from /api/assessment/[id]/take, so they must not be selectable here.
  const filtered = assessments
    .filter((a) => a.isPublished)
    .filter((a) => (source === 'google_form' ? !!a.googleFormUrl : !a.googleFormUrl))
    .filter((a) => a.title.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className={`rounded-2xl border bg-white transition-all ${enabled ? 'border-freshket-200 shadow-sm' : 'border-gray-100'}`}>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 truncate">{topicTitle}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{lesson.title || 'บทเรียนแบบฝึกหัด'}</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {enabled && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700">
              {isPreTest ? 'ก่อน + หลังเรียน' : 'หลังเรียน'}
            </span>
          )}
          <button type="button" onClick={toggleEnabled}
            title={enabled ? 'ปิดใช้งานแบบทดสอบของบทเรียนนี้' : 'เปิดใช้งานแบบทดสอบของบทเรียนนี้'}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${enabled ? 'bg-freshket-500' : 'bg-gray-200'}`}>
            <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
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
          <p className="-mt-2.5 text-xs text-gray-400">
            {isPreTest
              ? 'ผู้เรียนจะทำแบบทดสอบนี้ทั้งก่อนเรียนและหลังเรียน (มีคะแนน Pre-Test และ Post-Test)'
              : 'ผู้เรียนจะทำแบบทดสอบนี้หลังเรียนจบเท่านั้น (มีเฉพาะคะแนน Post-Test)'}
          </p>

          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">ใช้แบบทดสอบจาก</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSource('self')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${source === 'self' ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-500 border-gray-200 hover:border-freshket-300'}`}>
                สร้างเอง (Internal)
              </button>
              <button type="button" onClick={() => setSource('google_form')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${source === 'google_form' ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-500 border-gray-200 hover:border-freshket-300'}`}>
                Google Form
              </button>
            </div>
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
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">เวลาในการทำแบบทดสอบ</label>
                <div className="relative">
                  <input type="number" min={0} value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-freshket-500 pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">นาที</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">ใส่ 0 = ไม่จำกัดเวลา</p>
              </div>

              <div className="flex items-center justify-between gap-3">
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
            <p className="text-xs text-gray-400">เลือกแบบทดสอบก่อน จึงจะตั้งเวลาและ Anti-Cheat ได้</p>
          )}
        </div>
      )}
    </div>
  )
}

function LessonsBuilder({ topics, onChange, assessments }: {
  topics: CourseTopic[]; onChange: (t: CourseTopic[]) => void; assessments: Assessment[]
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [dragTopic, setDragTopic] = useState<number | null>(null)
  const [dragLesson, setDragLesson] = useState<{ topicId: string; index: number } | null>(null)
  const [dropTopic, setDropTopic] = useState<number | null>(null)

  function addTopic() {
    const t: CourseTopic = { id: makeId(), title: `หัวข้อ #${topics.length + 1}`, order: topics.length, lessons: [] }
    onChange([...topics, t])
  }
  function updateTopic(id: string, patch: Partial<CourseTopic>) {
    onChange(topics.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function removeTopic(id: string) {
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
    const lesson: CourseLesson = { id: makeId(), title: `บทเรียน #${topic.lessons.length + 1}`, type: 'video', order: topic.lessons.length }
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
  function removeLesson(topicId: string, lessonId: string) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
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
                <input value={topic.title} onChange={(e) => updateTopic(topic.id, { title: e.target.value })}
                  className="flex-1 min-w-0 text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:ring-1 focus:ring-freshket-300 rounded px-1.5 py-1"
                />
                <button type="button" onClick={() => removeTopic(topic.id)}
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
                      <button type="button" onClick={() => setSelectedKey(key)}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-1.5 py-2.5 text-left text-sm ${selected ? 'text-white' : 'text-gray-600'}`}>
                        <LessonTypeIcon type={lesson.type} className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{lesson.title}</span>
                      </button>
                      <button type="button" onClick={() => removeLesson(topic.id, lesson.id)}
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
        </div>
      </div>

      {/* Right: lesson editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedLesson && selectedTopic ? (
          <LessonEditor
            lesson={selectedLesson}
            assessments={assessments}
            onChange={(patch) => updateLesson(selectedTopic!.id, selectedLesson!.id, patch)}
            onDelete={() => removeLesson(selectedTopic!.id, selectedLesson!.id)}
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

const TENURE_BUCKETS: { key: string; label: string; test: (years: number) => boolean }[] = [
  { key: 'lt1',  label: 'น้อยกว่า 1 ปี', test: (y) => y < 1 },
  { key: '1to3', label: '1-3 ปี',        test: (y) => y >= 1 && y < 3 },
  { key: '3to5', label: '3-5 ปี',        test: (y) => y >= 3 && y < 5 },
  { key: 'gt5',  label: 'มากกว่า 5 ปี',   test: (y) => y >= 5 },
]

function tenureYears(startDate?: Date | string): number | null {
  if (!startDate) return null
  const d = startDate instanceof Date ? startDate : new Date(startDate as string)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
}

// Display form for the summary tab's tenure column — years/startDate is often
// well under a year for new joiners, so fall back to whole months rather than
// showing "0 ปี" for everyone in their first year.
function fmtTenure(startDate?: Date | string): string {
  const years = tenureYears(startDate)
  if (years === null) return '—'
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12))
    return `${months} เดือน`
  }
  const wholeYears = Math.floor(years)
  const months = Math.round((years - wholeYears) * 12)
  return months > 0 ? `${wholeYears} ปี ${months} เดือน` : `${wholeYears} ปี`
}

function CourseFormModal({ assessments, allUsers, allTrainingRecords, departments, teams, onDone, userId, editCourse, isSuperAdmin }: {
  assessments: Assessment[]; allUsers: UserProfile[]
  allTrainingRecords: import('@/types/tracking').TrainingRecord[]
  departments: Department[]; teams: Team[]
  onDone: (c?: Course) => void; userId: string; editCourse?: Course; isSuperAdmin: boolean
}) {
  const isEdit = !!editCourse

  // Users who already have a training record for this course — cannot be added again
  const enrolledUserIds = useMemo(() => {
    if (!editCourse?.id) return new Set<string>()
    return new Set(allTrainingRecords.filter((r) => r.courseId === editCourse.id).map((r) => r.userId))
  }, [allTrainingRecords, editCourse?.id])

  // ── Learner assignment condition derivations ──
  const deptTree: DeptTreeNode[] = useMemo(() => departments.map((dept) => ({
    id: dept.id, name: dept.name,
    teams: teams.filter((t) => t.departmentId === dept.id).map((t) => ({
      id: t.id, name: t.name, memberIds: allUsers.filter((u) => u.teamId === t.id).map((u) => u.uid),
    })),
    unassignedIds: allUsers.filter((u) => u.department === dept.name && !u.teamId).map((u) => u.uid),
  })), [departments, teams, allUsers])

  const rankGroups = useMemo(() => {
    const map = new Map<string, string[]>()
    allUsers.forEach((u) => { if (u.rank) map.set(u.rank, [...(map.get(u.rank) ?? []), u.uid]) })
    return Array.from(map.entries()).map(([label, userIds]) => ({ key: label, label, userIds }))
  }, [allUsers])

  const positionGroups = useMemo(() => {
    const map = new Map<string, string[]>()
    allUsers.forEach((u) => { if (u.position) map.set(u.position, [...(map.get(u.position) ?? []), u.uid]) })
    return Array.from(map.entries()).map(([label, userIds]) => ({ key: label, label, userIds }))
  }, [allUsers])

  const tenureGroups = useMemo(() => TENURE_BUCKETS.map((b) => ({
    key: b.key, label: b.label,
    userIds: allUsers.filter((u) => { const y = tenureYears(u.startDate); return y !== null && b.test(y) }).map((u) => u.uid),
  })), [allUsers])

  const [tab, setTab] = useState<BuilderTab>('details')
  const [form, setForm] = useState<FormState>(editCourse ? formFromCourse(editCourse) : {
    title: '', description: '', category: 'product', level: 'beginner', durationMinutes: '60',
    isRequired: false, targetRoles: ['sale', 'team_lead'],
    thumbnailUrl: '', slideUrl: '', formUrl: '', startDate: '', endDate: '',
    instructorId: '', courseAdminIds: [], introVideoUrl: '',
    hasCertificate: false, allowRetake: false, topics: [],
    assignedUserIds: [],
    hasKeyTakeAway: false, keyTakeAwayPrompt: '', quizEnabled: false,
    isPublished: true,
    isChallenge: false, challengeWindowStart: '', challengeWindowEnd: '', challengeMultiplier: '2',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // computeAssignedRows does an allUsers.find + allTrainingRecords.find per
  // assignee (O(assignees × records)) — was called inline in JSX, unmemoized,
  // recomputing on every render of this modal while the Learners tab is open.
  const assignedRows = useMemo(
    () => computeAssignedRows(form.assignedUserIds, allUsers, allTrainingRecords, editCourse?.id),
    [form.assignedUserIds, allUsers, allTrainingRecords, editCourse?.id],
  )

  // Whether the roster should show a Pre-Test/Post-Test column at all — only
  // once the admin has tagged a lesson with that role in the "แบบทดสอบ" tab.
  // A 'pre_test' lesson is sat twice (before the material and again after), so
  // it produces a post score too and lights up BOTH columns.
  const hasPreTest = useMemo(() => form.topics.some((t) => t.lessons.some((l) => l.quizRole === 'pre_test')), [form.topics])
  const hasPostTest = useMemo(() => form.topics.some((t) => t.lessons.some((l) => !!l.quizRole)), [form.topics])

  // ── Learner assignment UI state ──
  const [openPanel, setOpenPanel] = useState<'individual' | 'department' | 'rank' | 'position' | 'tenure' | null>(null)
  const [condMasterOn, setCondMasterOn] = useState(false)
  const [condToggles, setCondToggles] = useState({ department: false, rank: false, position: false, tenure: false })
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAssignedTable, setShowAssignedTable] = useState(false)
  const [showLessonPreview, setShowLessonPreview] = useState(false)

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  function removeAssignedUser(uid: string) {
    setForm((p) => ({ ...p, assignedUserIds: p.assignedUserIds.filter((id) => id !== uid) }))
  }

  // Master switch for the course's quizzes. Turning it OFF strips every
  // lesson's pre/post role — that's what stops scores reaching the Pre-Test /
  // Post-Test columns — so it's confirmed first when roles are actually set.
  // Turning it back on leaves the lessons unassigned; the tab reassigns them.
  async function toggleQuizEnabled() {
    if (form.quizEnabled) {
      const tagged = form.topics.flatMap((t) => t.lessons).filter((l) => !!l.quizRole)
      if (tagged.length > 0) {
        const ok = await confirmAction({
          title: 'ปิดใช้งานแบบทดสอบทั้งคอร์ส?',
          text: `บทเรียน ${tagged.length} รายการจะถูกยกเลิกป้าย Pre-Test / Post-Test และคะแนนจะไม่ถูกบันทึกลงคอลัมน์ทั้งสองอีก`,
          confirmText: 'ปิดใช้งาน',
          cancelText: 'ยกเลิก',
          danger: true,
        })
        if (!ok) return
      }
      setForm((p) => ({
        ...p,
        quizEnabled: false,
        topics: p.topics.map((t) => ({ ...t, lessons: t.lessons.map((l) => ({ ...l, quizRole: undefined })) })),
      }))
      return
    }
    setForm((p) => ({ ...p, quizEnabled: true }))
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
    setShowConfirm(true)
  }

  // Draft saves skip the notify-confirmation modal (nothing to notify — a draft isn't visible to anyone)
  // and force isPublished to false regardless of the toggle in the Details tab.
  function handleSaveDraft() {
    if (!validate()) return
    performSave(false)
  }

  async function performSave(publishOverride?: boolean) {
    setSaving(true)
    setSaveError(null)
    try {
      const now = new Date()
      const toTs = (s: string) => s ? Timestamp.fromDate(new Date(s)) : undefined
      const toDate = (s: string) => s ? new Date(s) : undefined
      // Firestore rejects undefined values — strip them before writing
      const omitUndef = <T extends object>(o: T) =>
        Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
      const payload = {
        title: form.title.trim(), description: form.description.trim(),
        category: form.category, level: form.level,
        durationMinutes: Number(form.durationMinutes) || 60,
        // Learner targeting is fully driven by assignedUserIds in this UI (individual + condition pickers) —
        // targetRoles is left empty so CoursesPage's OR-based visibility check relies solely on assignedUserIds.
        isRequired: form.isRequired, targetRoles: [],
        assignedUserIds: form.assignedUserIds,
        thumbnailUrl: form.thumbnailUrl.trim() || undefined,
        slideUrl: form.slideUrl.trim() || undefined,
        formUrl: form.formUrl.trim() || undefined,
        startDate: toDate(form.startDate), endDate: toDate(form.endDate),
        instructorId: form.instructorId || undefined,
        courseAdminIds: form.courseAdminIds,
        introVideoUrl: form.introVideoUrl.trim() || undefined,
        hasCertificate: form.hasCertificate,
        allowRetake: form.allowRetake,
        topics: form.topics,
        isPublished: publishOverride ?? form.isPublished,
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
        else onDone({ id: `local-${Date.now()}`, ...payload, createdBy: userId, createdAt: now, updatedAt: now } as Course)
        return
      }
      const db = getClientFirestore()
      if (isEdit && editCourse) {
        await updateDoc(doc(db, 'courses', editCourse.id), omitUndef({ ...payload, startDate: toTs(form.startDate), endDate: toTs(form.endDate), updatedAt: Timestamp.fromDate(now) }))
        onDone({ ...editCourse, ...payload, updatedAt: now })
      } else {
        const ref = await addDoc(collection(db, 'courses'), omitUndef({ ...payload, startDate: toTs(form.startDate), endDate: toTs(form.endDate), createdBy: userId, createdAt: Timestamp.fromDate(now), updatedAt: Timestamp.fromDate(now) }))
        onDone({ id: ref.id, ...payload, createdBy: userId, createdAt: now, updatedAt: now } as Course)
      }
    } catch (e) {
      console.error('performSave:', e)
      setSaveError('บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
      setShowConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  const lessonCount = form.topics.reduce((s, t) => s + t.lessons.length, 0)
  // "สรุปผลการเรียน" only makes sense once the course exists and can have real
  // training records — hide it while creating a brand-new course.
  const visibleTabs = isEdit ? BUILDER_TABS : BUILDER_TABS.filter((t) => t.id !== 'summary')

  // ── Learner summary tab: same targeting rule as LearnerResultsModal (explicit
  // assignedUserIds, falling back to target roles) so the count here always
  // matches what "กำหนดผู้เรียน" and the course card actually reflect. ──
  const summaryTargetUsers = useMemo(() => {
    if (!editCourse) return []
    if (form.assignedUserIds.length > 0) {
      const ids = new Set(form.assignedUserIds)
      return allUsers.filter((u) => ids.has(u.uid))
    }
    return allUsers.filter((u) => form.targetRoles.includes(u.role))
  }, [editCourse, form.assignedUserIds, form.targetRoles, allUsers])

  const summaryRows = useMemo(() => summaryTargetUsers.map((u) => {
    const record = editCourse ? allTrainingRecords.find((r) => r.courseId === editCourse.id && r.userId === u.uid) : undefined
    const status: TrainingStatus = record?.status ?? 'not_started'
    return { user: u, record, status }
  }), [summaryTargetUsers, allTrainingRecords, editCourse])

  const summaryStats = useMemo(() => {
    const total = summaryRows.length
    const completed = summaryRows.filter((r) => r.status === 'completed').length
    const inProgress = summaryRows.filter((r) => r.status === 'in_progress').length
    const notStarted = summaryRows.filter((r) => r.status === 'not_started').length
    const scored = summaryRows.filter((r) => r.record?.score != null)
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.record!.score ?? 0), 0) / scored.length) : null
    return { total, completed, inProgress, notStarted, avgScore }
  }, [summaryRows])

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
                    {t.id === 'summary' && summaryStats.total > 0 && (
                      <span className={`shrink-0 text-xs font-bold px-1.5 rounded-full ${isActive ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'}`}>{summaryStats.total}</span>
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

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">วันที่เริ่มคอร์ส</label>
                    <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                    />
                    <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = เผยแพร่ทันที</p>
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

                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">วันสิ้นสุด</label>
                      <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                      />
                      <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = ไม่มีกำหนด</p>
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
                      <button type="button" onClick={() => set('isPublished', !form.isPublished)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${form.isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${form.isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">เผยแพร่ทันที</span>
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
                      <span className="text-xs text-gray-600 font-normal">เรียนอีกครั้งเมื่อถึงกำหนด</span>
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
                  onEnable={toggleQuizEnabled}
                  topics={form.topics}
                  onChangeTopics={(topics) => set('topics', topics)}
                  assessments={assessments}
                />
              )}

              {/* ── Assign Learners tab ── */}
              {tab === 'learners' && (
              <div className="w-full px-6 py-8 space-y-4">
                <button type="button" onClick={() => setShowAssignedTable(true)}
                  className="group flex items-center justify-between px-3 py-2 -mx-1 rounded-xl w-[calc(100%+0.5rem)] hover:bg-gray-50 transition-colors">
                  <span className="text-xs font-bold text-gray-500">ทั้งหมด</span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 group-hover:text-freshket-600 transition-colors">
                    <svg className="size-4 text-gray-400 group-hover:text-freshket-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    {form.assignedUserIds.length}
                  </span>
                </button>

                {/* Card: Individual assignment */}
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800">มอบหมายรายบุคคล</p>
                        <p className="text-xs text-gray-400">เลือกและจัดการรายชื่อผู้เรียนของคอร์สนี้ได้โดยตรง</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setOpenPanel('individual')}
                      className="size-9 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Card: Conditional assignment */}
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${condMasterOn ? 'bg-freshket-100 text-freshket-600' : 'bg-gray-100 text-gray-400'}`}>
                        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800">มอบหมายตามเงื่อนไข</p>
                        <p className="text-xs text-gray-400">กำหนดเกณฑ์ให้ผู้ที่เข้าเงื่อนไขเป็นผู้เรียนของคอร์สนี้อัตโนมัติ</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setCondMasterOn((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0 ${condMasterOn ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                      <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${condMasterOn ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {condMasterOn && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {([
                        { key: 'department' as const, label: 'สังกัด' },
                        { key: 'rank' as const, label: 'ระดับตำแหน่ง' },
                        { key: 'position' as const, label: 'ตำแหน่ง' },
                        { key: 'tenure' as const, label: 'อายุงาน' },
                      ]).map((row) => (
                        <div key={row.key} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-700 font-normal">{row.label}</span>
                            <button type="button" onClick={() => setCondToggles((p) => ({ ...p, [row.key]: !p[row.key] }))}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${condToggles[row.key] ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                              <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${condToggles[row.key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                          {condToggles[row.key] && (
                            <button type="button" onClick={() => setOpenPanel(row.key)}
                              className="mt-2 flex items-center gap-1 text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors">
                              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              เลือก{row.label}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {form.assignedUserIds.length > 0 && (
                  <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                    <div className="max-h-80 overflow-auto">
                      <AssignedLearnersTable
                        rows={assignedRows}
                        enrolledUserIds={enrolledUserIds}
                        onRemove={removeAssignedUser}
                        courseId={editCourse?.id}
                        courseTitle={form.title}
                        hasPreTest={hasPreTest}
                        hasPostTest={hasPostTest}
                        isSuperAdmin={isSuperAdmin}
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* ── Summary tab ── */}
              {tab === 'summary' && (
              <div className="w-full px-6 py-8 space-y-4">
                {/* Overview card */}
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-sm font-bold text-gray-800 mb-4">ภาพรวมผู้เรียน</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="rounded-xl bg-slate-50 border border-gray-100 p-3.5 text-center">
                      <p className="text-xl font-black text-gray-900">{summaryStats.total}</p>
                      <p className="text-xs text-gray-400 mt-0.5">ผู้เรียนทั้งหมด</p>
                    </div>
                    <div className="rounded-xl bg-freshket-50 border border-freshket-100 p-3.5 text-center">
                      <p className="text-xl font-black text-freshket-700">{summaryStats.completed}</p>
                      <p className="text-xs text-freshket-600 mt-0.5">ผ่านแล้ว</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5 text-center">
                      <p className="text-xl font-black text-blue-700">{summaryStats.inProgress}</p>
                      <p className="text-xs text-blue-600 mt-0.5">กำลังเรียน</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 text-center">
                      <p className="text-xl font-black text-gray-600">{summaryStats.avgScore ?? '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">คะแนนเฉลี่ย</p>
                    </div>
                  </div>
                </div>

                {/* Learner table */}
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                  <div className="max-h-[28rem] overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 sticky top-0 bg-white">
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ชื่อ</th>
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ตำแหน่ง</th>
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">แผนก</th>
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">อายุงาน</th>
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">ความคืบหน้า</th>
                          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">คะแนน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryRows.length === 0 ? (
                          <tr><td colSpan={6} className="text-center text-gray-400 text-sm py-10">ยังไม่มีผู้เรียนที่กำหนด</td></tr>
                        ) : summaryRows.map(({ user: u, record, status }) => {
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
                                  <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{u.position ?? '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{u.department ?? '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtTenure(u.startDate)}</td>
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
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer */}
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
            <button type="button" onClick={handleSaveDraft} disabled={saving}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-60">
              บันทึกร่าง
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center gap-2">
              {isEdit ? 'บันทึกการแก้ไข' : 'สร้างหลักสูตร'}
            </button>
          </div>
        </div>
      </form>

      {openPanel === 'individual' && (
        <IndividualAssignmentPanel
          users={allUsers}
          assignedIds={form.assignedUserIds}
          enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => set('assignedUserIds', ids)}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'department' && (
        <DepartmentTeamPicker
          deptTree={deptTree}
          assignedIds={form.assignedUserIds}
          enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => set('assignedUserIds', ids)}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'rank' && (
        <ConditionGroupPicker
          title="เลือกระดับตำแหน่ง"
          groups={rankGroups}
          assignedIds={form.assignedUserIds}
          enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => set('assignedUserIds', ids)}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'position' && (
        <ConditionGroupPicker
          title="เลือกตำแหน่ง"
          groups={positionGroups}
          assignedIds={form.assignedUserIds}
          enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => set('assignedUserIds', ids)}
          onClose={() => setOpenPanel(null)}
        />
      )}
      {openPanel === 'tenure' && (
        <ConditionGroupPicker
          title="เลือกอายุงาน"
          groups={tenureGroups}
          assignedIds={form.assignedUserIds}
          enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => set('assignedUserIds', ids)}
          onClose={() => setOpenPanel(null)}
        />
      )}

      {showAssignedTable && (
        <AssignedLearnersTableModal
          assignedUserIds={form.assignedUserIds}
          allUsers={allUsers}
          allTrainingRecords={allTrainingRecords}
          enrolledUserIds={enrolledUserIds}
          courseId={editCourse?.id}
          courseTitle={form.title}
          hasPreTest={hasPreTest}
          hasPostTest={hasPostTest}
          isSuperAdmin={isSuperAdmin}
          onRemove={removeAssignedUser}
          onClose={() => setShowAssignedTable(false)}
        />
      )}

      {showConfirm && (
        <SaveConfirmationModal
          recipientCount={form.assignedUserIds.filter((id) => !enrolledUserIds.has(id)).length}
          skippedCount={form.assignedUserIds.filter((id) => enrolledUserIds.has(id)).length}
          saving={saving}
          onBack={() => setShowConfirm(false)}
          onConfirm={performSave}
        />
      )}

      {showLessonPreview && (
        <LessonPreviewModal
          topics={form.topics}
          assessments={assessments}
          onClose={() => setShowLessonPreview(false)}
        />
      )}
    </div>
  )
}
