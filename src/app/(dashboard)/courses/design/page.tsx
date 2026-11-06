'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { CourseManagementTabs } from '@/components/layout/CourseManagementTabs'
import { CoursePackageEditor, type PackageDraft } from '@/components/features/CoursePackageEditor'
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useCoursePackages } from '@/hooks/useFirestore'
import { save, remove, patch } from '@/lib/data/collection'
import { alertError, confirmAction } from '@/lib/ui/alert'
import { getDemoMode } from '@/lib/demo/demoMode'
import { MOCK_COURSE_PACKAGES } from '@/lib/utils/mockData'
import type { Course } from '@/types/course'
import type { CoursePackage } from '@/types/coursePackage'

const DEMO_MODE = getDemoMode()

function fmtDate(d: Date | string | undefined) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Course Design: gather existing courses into one package, in the order they should be taken, and let learners work
// through it. This is where a super_admin makes, edits, publishes and deletes them; learners meet them on My Course
// and at /courses/design/<id>.
export default function CourseDesignPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { data: liveCourses } = useCourses()
  const { data: livePackages, loading } = useCoursePackages()

  const allowed = !user || user.role === 'super_admin'
  useEffect(() => { if (!allowed) router.replace('/courses') }, [allowed, router])

  // Demo mode has no database, so its packages live here for the session.
  const [demoPackages, setDemoPackages] = useState<CoursePackage[]>(MOCK_COURSE_PACKAGES)
  const packages = DEMO_MODE ? demoPackages : livePackages
  const courses = liveCourses as Course[]
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])

  const [editing, setEditing] = useState<CoursePackage | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

  if (!allowed) return null

  async function handleSave(draft: PackageDraft) {
    const now = new Date()
    setSaving(true)
    try {
      if (DEMO_MODE) {
        setDemoPackages((prev) => editing && editing !== 'new'
          ? prev.map((p) => (p.id === editing.id ? { ...p, ...draft, updatedAt: now } : p))
          : [{ id: `package-${Date.now()}`, ...draft, createdBy: user?.uid ?? 'demo', createdAt: now, updatedAt: now }, ...prev])
      } else if (editing && editing !== 'new') {
        await save('coursePackages', { id: editing.id, ...draft, updatedAt: now })
      } else {
        await save('coursePackages', { id: '', ...draft, createdBy: user?.uid ?? '', createdAt: now, updatedAt: now })
      }
      setEditing(null)
    } catch (e) {
      void alertError('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(p: CoursePackage) {
    const next = !p.isPublished
    try {
      if (DEMO_MODE) setDemoPackages((prev) => prev.map((x) => (x.id === p.id ? { ...x, isPublished: next } : x)))
      else await patch('coursePackages', p.id, { isPublished: next, updatedAt: new Date() })
    } catch (e) {
      void alertError('เปลี่ยนสถานะไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDelete(p: CoursePackage) {
    const ok = await confirmAction({
      title: `ลบ "${p.title}"?`,
      text: 'ลบเฉพาะชุด Course Design ส่วนหลักสูตรข้างในและความคืบหน้าของผู้เรียนยังอยู่ครบ',
      confirmText: 'ลบ',
      cancelText: 'ยกเลิก',
      danger: true,
    })
    if (!ok) return
    try {
      if (DEMO_MODE) setDemoPackages((prev) => prev.filter((x) => x.id !== p.id))
      else await remove('coursePackages', p.id)
    } catch (e) {
      void alertError('ลบไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="Course Design" subtitle={`${packages.length} ชุด`} />
      <CourseManagementTabs />

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="text-sm text-gray-500">รวมหลักสูตรหลายอันเป็นชุดเดียว เรียงลำดับได้ แล้วให้ผู้เรียนเรียนต่อเนื่องในชุดนั้น</p>
          <button onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            สร้าง Course Design
          </button>
        </div>

        {!DEMO_MODE && loading ? (
          <div className="flex items-center justify-center py-20"><span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="size-12 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
            </svg>
            <p className="text-sm">ยังไม่มี Course Design กดสร้างเพื่อเริ่ม</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-bold text-gray-500 px-4 py-3">Course Design</th>
                    <th className="text-left text-xs font-bold text-gray-500 px-3 py-3">Courses (in order)</th>
                    <th className="text-center text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">Sequential</th>
                    <th className="text-center text-xs font-bold text-gray-500 px-3 py-3">Status</th>
                    <th className="text-left text-xs font-bold text-gray-500 px-3 py-3 whitespace-nowrap">Last Updated</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {packages.map((p) => {
                    const inside = p.courseIds.map((id) => byId.get(id)).filter((c): c is Course => !!c)
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/60 transition-colors align-top">
                        <td className="px-4 py-3 max-w-xs">
                          <button type="button" onClick={() => setEditing(p)} className="text-left group">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-freshket-600 transition-colors">{p.title}</p>
                            {p.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.description}</p>}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          {inside.length === 0 ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <ol className="space-y-1">
                              {inside.slice(0, 4).map((c, i) => (
                                <li key={c.id} className="flex items-center gap-2 text-xs text-gray-600 min-w-0">
                                  <span className="size-5 rounded-full bg-freshket-100 text-freshket-700 font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                  <span className="truncate max-w-[16rem]">{c.title}</span>
                                </li>
                              ))}
                              {inside.length > 4 && <li className="text-xs text-gray-400 pl-7">และอีก {inside.length - 4} หลักสูตร</li>}
                            </ol>
                          )}
                          <p className="text-xs text-gray-400 mt-1.5">{p.courseIds.length} หลักสูตร</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.sequential
                            ? <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">เรียนตามลำดับ</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${p.isPublished ? 'bg-freshket-100 text-freshket-700 border-freshket-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                            {p.isPublished ? 'เผยแพร่แล้ว' : 'ร่าง'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(p.updatedAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditing(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">แก้ไข</button>
                            <button onClick={() => router.push(`/courses/design/${p.id}`)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-freshket-700 hover:bg-freshket-50 transition-all whitespace-nowrap">ดูแบบผู้เรียน</button>
                            <button onClick={() => void togglePublish(p)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all">{p.isPublished ? 'ซ่อน' : 'เผยแพร่'}</button>
                            <button onClick={() => void handleDelete(p)} aria-label="ลบ" title="ลบ"
                              className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <CoursePackageEditor
          initial={editing === 'new' ? null : editing}
          courses={courses}
          saving={saving}
          onSave={(d) => void handleSave(d)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
