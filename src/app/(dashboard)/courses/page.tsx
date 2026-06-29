'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, updateDoc, deleteDoc, doc, collection, Timestamp } from 'firebase/firestore'
import { pushNotification } from '@/lib/notifications/push'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useAssessments, useMyTrainingRecords, useAllUsers, useAllTrainingRecords } from '@/hooks/useFirestore'
import {
  CATEGORY_LABELS,
  type Course,
  type CourseCategory,
} from '@/types/course'
import { STATUS_LABELS, type TrainingStatus } from '@/types/tracking'
import type { Assessment } from '@/types/assessment'
import type { UserProfile, UserRole } from '@/types/user'
import { getClientFirestore } from '@/lib/firebase/client'

import { getDemoMode } from '@/lib/demo/demoMode'
import { demoStore } from '@/lib/demo/demoStore'
import { COURSE_IMAGE_CATALOG } from '@/lib/utils/mockData'
const DEMO_MODE = getDemoMode()
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CourseCategory[]

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'sale',        label: 'เซลล์' },
  { value: 'team_lead',   label: 'Team Lead' },
  { value: 'manager',     label: 'Manager' },
  { value: 'super_admin', label: 'Super Admin' },
]

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

const THUMB_COLORS = [
  '#e5e7eb', '#f87171', '#fbbf24', '#34d399', '#2dd4bf',
  '#60a5fa', '#818cf8', '#e879f9', '#fb7185', '#1f2937',
]

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CoursesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: allCourses, loading } = useCourses()
  const { data: allAssessments } = useAssessments()
  const { data: allUsers } = useAllUsers()
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const { data: allTrainingRecords } = useAllTrainingRecords()
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

  const isSuperAdmin = user?.role === 'super_admin'

  const recordMap = useMemo(() => {
    const m: Record<string, TrainingStatus> = {}
    myRecords.forEach((r) => { m[r.courseId] = r.status })
    return m
  }, [myRecords])

  const visible = useMemo(() => {
    if (DEMO_MODE) {
      return allCourses.filter((c) =>
        isSuperAdmin ? true : c.isPublished && c.targetRoles.includes(user?.role ?? 'sale'),
      )
    }
    return [
      ...localCreated.filter((c) => !localDeleted.has(c.id)),
      ...allCourses
        .filter((c) => {
          if (localDeleted.has(c.id)) return false
          if (isSuperAdmin) return true
          return c.isPublished && c.targetRoles.includes(user?.role ?? 'sale')
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
      alert('ลบไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="bg-freshket-700 lg:bg-white border-b border-freshket-600 lg:border-gray-100 px-6 py-4 shrink-0">
        <h1 className="text-lg font-bold text-white lg:text-gray-900">{isSuperAdmin ? 'หลักสูตรทั้งหมด' : 'My Course'}</h1>
        <p className="text-xs text-freshket-200 lg:text-gray-400 mt-0.5">{visible.length} หลักสูตร</p>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Super admin: Create card (horizontal) ─────────────────────────── */}
        {isSuperAdmin && (
          <div className="px-6 pt-5 pb-3">
            <CreateCardHorizontal onClick={() => setShowCreate(true)} />
          </div>
        )}

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
                  onClick={() => router.push(`/courses/${course.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((course) => {
                const rec = enrollmentByCourseid[course.id] ?? { enrolled: 0, completed: 0 }
                return (
                  <CourseListRow key={course.id} course={course} status={recordMap[course.id]}
                    isSuperAdmin={isSuperAdmin}
                    allAssessments={allAssessments}
                    allUsers={allUsers}
                    enrolledCount={rec.enrolled}
                    completedCount={rec.completed}
                    onEdit={() => setEditingCourse(course)}
                    onDelete={() => setConfirmDelete(course)}
                    onClick={() => router.push(`/courses/${course.id}`)}
                  />
                )
              })}
            </div>
          )}
        </div>
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

      {(showCreate || editingCourse) && (
        <CourseFormModal
          assessments={allAssessments}
          allUsers={allUsers}
          allTrainingRecords={allTrainingRecords}
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
              // Users who already have a training record for this course must never be re-notified
              const alreadyEnrolled = new Set(
                allTrainingRecords.filter(r => r.courseId === c.id).map(r => r.userId)
              )

              if (c.isPublished && !wasPublished) {
                // First publish → notify all role-based targets who aren't already enrolled
                const targets = DEMO_MODE
                  ? demoStore.getUsers().filter(u => (c.targetRoles as string[]).includes(u.role) && !alreadyEnrolled.has(u.uid))
                  : allUsers.filter(u => (c.targetRoles as string[]).includes(u.role) && !alreadyEnrolled.has(u.uid))
                targets.forEach(u => {
                  if (u.uid !== user?.uid) {
                    pushNotification(u.uid, {
                      type: 'new_course',
                      title: `หลักสูตรใหม่: ${c.title}`,
                      body: `มีหลักสูตรใหม่สำหรับคุณ — คลิกเพื่อดูรายละเอียด`,
                      refId: c.id,
                      refPath: `/courses/${c.id}`,
                    })
                  }
                })
              } else if (c.isPublished && wasPublished && editingCourse && (c.assignedUserIds?.length ?? 0) > 0) {
                // Already-published course updated — notify only users newly added to assignedUserIds
                const prevAssigned = new Set(editingCourse.assignedUserIds ?? [])
                const newlyAdded = (c.assignedUserIds ?? []).filter(
                  id => !prevAssigned.has(id) && !alreadyEnrolled.has(id)
                )
                const targets = allUsers.filter(u => newlyAdded.includes(u.uid))
                targets.forEach(u => {
                  if (u.uid !== user?.uid) {
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

function CourseCard({ course, status, isSuperAdmin, allAssessments, allUsers, onEdit, onDelete, onClick }: {
  course: Course; status?: TrainingStatus; isSuperAdmin: boolean
  allAssessments: Assessment[]; allUsers: UserProfile[]
  onEdit: () => void; onDelete: () => void; onClick: () => void
}) {
  const gradient = CAT_GRADIENT[course.category]
  const resolvedStatus = status ?? 'not_started'
  const moduleCount = [course.hasPreAssessment, !!(course as Course & { slideUrl?: string }).slideUrl, course.hasPostAssessment].filter(Boolean).length || 1

  const linkedAssessments = allAssessments.filter(
    (a) => a.id === course.preAssessmentId || a.id === course.postAssessmentId,
  )
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
          <button onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="absolute top-2.5 left-12 z-10 size-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-gray-400 hover:bg-rose-500 hover:text-white transition-all duration-150 opacity-0 group-hover:opacity-100"
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
                <img src="https://ivpysunrulnrdykfaezk.supabase.co/storage/v1/object/public/logo-freshket/FRESHKET%20LOGO-01.png" alt="Freshket" className="size-4 object-contain" />
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
          {/* Creator + date */}
          <div className="flex items-center justify-between pt-2 text-xs text-gray-400">
            <span className="truncate">สร้างโดย {creatorName}</span>
            <span className="shrink-0 ml-2">{fmtDate(course.createdAt)}</span>
          </div>
        </div>
      </button>
    </div>
  )
}

// ── Course List Row (list view) — job-listing card style ──────────────────────
function CourseListRow({ course, status, isSuperAdmin, allAssessments, allUsers, enrolledCount = 0, completedCount = 0, onEdit, onDelete, onClick }: {
  course: Course; status?: TrainingStatus; isSuperAdmin: boolean
  allAssessments: Assessment[]; allUsers: UserProfile[]
  enrolledCount?: number; completedCount?: number
  onEdit: () => void; onDelete: () => void; onClick: () => void
}) {
  const resolvedStatus = status ?? 'not_started'

  const linkedAssessments = allAssessments.filter(
    (a) => a.id === course.preAssessmentId || a.id === course.postAssessmentId,
  )
  const questionCount = linkedAssessments.reduce((sum, a) => sum + a.questions.length, 0)
  const maxScore = linkedAssessments.reduce((sum, a) => sum + a.questions.reduce((s, q) => s + (q.points ?? 0), 0), 0)
  const creatorName = allUsers.find((u) => u.uid === course.createdBy)?.displayName ?? '—'

  // Enrollment stats
  const targetCount = (course.assignedUserIds && course.assignedUserIds.length > 0)
    ? course.assignedUserIds.length
    : allUsers.filter((u) => (course.targetRoles as string[]).includes(u.role)).length
  const enrollPct  = targetCount > 0 ? Math.min(Math.round((enrolledCount  / targetCount)  * 100), 100) : 0
  const passPct    = enrolledCount  > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0
  const passText   = passPct >= 70 ? 'text-freshket-600' : passPct >= 40 ? 'text-amber-600' : 'text-rose-500'

  return (
    <div className="bg-white rounded-xl border border-gray-100 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 px-4 py-3 group">
      <div className="flex items-start gap-4">

        {/* ── Left: main content ── */}
        <div className="flex-1 min-w-0">
          <button onClick={onClick} className="text-left w-full">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-freshket-600 hover:text-freshket-700 transition-colors line-clamp-1 flex-1 group-hover:underline">
                {course.title}
              </h3>
              {course.isChallenge && (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🏆 Challenge</span>
              )}
              {course.isRequired && (
                <span className="shrink-0 inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">บังคับ</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{course.description}</p>
          </button>

          {/* Badges */}
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
              </svg>
              {course.isPublished ? 'Published' : 'Draft'}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
              {CATEGORY_LABELS[course.category]}
            </span>
            {questionCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
                </svg>
                {questionCount} ข้อ · {maxScore} คะแนน
              </span>
            )}
          </div>

          {/* ── Enrollment stats (super admin only) ── */}
          {isSuperAdmin && (
            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-6">
              {/* Enrolled progress bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">ผู้เรียน</span>
                  <span className="text-xs font-bold text-gray-600">{enrolledCount}/{targetCount} คน · {enrollPct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 bg-blue-400" style={{ width: `${enrollPct}%` }} />
                </div>
              </div>

              {/* Pass rate — number only */}
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs text-gray-400">อัตราผ่าน</span>
                <span className={`text-lg font-bold leading-none ${enrolledCount > 0 ? passText : 'text-gray-300'}`}>
                  {enrolledCount > 0 ? `${passPct}%` : '—'}
                </span>
                <span className="text-xs text-gray-400">({completedCount}/{enrolledCount})</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: meta + admin actions ── */}
        <div className="shrink-0 text-right flex flex-col gap-1">
          <div className="flex items-center gap-1 text-xs text-gray-400 justify-end">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            {fmtDate(course.createdAt)}
          </div>
          <div className="text-xs text-gray-400 text-right">
            สร้างโดย {creatorName}
          </div>
          {isSuperAdmin && (
            <div className="flex gap-1 mt-1.5 justify-end opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all"
                title="แก้ไขหลักสูตร">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all"
                title="ลบหลักสูตร">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Image Section (redesigned) ────────────────────────────────────────────────
type ImgPickerTab = 'gallery' | 'upload' | 'ai'

function ImageSection({ value, onChange, courseTitle, courseDesc, courseId }: {
  value: string; onChange: (url: string) => void
  courseTitle: string; courseDesc: string; courseId?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(!value)
  const [pickerTab, setPickerTab] = useState<ImgPickerTab>('gallery')
  const [draft, setDraft] = useState(value)
  const [thumbError, setThumbError] = useState(false)
  // Gallery tab
  const [catalogFilter, setCatalogFilter] = useState('All')
  // Upload tab
  const [urlInput, setUrlInput] = useState(value)
  const [rawSrc, setRawSrc] = useState('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const [uploading, setUploading] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // AI tab
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [keywords, setKeywords] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState('')
  const [selectedKw, setSelectedKw] = useState('')
  const [kwLoading, setKwLoading] = useState(false)

  function openPicker() {
    setDraft(value); setUrlInput(value)
    setRawSrc(''); setCrop(undefined); setCompletedCrop(undefined)
    setKeywords([]); setSelectedKw(''); setAiPrompt(''); setSuggestion('')
    setThumbError(false)
    setPickerOpen(true)
  }

  function handleSave() {
    onChange(draft)
    setPickerOpen(false)
    setRawSrc('')
  }

  function handleCancel() {
    setPickerOpen(false)
    setRawSrc('')
    setDraft(value)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setRawSrc(reader.result as string)
    reader.readAsDataURL(file)
    setCrop(undefined); setCompletedCrop(undefined)
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 100 }, 3 / 1, width, height), width, height))
  }

  async function handleCropUpload() {
    if (!imgRef.current || !completedCrop) return
    const canvas = document.createElement('canvas')
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height
    canvas.width = Math.floor(completedCrop.width * scaleX)
    canvas.height = Math.floor(completedCrop.height * scaleY)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(imgRef.current, completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY, 0, 0, canvas.width, canvas.height)
    setUploading(true)
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', 0.9))
      const fd = new FormData()
      fd.append('file', new File([blob], 'header.jpg', { type: 'image/jpeg' }))
      fd.append('courseId', courseId ?? `tmp-${Date.now()}`)
      const r = await fetch('/api/upload/course-image', { method: 'POST', body: fd })
      const data = await r.json()
      if (data.url) { setDraft(data.url); setRawSrc('') }
    } catch { /* keep rawSrc so user can retry */ }
    finally { setUploading(false) }
  }

  async function handleGenerate() {
    const prompt = aiPrompt.trim() || courseTitle
    if (!prompt) return
    setAiLoading(true); setKeywords([]); setSuggestion(''); setSelectedKw('')
    try {
      const res = await fetch('/api/gemini/course-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseName: prompt, description: courseDesc }),
      })
      const data = await res.json()
      if (data.keywords) { setKeywords(data.keywords.slice(0, 4)); setSuggestion(data.suggestion ?? '') }
    } catch { /* silently fail */ }
    finally { setAiLoading(false) }
  }

  async function selectKeyword(kw: string) {
    setSelectedKw(kw); setKwLoading(true)
    try {
      const res = await fetch(`/api/unsplash/search?q=${encodeURIComponent(kw)}`)
      const data = await res.json()
      if (data.url) setDraft(data.url)
    } catch {
      const seed = kw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      setDraft(`https://picsum.photos/seed/${seed}/1200/400`)
    } finally { setKwLoading(false) }
  }

  const hasThumbnail = !!value && !thumbError
  const galleryCategories = ['All', ...Array.from(new Set(COURSE_IMAGE_CATALOG.map((c) => c.category)))]
  const filteredCatalog = catalogFilter === 'All' ? COURSE_IMAGE_CATALOG : COURSE_IMAGE_CATALOG.filter((c) => c.category === catalogFilter)

  return (
    <div className="relative">
      {/* ── Thumbnail preview area ── */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
        style={{ height: '160px' }}
      >
        {hasThumbnail ? (
          isImageUrl(value) ? (
            <img
              src={value}
              alt="thumbnail"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="absolute inset-0" style={{ background: value }} />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-50">
            <svg className="size-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-xs text-gray-400">คลิก "Add Thumbnail" เพื่อใส่รูปปก</p>
          </div>
        )}

        {/* Overlay buttons */}
        <div className="absolute inset-0 flex items-end justify-center pb-3 gap-2">
          <button
            type="button"
            onClick={openPicker}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/95 backdrop-blur-sm shadow text-xs font-bold text-gray-700 hover:bg-white hover:shadow-md transition-all border border-white/80"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            {hasThumbnail ? 'เปลี่ยนรูป' : 'Add Thumbnail'}
          </button>
          {hasThumbnail && (
            <button
              type="button"
              onClick={() => { onChange(''); setThumbError(false) }}
              className="size-9 flex items-center justify-center rounded-xl bg-white/95 backdrop-blur-sm shadow text-gray-500 hover:bg-rose-500 hover:text-white transition-all border border-white/80"
              title="ลบรูป"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Picker panel (overlays form content) ── */}
      {pickerOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 mx-0 bg-white rounded-b-2xl border border-gray-200 border-t-0 shadow-xl overflow-hidden z-20" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100">
            {([
              {
                id: 'gallery' as ImgPickerTab,
                label: 'Gallery',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                ),
              },
              {
                id: 'upload' as ImgPickerTab,
                label: 'Upload',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                ),
              },
              {
                id: 'ai' as ImgPickerTab,
                label: 'AI',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                ),
              },
            ] as { id: ImgPickerTab; label: string; icon: React.ReactNode }[]).map((t) => (
              <button key={t.id} type="button" onClick={() => setPickerTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-normal border-b-2 transition-all -mb-px ${
                  pickerTab === t.id
                    ? 'border-gray-900 text-gray-900 bg-white'
                    : 'border-transparent text-gray-400 hover:text-gray-600 bg-gray-50'
                }`}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4 space-y-3">

            {pickerTab === 'gallery' && (
              <>
                {/* Solid colors */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">สีพื้น</p>
                  <div className="flex flex-wrap gap-2">
                    {THUMB_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setDraft(hex)}
                        className={`size-8 rounded-lg border-2 transition-all hover:scale-110 ${
                          draft === hex ? 'border-freshket-500 scale-110 shadow-md' : 'border-transparent hover:border-gray-300'
                        }`}
                        style={{ background: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                </div>

                {/* Photos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-500">รูปภาพ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {galleryCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatalogFilter(cat)}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                            catalogFilter === cat
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {/* No image option */}
                    <button
                      type="button"
                      onClick={() => setDraft('')}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all flex flex-col items-center justify-center gap-0.5 bg-gray-50 hover:bg-gray-100 ${
                        draft === '' ? 'border-freshket-500 shadow-md' : 'border-transparent hover:border-gray-200'
                      }`}
                      style={{ aspectRatio: '3/1' }}
                      title="ไม่มีรูป"
                    >
                      <svg className="size-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-xs text-gray-400 font-normal leading-none">ไม่มีรูป</span>
                    </button>
                    {filteredCatalog.map((item) => (
                      <button
                        key={item.url}
                        type="button"
                        onClick={() => setDraft(item.url)}
                        className={`relative rounded-xl overflow-hidden border-2 transition-all hover:opacity-90 ${
                          draft === item.url ? 'border-freshket-500 shadow-md' : 'border-transparent hover:border-gray-200'
                        }`}
                        style={{ aspectRatio: '3/1' }}
                        title={item.label}
                      >
                        <img src={item.url} alt={item.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        {draft === item.url && (
                          <div className="absolute inset-0 bg-freshket-500/20 flex items-center justify-center">
                            <svg className="size-4 text-freshket-500 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {pickerTab === 'upload' && (
              <>
                {/* URL quick-enter */}
                <div>
                  <label className="text-xs text-gray-500 font-normal block mb-1.5">URL รูปภาพ (ถ้ามี)</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setDraft(e.target.value) }}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 shrink-0">หรืออัปโหลดไฟล์</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* File + Crop */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                {!rawSrc ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full py-7 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center gap-1.5 text-gray-400 hover:border-freshket-300 hover:text-freshket-500 transition-all">
                    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs font-bold">คลิกเพื่อเลือกไฟล์รูปภาพ</span>
                    <span className="text-xs">PNG, JPG, WEBP · แนะนำ 1200×400 px (3:1)</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={3 / 1} minHeight={60}>
                        <img ref={imgRef} src={rawSrc} alt="crop preview" onLoad={onImageLoad} className="max-h-48 w-full object-contain" />
                      </ReactCrop>
                    </div>
                    <p className="text-xs text-gray-400">ลาก crop area (อัตราส่วน 3:1)</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setRawSrc(''); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all">
                        เลือกใหม่
                      </button>
                      <button type="button" onClick={handleCropUpload} disabled={!completedCrop || uploading}
                        className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                        {uploading
                          ? <><span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังอัปโหลด...</>
                          : 'Crop & อัปโหลด'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Draft preview */}
                {draft && !rawSrc && (
                  <div className="rounded-xl overflow-hidden border border-freshket-200 h-16">
                    <img src={draft} alt="preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </>
            )}

            {pickerTab === 'ai' && (
              <>
                <div className="flex gap-2">
                  <input type="text" value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={courseTitle || 'พิมพ์ชื่อหลักสูตรหรือ prompt...'}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleGenerate())}
                  />
                  <button type="button" onClick={handleGenerate} disabled={aiLoading}
                    className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0">
                    {aiLoading
                      ? <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>}
                    Generate
                  </button>
                </div>
                {suggestion && <p className="text-xs text-gray-500 italic">{suggestion}</p>}
                {keywords.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">คลิก keyword เพื่อดูรูปตัวอย่าง:</p>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((kw) => (
                        <button key={kw} type="button" onClick={() => selectKeyword(kw)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            selectedKw === kw ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-600 border-gray-200 hover:border-freshket-300 hover:text-freshket-600'
                          }`}>
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : !aiLoading ? (
                  <p className="text-xs text-gray-400 text-center py-3">กด Generate เพื่อให้ AI แนะนำ keyword สำหรับรูปหน้าปก</p>
                ) : null}
                {selectedKw && (
                  <div className="h-24 rounded-xl overflow-hidden border border-freshket-200 relative bg-gray-100">
                    {kwLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="size-5 border-2 border-freshket-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : draft ? (
                      <>
                        <img src={draft} alt={selectedKw} className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">{selectedKw}</span>
                      </>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex items-center justify-end gap-2 px-4 pb-4">
            <button type="button" onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              บันทึกรูปหน้าปก
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Assessment Picker ─────────────────────────────────────────────────────────
type AssessmentSection = { enabled: boolean; mode: 'self' | 'google_form'; assessmentId: string; formUrl: string; search: string }
function defaultSection(): AssessmentSection { return { enabled: false, mode: 'self', assessmentId: '', formUrl: '', search: '' } }

function AssessmentPicker({ section, onChange, assessments, label }: {
  section: AssessmentSection; onChange: (s: Partial<AssessmentSection>) => void; assessments: Assessment[]; label: string
}) {
  const published = assessments.filter((a) => a.isPublished)
  const filteredList = section.search.trim() ? published.filter((a) => a.title.toLowerCase().includes(section.search.toLowerCase())) : published
  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">{label}</p>
        <button type="button" onClick={() => onChange({ enabled: !section.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${section.enabled ? 'bg-freshket-500' : 'bg-gray-200'}`}>
          <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform ${section.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {section.enabled && (
        <>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-white text-xs font-bold">
            {(['self', 'google_form'] as const).map((m) => (
              <button key={m} type="button" onClick={() => onChange({ mode: m })}
                className={`flex-1 py-2 transition-all ${section.mode === m ? 'bg-freshket-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {m === 'self' ? 'สร้างด้วยตัวเอง' : 'Google Form'}
              </button>
            ))}
          </div>
          {section.mode === 'self' ? (
            <div className="space-y-2">
              <input type="text" placeholder="ค้นหา Assessment..." value={section.search}
                onChange={(e) => onChange({ search: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
              />
              <div className="max-h-36 overflow-y-auto space-y-1">
                {filteredList.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-3">ไม่พบ assessment</p>
                  : filteredList.map((a) => (
                    <button key={a.id} type="button" onClick={() => onChange({ assessmentId: a.id, search: '' })}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${section.assessmentId === a.id ? 'bg-freshket-100 text-freshket-700 font-bold' : 'bg-white hover:bg-gray-100 text-gray-700'}`}>
                      {a.title} <span className="ml-1.5 text-gray-400">({a.questions.length} ข้อ)</span>
                    </button>
                  ))}
              </div>
              {section.assessmentId && !section.search && (
                <p className="text-xs text-freshket-600 font-normal">✓ เลือก: {assessments.find(a => a.id === section.assessmentId)?.title}</p>
              )}
            </div>
          ) : (
            <input type="url" value={section.formUrl} onChange={(e) => onChange({ formUrl: e.target.value })}
              placeholder="https://forms.google.com/..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Target Group Transfer ─────────────────────────────────────────────────────
function TargetGroupTransfer({ users, assignedIds, onChange, enrolledUserIds = new Set() }: {
  users: UserProfile[]; assignedIds: string[]; onChange: (ids: string[])  => void
  enrolledUserIds?: Set<string>
}) {
  const [leftChecked, setLeftChecked] = useState<Set<string>>(new Set())
  const [rightChecked, setRightChecked] = useState<Set<string>>(new Set())
  const [deptFilter, setDeptFilter] = useState('')
  const [search, setSearch] = useState('')
  const [hideEnrolled, setHideEnrolled] = useState(false)

  const assignedSet = useMemo(() => new Set(assignedIds), [assignedIds])
  const departments = useMemo(() => Array.from(new Set(users.map((u) => u.department).filter(Boolean))).sort() as string[], [users])

  // Users not yet assigned, split into selectable (no record) and locked (has record)
  const unassigned = useMemo(() => users.filter((u) => {
    if (assignedSet.has(u.uid)) return false
    if (deptFilter && u.department !== deptFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    }
    return true
  }), [users, assignedSet, deptFilter, search])

  // Selectable = no training record; locked = already enrolled
  const available = useMemo(() => unassigned.filter((u) => !enrolledUserIds.has(u.uid)), [unassigned, enrolledUserIds])
  const enrolledLeft = useMemo(() => unassigned.filter((u) => enrolledUserIds.has(u.uid)), [unassigned, enrolledUserIds])

  const selected = useMemo(() => users.filter((u) => assignedSet.has(u.uid)), [users, assignedSet])

  function toggleLeft(uid: string) {
    setLeftChecked((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleRight(uid: string) {
    setRightChecked((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }
  function toggleAllLeft() {
    if (leftChecked.size === available.length) setLeftChecked(new Set())
    else setLeftChecked(new Set(available.map((u) => u.uid)))
  }

  function moveRight() {
    if (leftChecked.size === 0) return
    onChange([...assignedIds, ...Array.from(leftChecked)])
    setLeftChecked(new Set())
  }
  function moveAllRight() {
    onChange([...assignedIds, ...available.map((u) => u.uid)])
    setLeftChecked(new Set())
  }
  function moveLeft() {
    if (rightChecked.size === 0) return
    onChange(assignedIds.filter((id) => !rightChecked.has(id)))
    setRightChecked(new Set())
  }
  function moveAllLeft() {
    onChange([])
    setRightChecked(new Set())
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="grid grid-cols-[1fr_44px_1fr] gap-2 flex-1 min-h-0">
        {/* Left box */}
        <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white min-h-0">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 shrink-0 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-600">
              พนักงานทั้งหมด ({available.length}
              {!hideEnrolled && enrolledLeft.length > 0 && <span className="font-normal text-gray-400"> +{enrolledLeft.length} เรียนแล้ว</span>}
              )
            </p>
            {enrolledLeft.length > 0 && (
              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer select-none shrink-0 hover:text-gray-700 transition-colors">
                <input type="checkbox" checked={hideEnrolled} onChange={e => setHideEnrolled(e.target.checked)}
                  className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-3 shrink-0"
                />
                ซ่อนผู้เรียนแล้ว
              </label>
            )}
          </div>
          {/* Search */}
          <div className="px-2 pt-2 shrink-0">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล..."
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
              />
            </div>
          </div>
          {/* Dept filter */}
          {departments.length > 0 && (
            <div className="px-2 pt-1.5 pb-1 flex items-center gap-1.5 shrink-0">
              <svg className="size-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="flex-1 min-w-0 text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-freshket-300 bg-white text-gray-600"
              >
                <option value="">ทุกแผนก ({departments.length} แผนก)</option>
                {departments.map(d => {
                  const cnt = users.filter(u => u.department === d && !assignedSet.has(u.uid)).length
                  return <option key={d} value={d}>{d} ({cnt})</option>
                })}
              </select>
              {deptFilter && (
                <button
                  type="button"
                  onClick={() => setDeptFilter('')}
                  title="ล้างตัวกรอง"
                  className="shrink-0 size-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {/* Select all — only counts selectable (non-enrolled) users */}
          <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
            <input type="checkbox" id="chk-all-left"
              checked={available.length > 0 && leftChecked.size === available.length}
              onChange={toggleAllLeft}
              disabled={available.length === 0}
              className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-3.5 disabled:opacity-40"
            />
            <label htmlFor="chk-all-left" className="text-xs text-gray-500 select-none">
              เลือกทั้งหมด
              {enrolledLeft.length > 0 && (
                <span className="ml-1.5 text-gray-400">({available.length} คน, เรียนแล้ว {enrolledLeft.length} คน)</span>
              )}
            </label>
          </div>
          {/* User list */}
          <div className="overflow-y-auto flex-1 min-h-0">
            {available.length === 0 && enrolledLeft.length === 0
              ? <p className="text-xs text-gray-400 text-center py-6">ไม่พบพนักงาน</p>
              : (
                <>
                  {/* Selectable users */}
                  {available.map((u) => (
                    <button key={u.uid} type="button" onClick={() => toggleLeft(u.uid)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${leftChecked.has(u.uid) ? 'bg-freshket-50' : ''}`}>
                      <input type="checkbox" checked={leftChecked.has(u.uid)} onChange={() => toggleLeft(u.uid)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-3.5 shrink-0"
                      />
                      <div className="size-7 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                        {u.photoURL
                          ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                          : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{u.department ?? u.email}</p>
                      </div>
                    </button>
                  ))}

                  {/* Enrolled users — disabled, shown at bottom with badge */}
                  {!hideEnrolled && enrolledLeft.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 bg-gray-50 border-y border-gray-100 flex items-center gap-1.5">
                        <svg className="size-3 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs text-gray-500 font-normal">เรียนแล้ว — เพิ่มซ้ำไม่ได้ ({enrolledLeft.length} คน)</span>
                      </div>
                      {enrolledLeft.map((u) => (
                        <div key={u.uid}
                          className="w-full flex items-center gap-2.5 px-3 py-2 opacity-50 cursor-not-allowed select-none">
                          <input type="checkbox" disabled checked={false}
                            className="rounded border-gray-300 size-3.5 shrink-0 opacity-0"
                          />
                          <div className="size-7 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                            {u.photoURL
                              ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                              : <span className="text-xs font-bold text-gray-400">{u.displayName[0]}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-500 truncate">{u.displayName}</p>
                            <p className="text-xs text-gray-400 truncate">{u.department ?? u.email}</p>
                          </div>
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">เรียนแล้ว</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
          </div>
        </div>

        {/* Transfer buttons */}
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <button type="button" onClick={moveRight} title="ย้ายที่เลือก"
            className="size-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-freshket-500 hover:text-white hover:border-freshket-500 text-gray-500 transition-all text-xs font-bold">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button type="button" onClick={moveAllRight} title="ย้ายทั้งหมด"
            className="size-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-freshket-500 hover:text-white hover:border-freshket-500 text-gray-500 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-200" />
          <button type="button" onClick={moveLeft} title="นำออกที่เลือก"
            className="size-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-rose-500 hover:text-white hover:border-rose-500 text-gray-500 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button type="button" onClick={moveAllLeft} title="นำออกทั้งหมด"
            className="size-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-rose-500 hover:text-white hover:border-rose-500 text-gray-500 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>

        {/* Right box */}
        <div className="flex flex-col border border-freshket-200 rounded-xl overflow-hidden bg-white min-h-0">
          <div className="bg-freshket-50 px-3 py-2 border-b border-freshket-200 shrink-0 flex items-center justify-between">
            <p className="text-xs font-bold text-freshket-700">กลุ่มเป้าหมาย ({selected.length})</p>
            {selected.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-500 text-white">{selected.length}</span>
            )}
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {selected.length === 0
              ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                  <svg className="size-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <p className="text-xs">ยังไม่มีกลุ่มเป้าหมาย</p>
                  <p className="text-xs mt-0.5">กด &gt; เพื่อเพิ่ม</p>
                </div>
              )
              : selected.map((u) => {
                const isEnrolled = enrolledUserIds.has(u.uid)
                return (
                  <div key={u.uid} className={`flex items-center gap-2.5 px-3 py-2 group hover:bg-rose-50 transition-colors ${isEnrolled ? 'opacity-75' : ''}`}>
                    <input type="checkbox" checked={rightChecked.has(u.uid)} onChange={() => toggleRight(u.uid)}
                      className="rounded border-gray-300 text-rose-500 focus:ring-rose-300 size-3.5 shrink-0"
                    />
                    <div className="size-7 rounded-full bg-freshket-100 shrink-0 overflow-hidden flex items-center justify-center">
                      {u.photoURL
                        ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                        : <span className="text-xs font-bold text-freshket-600">{u.displayName[0]}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-800 truncate">{u.displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{u.department ?? u.email}</p>
                    </div>
                    {isEnrolled && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">เรียนแล้ว</span>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Course Form Wizard (full-page) ────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4

type FormState = {
  title: string; description: string; category: CourseCategory
  durationMinutes: string; isRequired: boolean; targetRoles: UserRole[]
  thumbnailUrl: string; slideUrl: string; formUrl: string
  startDate: string; endDate: string
  assignedUserIds: string[]
  pre: AssessmentSection; post: AssessmentSection
  hasKeyTakeAway: boolean; keyTakeAwayPrompt: string
  isPublished: boolean
  // Challenge
  isChallenge: boolean
  challengeWindowStart: string
  challengeWindowEnd: string
  challengeMultiplier: string
}

function toSlideEmbedUrl(url: string): string | null {
  const m = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)
  if (!m) return null
  return `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false&delayms=0`
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
    durationMinutes: String(c.durationMinutes), isRequired: c.isRequired,
    targetRoles: c.targetRoles as UserRole[],
    thumbnailUrl: c.thumbnailUrl ?? '', slideUrl: (c as Course & { slideUrl?: string }).slideUrl ?? '',
    formUrl: c.formUrl ?? '',
    startDate: toInputDate(c.startDate), endDate: toInputDate(c.endDate),
    assignedUserIds: c.assignedUserIds ?? [],
    pre: { enabled: !!c.hasPreAssessment, mode: c.assessmentType === 'google_form' ? 'google_form' : 'self', assessmentId: c.preAssessmentId ?? '', formUrl: c.preFormUrl ?? '', search: '' },
    post: { enabled: !!c.hasPostAssessment, mode: c.assessmentType === 'google_form' ? 'google_form' : 'self', assessmentId: c.postAssessmentId ?? '', formUrl: c.postFormUrl ?? '', search: '' },
    hasKeyTakeAway: !!c.hasKeyTakeAway,
    keyTakeAwayPrompt: c.keyTakeAwayPrompt ?? '',
    isPublished: c.isPublished,
    isChallenge: !!c.isChallenge,
    challengeWindowStart: toInputDate(c.challengeWindowStart),
    challengeWindowEnd: toInputDate(c.challengeWindowEnd),
    challengeMultiplier: String(c.challengeMultiplier ?? 2),
  }
}

function CourseFormModal({ assessments, allUsers, allTrainingRecords, onDone, userId, editCourse }: {
  assessments: Assessment[]; allUsers: UserProfile[]
  allTrainingRecords: import('@/types/tracking').TrainingRecord[]
  onDone: (c?: Course) => void; userId: string; editCourse?: Course
}) {
  const isEdit = !!editCourse

  // Users who already have a training record for this course — cannot be added again
  const enrolledUserIds = useMemo(() => {
    if (!editCourse?.id) return new Set<string>()
    return new Set(allTrainingRecords.filter((r) => r.courseId === editCourse.id).map((r) => r.userId))
  }, [allTrainingRecords, editCourse?.id])
  const [step, setStep] = useState<WizardStep>(1)
  const [form, setForm] = useState<FormState>(editCourse ? formFromCourse(editCourse) : {
    title: '', description: '', category: 'product', durationMinutes: '60',
    isRequired: false, targetRoles: ['sale', 'team_lead'],
    thumbnailUrl: '', slideUrl: '', formUrl: '', startDate: '', endDate: '',
    assignedUserIds: [], pre: defaultSection(), post: defaultSection(),
    hasKeyTakeAway: false, keyTakeAwayPrompt: '',
    isPublished: true,
    isChallenge: false, challengeWindowStart: '', challengeWindowEnd: '', challengeMultiplier: '2',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'กรุณากรอกชื่อหลักสูตร'
    setErrors(e)
    if (Object.keys(e).length > 0) setStep(2)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
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
        category: form.category, durationMinutes: Number(form.durationMinutes) || 60,
        isRequired: form.isRequired, targetRoles: form.targetRoles,
        assignedUserIds: form.assignedUserIds,
        thumbnailUrl: form.thumbnailUrl.trim() || undefined,
        slideUrl: form.slideUrl.trim() || undefined,
        formUrl: form.formUrl.trim() || undefined,
        startDate: toDate(form.startDate), endDate: toDate(form.endDate),
        isPublished: form.isPublished,
        hasPreAssessment: form.pre.enabled, hasPostAssessment: form.post.enabled,
        assessmentType: (form.pre.mode === 'self' || form.post.mode === 'self') ? 'self' as const : 'google_form' as const,
        preAssessmentId: form.pre.enabled && form.pre.mode === 'self' ? form.pre.assessmentId : undefined,
        postAssessmentId: form.post.enabled && form.post.mode === 'self' ? form.post.assessmentId : undefined,
        preFormUrl: form.pre.enabled && form.pre.mode === 'google_form' ? form.pre.formUrl : undefined,
        postFormUrl: form.post.enabled && form.post.mode === 'google_form' ? form.post.formUrl : undefined,
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
      console.error('handleSubmit:', e)
      setSaveError('บันทึกไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  function toggleRole(role: UserRole) {
    setForm((p) => ({ ...p, targetRoles: p.targetRoles.includes(role) ? p.targetRoles.filter((r) => r !== role) : [...p.targetRoles, role] }))
  }

  const STEPS = [
    { n: 1 as WizardStep, label: 'รูปภาพปก' },
    { n: 2 as WizardStep, label: 'ข้อมูลหลักสูตร' },
    { n: 3 as WizardStep, label: 'แบบทดสอบ' },
    { n: 4 as WizardStep, label: 'กลุ่มเป้าหมาย' },
  ]

  return (
    <div className="absolute inset-0 z-20 bg-white flex flex-col">

      {/* ── Wizard header ── */}
      <div className="shrink-0 border-b border-gray-100 bg-white">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3.5">
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

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 pb-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-0 flex-1 min-w-0">
              <button type="button"
                onClick={() => { if (s.n < step || s.n === step) return; if (s.n <= step + 1) setStep(s.n) }}
                className="flex items-center gap-2 group shrink-0">
                <div className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > s.n ? 'bg-freshket-500 text-white' : step === s.n ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  {step > s.n
                    ? <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    : s.n
                  }
                </div>
                <span className={`text-xs font-bold hidden sm:block transition-colors whitespace-nowrap ${
                  step === s.n ? 'text-gray-900' : step > s.n ? 'text-freshket-600' : 'text-gray-400'
                }`}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 transition-all ${step > s.n ? 'bg-freshket-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

          {/* ── Wizard content ── */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">

              {/* ── Step 1: Thumbnail (optional) ── */}
              {step === 1 && (
                <div className="px-6 py-6 max-w-5xl mx-auto w-full">
                  <div className="mb-4">
                    <h3 className="font-bold text-gray-900 text-base">รูปภาพปก</h3>
                    <p className="text-xs text-gray-400 mt-1">ไม่จำเป็นต้องมี — สามารถกด "ถัดไป" เพื่อข้ามได้เลย</p>
                  </div>
                  {/* Upload spec badge */}
                  <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-xl border border-gray-100">
                    <svg className="size-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <span className="text-xs text-gray-500">
                      แนะนำขนาด <span className="font-bold text-gray-700">1200 × 400 px</span> · อัตราส่วน 3:1 · ไฟล์ JPG / PNG · ไม่เกิน <span className="font-bold text-gray-700">5 MB</span>
                    </span>
                  </div>
                  <ImageSection
                    value={form.thumbnailUrl} onChange={(url) => set('thumbnailUrl', url)}
                    courseTitle={form.title} courseDesc={form.description} courseId={editCourse?.id}
                  />
                </div>
              )}

              {/* ── Step 2: Course Info — always mounted to preserve state ── */}
              <div className={step === 2 ? 'max-w-4xl mx-auto w-full px-6 py-8 grid grid-cols-2 gap-x-6 gap-y-5' : 'hidden'}>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อหลักสูตร <span className="text-rose-500">*</span></label>
                    <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)}
                      placeholder="เช่น Product Knowledge 101"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                    />
                    {errors.title && <p className="text-xs text-rose-500 mt-1">{errors.title}</p>}
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">คำอธิบายหลักสูตร</label>
                    <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
                      placeholder="อธิบายเนื้อหาและวัตถุประสงค์ของหลักสูตร..."
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">หมวดหมู่</label>
                    <select value={form.category} onChange={(e) => set('category', e.target.value as CourseCategory)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white">
                      {ALL_CATEGORIES.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">ระยะเวลา (นาที)</label>
                    <input type="number" min={1} value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">
                      <svg className="size-3.5 inline mr-1 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                      วันที่เริ่มเรียน
                    </label>
                    <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                    />
                    <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = เผยแพร่ทันที</p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">
                      <svg className="size-3.5 inline mr-1 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                      วันสิ้นสุด
                    </label>
                    <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300"
                    />
                    <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = ไม่มีกำหนด</p>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-bold text-gray-600 block">URL สไลด์ Google Slides (ถ้ามี)</label>
                    <input type="url" value={form.slideUrl} onChange={(e) => set('slideUrl', e.target.value)}
                      placeholder="https://docs.google.com/presentation/d/..."
                      className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
                    />
                    {(() => {
                      const embedUrl = form.slideUrl.trim() ? toSlideEmbedUrl(form.slideUrl.trim()) : null
                      if (!embedUrl) return null
                      return (
                        <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white">
                            <svg className="size-3.5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM5 19V5h14v14H5zm3-6h2v4H8v-4zm3-3h2v7h-2V10zm3-2h2v9h-2V8z" />
                            </svg>
                            <span className="text-xs text-gray-500">Preview Google Slides</span>
                          </div>
                          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                            <iframe
                              src={embedUrl}
                              className="absolute inset-0 w-full h-full"
                              frameBorder={0}
                              allowFullScreen
                              loading="lazy"
                            />
                          </div>
                        </div>
                      )
                    })()}
                  </div>


                  <div className="col-span-2 flex items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('isRequired', !form.isRequired)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.isRequired ? 'bg-rose-400' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform ${form.isRequired ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">บังคับเรียน</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('isPublished', !form.isPublished)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform ${form.isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">เผยแพร่ทันที</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => set('isChallenge', !form.isChallenge)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.isChallenge ? 'bg-amber-400' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform ${form.isChallenge ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="text-xs text-gray-600 font-normal">🏆 Challenge</span>
                    </div>
                  </div>

                  {form.isChallenge && (
                    <div className="col-span-2 bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-bold text-amber-700">การตั้งค่า Challenge</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-gray-600 block mb-1.5">เริ่มแข่งขัน</label>
                          <input type="date" value={form.challengeWindowStart} onChange={e => set('challengeWindowStart', e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-600 block mb-1.5">สิ้นสุดแข่งขัน</label>
                          <input type="date" value={form.challengeWindowEnd} min={form.challengeWindowStart || undefined} onChange={e => set('challengeWindowEnd', e.target.value)}
                            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">Point Multiplier</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max="5" step="0.5" value={form.challengeMultiplier} onChange={e => set('challengeMultiplier', e.target.value)}
                            className="w-24 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300" />
                          <span className="text-xs text-gray-500">× คะแนนฐาน (เช่น 2× = สองเท่า)</span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {/* ── Step 3: Assessment — always mounted ── */}
              <div className={step === 3 ? 'max-w-3xl mx-auto w-full px-6 py-8 space-y-4' : 'hidden'}>
                  <AssessmentPicker section={form.pre} onChange={(s) => setForm((p) => ({ ...p, pre: { ...p.pre, ...s } }))} assessments={assessments} label="ก่อนเรียน (Pre-Assessment)" />
                  <AssessmentPicker section={form.post} onChange={(s) => setForm((p) => ({ ...p, post: { ...p.post, ...s } }))} assessments={assessments} label="หลังเรียน (Post-Assessment)" />

                  {/* Key Take Away */}
                  <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`size-8 rounded-lg flex items-center justify-center ${form.hasKeyTakeAway ? 'bg-freshket-100 text-freshket-600' : 'bg-gray-100 text-gray-400'}`}>
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800">Key Take Away</p>
                          <p className="text-xs text-gray-400">ให้ผู้เรียนสรุปสิ่งที่ได้เรียนรู้หลังจบหลักสูตร</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setForm((p) => ({ ...p, hasKeyTakeAway: !p.hasKeyTakeAway }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${form.hasKeyTakeAway ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                        <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${form.hasKeyTakeAway ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                  </div>
              </div>

              {/* ── Step 4: Target Group ── */}
              {step === 4 && (
                <div className="px-6 pt-5 pb-4 flex flex-col" style={{ minHeight: 'calc(100dvh - 220px)' }}>
                  {/* Role-based quick filter */}
                  <div className="mb-4 shrink-0">
                    <label className="text-xs font-bold text-gray-600 block mb-2">ตำแหน่งที่เห็นหลักสูตรนี้ (role-based)</label>
                    <div className="flex flex-wrap gap-2">
                      {ROLE_OPTIONS.map(({ value, label }) => (
                        <button key={value} type="button" onClick={() => toggleRole(value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.targetRoles.includes(value) ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-500 border-gray-200 hover:border-freshket-300'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Individual assignment transfer box — fills remaining space */}
                  <div className="flex-1 flex flex-col min-h-0 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between mb-3 shrink-0">
                      <p className="text-xs font-bold text-gray-600">กำหนดรายบุคคล (Individual Assignment)</p>
                      {form.assignedUserIds.length > 0 && (
                        <span className="text-xs text-freshket-600 font-bold">{form.assignedUserIds.length} คน</span>
                      )}
                    </div>
                    <div style={{ height: 'calc(100dvh - 310px)' }}>
                      <TargetGroupTransfer
                        users={allUsers}
                        assignedIds={form.assignedUserIds}
                        onChange={(ids) => set('assignedUserIds', ids)}
                        enrolledUserIds={enrolledUserIds}
                      />
                    </div>
                  </div>
                </div>
              )}
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
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {step > 1 && (
                    <button type="button" onClick={() => setStep((step - 1) as WizardStep)}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all">
                      ← ย้อนกลับ
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 hidden sm:block">{step} / 4</span>
                  {step < 4 ? (
                    <button type="button"
                      onClick={() => setStep((step + 1) as WizardStep)}
                      className="px-5 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition-all">
                      ถัดไป →
                    </button>
                  ) : (
                    <button type="submit" disabled={saving}
                      className="px-6 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center gap-2">
                      {saving ? <><span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{isEdit ? 'กำลังบันทึก...' : 'กำลังสร้าง...'}</> : isEdit ? 'บันทึกการแก้ไข' : 'สร้างหลักสูตร'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
    </div>
  )
}
