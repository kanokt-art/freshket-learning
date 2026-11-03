'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { MyCourseTabs } from '@/components/layout/MyCourseTabs'
import { CourseSubTabs } from '@/components/layout/CourseSubTabs'
import { LearnerCourseGridCard } from '@/components/features/LearnerCourseDashboard'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useCourses, useMyTrainingRecords } from '@/hooks/useFirestore'
import { authedFetch } from '@/lib/api/authedFetch'
import { alertError } from '@/lib/ui/alert'
import { libraryEntries, newestEntries, recommendedEntries, type LibraryEntry, type LibraryStat } from '@/lib/courses/library'
import { readSaved, writeSaved, toggleSaved } from '@/lib/courses/savedCourses'
import { CATEGORY_LABELS, type Course, type CourseCategory } from '@/types/course'

// Library — courses that are not mandatory for the learner: ones an admin opened for anyone to choose
// (Enroll), and ones they have finished (to read again, or to bring back to Your Course). Sits beside
// Your Course under the Course tab. Browse like a catalogue: rows picked for you, search, topic chips,
// a status filter, social proof from colleagues, and a bookmark to save a course for later.
type StatusFilter = 'all' | 'available' | 'finished' | 'saved'

export default function LibraryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)
  const { data: courses, loading } = useCourses()
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CourseCategory | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [stats, setStats] = useState<Record<string, LibraryStat>>({})
  const [saved, setSaved] = useState<string[]>([])

  useEffect(() => { if (user?.uid) setSaved(readSaved(user.uid)) }, [user?.uid])

  // Counts of who took each course (never who). A failure only means the cards show no numbers.
  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    authedFetch('/api/courses/library-stats')
      .then(async (res) => { if (res.ok && !cancelled) setStats((await res.json()).stats ?? {}) })
      .catch(() => { /* no numbers */ })
    return () => { cancelled = true }
  }, [user?.uid, myRecords.length])

  const entries = useMemo(
    () => libraryEntries(
      courses,
      myRecords,
      { uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId, employmentStatus: user?.employmentStatus },
    ),
    [courses, myRecords, user],
  )
  const recordByCourse = useMemo(() => new Map(myRecords.map((r) => [r.courseId, r])), [myRecords])
  const categories = useMemo(() => Array.from(new Set(entries.map((e) => e.course.category))), [entries])
  const savedCount = entries.filter((e) => saved.includes(e.course.id)).length

  const browsing = status === 'all' && category === 'all' && !search.trim()
  const recommended = useMemo(() => recommendedEntries(entries, stats), [entries, stats])
  const newest = useMemo(() => newestEntries(entries), [entries])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (status === 'finished' && !e.finished) return false
      if (status === 'available' && e.finished) return false
      if (status === 'saved' && !saved.includes(e.course.id)) return false
      if (category !== 'all' && e.course.category !== category) return false
      if (q && !e.course.title.toLowerCase().includes(q) && !(e.course.description ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, status, category, search, saved])

  async function act(courseId: string, url: string, failTitle: string) {
    setBusyId(courseId)
    try {
      const res = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        void alertError(failTitle, typeof data.error === 'string' ? data.error : `HTTP ${res.status}`)
      }
    } catch {
      void alertError(failTitle, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setBusyId(null)
    }
  }

  function toggleSave(courseId: string) {
    if (!user?.uid) return
    const next = toggleSaved(saved, courseId)
    setSaved(next)
    writeSaved(user.uid, next)
  }

  const statsLine = (course: Course): string | undefined => {
    const s = stats[course.id]
    if (!s || s.learners === 0) return undefined
    const parts = [`${s.learners} คนเรียนแล้ว`]
    if (s.teamPeers > 0) parts.push(`ทีมคุณ ${s.teamPeers} คน`)
    else if (s.deptPeers > 0) parts.push(`แผนกคุณ ${s.deptPeers} คน`)
    const hours = Math.round((s.completed * (course.durationMinutes ?? 0)) / 60)
    if (hours >= 1) parts.push(`เรียนรวม ${hours} ชม.`)
    return parts.join(' · ')
  }

  const card = (e: LibraryEntry<Course>, keyPrefix = '') => {
    const dismissedFinished = e.finished && e.dismissed
    return (
      <LearnerCourseGridCard
        key={`${keyPrefix}${e.course.id}`}
        course={e.course}
        record={recordByCourse.get(e.course.id)}
        onClick={() => router.push(`/courses/${e.course.id}`)}
        library={{
          tag: e.finished ? undefined : 'ไม่บังคับ',
          stats: statsLine(e.course),
          note: dismissedFinished ? 'ซ่อนจาก Your Course' : undefined,
          saved: saved.includes(e.course.id),
          onToggleSave: e.finished ? undefined : () => toggleSave(e.course.id),
          action: e.finished
            ? (dismissedFinished
                ? { label: 'นำกลับมาที่ Your Course', onClick: () => void act(e.course.id, '/api/training-records/restore', 'นำกลับมาไม่สำเร็จ'), busy: busyId === e.course.id }
                : undefined)
            : e.enrolled
              ? { label: 'ลงทะเบียนแล้ว', disabled: true }
              : { label: 'Enroll', primary: true, onClick: () => void act(e.course.id, '/api/courses/enroll', 'ลงทะเบียนไม่สำเร็จ'), busy: busyId === e.course.id },
        }}
      />
    )
  }

  const filters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'available', label: 'เลือกเรียนเองได้' },
    { id: 'finished', label: 'เรียนจบแล้ว' },
    { id: 'saved', label: savedCount > 0 ? `บันทึกไว้ ${savedCount}` : 'บันทึกไว้' },
  ]

  const gridCls = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
  const rowHeading = (title: string, hint: string) => (
    <div className="mb-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
    </div>
  )

  if (!user) return null

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="My Course" subtitle={`Library · ${entries.length} หลักสูตร`} />
      {user.role === 'super_admin' && <CourseManagementTabs />}
      <MyCourseTabs />
      <CourseSubTabs />

      <div className="flex-1 overflow-auto">
        {moduleLoading || loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !allowedModules.has('lms') ? (
          <div className="flex items-center justify-center p-6 py-20">
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center max-w-xs">
              <p className="text-sm font-bold text-gray-900 mb-1">Module ไม่ได้เปิดใช้งาน</p>
              <p className="text-xs text-gray-400 leading-relaxed">หลักสูตร ยังไม่ได้เปิดสำหรับแผนกของคุณ<br />กรุณาติดต่อ Admin</p>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-8 pt-5 space-y-6">
            <div>
              <h2 className="text-base font-bold text-gray-900">Library</h2>
              <p className="text-xs text-gray-400 mt-0.5">หลักสูตรที่ไม่บังคับเรียน เลือกเรียนเองได้ตามสนใจ และหลักสูตรที่คุณเรียนจบแล้วสำหรับกลับมาอ่านทบทวน</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาหลักสูตร"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                />
              </div>
              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatus(f.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all duration-150 ${
                      status === f.id ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-500 font-normal hover:text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {categories.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                {(['all', ...categories] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1 rounded-full text-xs border transition-all duration-150 ${
                      category === c
                        ? 'bg-freshket-100 text-freshket-700 border-freshket-200 font-bold'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {c === 'all' ? 'ทุกหมวด' : CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            )}

            {/* Rows picked for the learner — only while browsing, so a search or filter is not buried under them. */}
            {browsing && recommended.length > 0 && (
              <section>
                {rowHeading('แนะนำสำหรับคุณ', 'หลักสูตรที่เพื่อนร่วมแผนกของคุณเรียนกัน')}
                <div className={gridCls}>{recommended.map((e) => card(e, 'rec-'))}</div>
              </section>
            )}
            {browsing && newest.length > 0 && (
              <section>
                {rowHeading('ใหม่ล่าสุด', 'หลักสูตรที่เพิ่งเปิดในช่วง 30 วันที่ผ่านมา')}
                <div className={gridCls}>{newest.map((e) => card(e, 'new-'))}</div>
              </section>
            )}

            <section>
              {browsing && (recommended.length > 0 || newest.length > 0) && rowHeading('หลักสูตรทั้งหมด', `${shown.length} หลักสูตร`)}
              {shown.length === 0 ? (
                <div className="rounded-2xl border border-gray-100 p-12 text-center">
                  <p className="text-sm font-bold text-gray-500">
                    {entries.length === 0
                      ? 'ยังไม่มีหลักสูตรใน Library'
                      : status === 'saved' && savedCount === 0
                        ? 'ยังไม่มีหลักสูตรที่บันทึกไว้'
                        : 'ไม่พบหลักสูตรที่ตรงกับตัวกรอง'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {entries.length === 0
                      ? 'เมื่อ Admin เปิดหลักสูตรให้เลือกเรียนเอง หรือเมื่อคุณเรียนจบหลักสูตรแรก จะมาอยู่ที่นี่'
                      : status === 'saved' && savedCount === 0
                        ? 'กดไอคอนบุ๊กมาร์กที่มุมการ์ดเพื่อเก็บไว้เรียนทีหลัง'
                        : 'ลองล้างคำค้นหรือเปลี่ยนตัวกรอง'}
                  </p>
                </div>
              ) : (
                <div className={gridCls}>{shown.map((e) => card(e))}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
