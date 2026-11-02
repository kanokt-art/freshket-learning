'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { MyCourseTabs } from '@/components/layout/MyCourseTabs'
import { useAuth } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useCourses, useMyTrainingRecords } from '@/hooks/useFirestore'
import { authedFetch } from '@/lib/api/authedFetch'
import { alertError } from '@/lib/ui/alert'
import { libraryEntries, type LibraryEntry } from '@/lib/courses/library'
import { CATEGORY_LABELS } from '@/types/course'
import type { Course } from '@/types/course'

// Library — the courses that are not on My Course but are still the learner's to open: ones they have
// finished (to learn again, or to bring back to My Course) and ones an admin opened for anyone to
// choose (Enroll). Reached from the My Course tab bar.
export default function LibraryPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user?.role, user?.department)
  const { data: courses, loading } = useCourses()
  const { data: myRecords } = useMyTrainingRecords(user?.uid ?? '')
  const [busyId, setBusyId] = useState<string | null>(null)

  const entries = useMemo(
    () => libraryEntries(
      courses,
      myRecords,
      { uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId, employmentStatus: user?.employmentStatus },
    ),
    [courses, myRecords, user],
  )
  const finished = entries.filter((e) => e.finished)
  const open = entries.filter((e) => !e.finished)

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

  if (!user) return null

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="Library" subtitle={`หลักสูตรที่เรียนจบแล้ว และหลักสูตรที่เลือกเรียนเองได้ · ${entries.length} หลักสูตร`} />
      {user.role === 'super_admin' && <CourseManagementTabs />}
      <MyCourseTabs />

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
          <div className="px-6 pb-8 pt-4 space-y-8">
            <Section title="เลือกเรียนเองได้" hint="หลักสูตรไม่บังคับ กด Enroll เพื่อเพิ่มเข้า My Course" count={open.length} empty="ยังไม่มีหลักสูตรที่เปิดให้เลือกเรียนเอง">
              {open.map((e) => (
                <LibraryCard
                  key={e.course.id}
                  entry={e}
                  busy={busyId === e.course.id}
                  onOpen={() => router.push(`/courses/${e.course.id}`)}
                  action={e.enrolled
                    ? { label: 'ลงทะเบียนแล้ว', disabled: true }
                    : { label: 'Enroll', onClick: () => void act(e.course.id, '/api/courses/enroll', 'ลงทะเบียนไม่สำเร็จ') }}
                />
              ))}
            </Section>

            <Section title="เรียนจบแล้ว" hint="เปิดอ่านเนื้อหาได้ (ทำแบบทดสอบซ้ำได้เฉพาะหลักสูตรที่ Admin เปิดให้) หรือนำกลับมาที่ My Course" count={finished.length} empty="ยังไม่มีหลักสูตรที่เรียนจบ">
              {finished.map((e) => (
                <LibraryCard
                  key={e.course.id}
                  entry={e}
                  busy={busyId === e.course.id}
                  onOpen={() => router.push(`/courses/${e.course.id}`)}
                  action={e.dismissed
                    ? { label: 'นำกลับมาที่ My Course', onClick: () => void act(e.course.id, '/api/training-records/restore', 'นำกลับมาไม่สำเร็จ') }
                    : undefined}
                />
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, hint, count, empty, children }: { title: string; hint: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-bold text-gray-900">
          {title} <span className="ml-1 text-xs font-normal text-gray-400">{count} หลักสูตร</span>
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>
      {count === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-xs text-gray-400">{empty}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>
      )}
    </section>
  )
}

function LibraryCard({ entry, busy, onOpen, action }: {
  entry: LibraryEntry<Course>
  busy: boolean
  onOpen: () => void
  action?: { label: string; onClick?: () => void; disabled?: boolean }
}) {
  const { course } = entry
  return (
    <div className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm p-4 gap-3">
      <button type="button" onClick={onOpen} className="text-left group">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{CATEGORY_LABELS[course.category]}</p>
        <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 mt-0.5 group-hover:text-freshket-600 transition-colors">{course.title}</p>
        {course.description && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{course.description}</p>}
      </button>
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100">
        {entry.finished && (
          <span className="inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">เรียนจบแล้ว</span>
        )}
        {entry.dismissed && <span className="text-xs text-gray-400">ซ่อนจาก My Course</span>}
        <span className="flex-1" />
        {action && (
          <button
            type="button"
            disabled={busy || action.disabled}
            onClick={action.onClick}
            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-freshket-200 text-freshket-700 bg-white hover:bg-freshket-100 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-bold px-3 py-1.5 rounded-xl bg-freshket-500 text-white hover:bg-freshket-600 transition-all duration-150"
        >
          {entry.finished ? (course.allowRetake ? 'เรียนอีกครั้ง' : 'เปิดอ่าน') : 'เปิดดู'}
        </button>
      </div>
    </div>
  )
}
