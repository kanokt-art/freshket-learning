'use client'

import { useMemo, useState } from 'react'
import { LearnerAssignmentTab } from '@/components/features/LearnerAssignmentTab'
import { CourseStructureDrawer } from '@/components/features/CourseStructureDrawer'
import { CoverImagePicker } from '@/components/features/CoverImagePicker'
import { COURSE_IMAGE_CATALOG } from '@/lib/utils/mockData'
import { PackageDashboardTab, PackageSummaryTab } from '@/components/features/PackageReportTabs'
import { moveCourse, addCourse, removeCourse } from '@/lib/courses/packages'
import { confirmAction } from '@/lib/ui/alert'
import { CATEGORY_LABELS, type Course } from '@/types/course'
import type { CoursePackage } from '@/types/coursePackage'
import type { TrainingRecord } from '@/types/tracking'
import type { Department, Team, UserProfile } from '@/types/user'

// The Course Design builder, full screen, in the shape of the course builder it takes over from: a sidebar of steps.
//   รายละเอียด    the name, which courses it holds and in what order, when it opens and closes, and whether it is live
//   กำหนดผู้เรียน   who the learners are
//   แดชบอร์ด      the charts of how they are doing          (once the Course Design exists)
//   สรุปผลการเรียน  the table of every learner's progress    (once the Course Design exists)
// A course on its own is only a draft of content; making a Course Design live is what launches its courses.

export interface PackageDraft {
  title: string
  description: string
  /** The cover image URL, or empty for none. */
  thumbnailUrl: string
  courseIds: string[]
  sequential: boolean
  isPublished: boolean
  /** yyyy-mm-dd, or empty for none. */
  startDate: string
  endDate: string
  assignedUserIds: string[]
  assignedDepartments: string[]
  assignedTeamIds: string[]
  /** Not edited here; carried through so a Course Design made from an older course keeps its role fallback. */
  targetRoles: string[]
}

const pad = (n: number) => String(n).padStart(2, '0')
function toInput(d: Date | string | undefined): string {
  if (!d) return ''
  const x = d instanceof Date ? d : new Date(d)
  return isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function draftOf(pkg: CoursePackage | null): PackageDraft {
  return {
    title: pkg?.title ?? '',
    description: pkg?.description ?? '',
    thumbnailUrl: pkg?.thumbnailUrl ?? '',
    courseIds: pkg?.courseIds ?? [],
    sequential: pkg?.sequential ?? false,
    isPublished: pkg?.isPublished ?? false,
    startDate: toInput(pkg?.startDate),
    endDate: toInput(pkg?.endDate),
    assignedUserIds: pkg?.assignedUserIds ?? [],
    assignedDepartments: pkg?.assignedDepartments ?? [],
    assignedTeamIds: pkg?.assignedTeamIds ?? [],
    targetRoles: pkg?.targetRoles ?? [],
  }
}

// The report is one tab, สรุปผลการเรียน, with two views inside it: ภาพรวม (the dashboard) and ผลการเรียนรายบุคคล.
type Tab = 'details' | 'learners' | 'dashboard'

const TAB_ICON: Record<Tab, string> = {
  details: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  learners: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  dashboard: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605',
}
const TAB_LABEL: Record<Tab, string> = { details: 'รายละเอียด', learners: 'กำหนดผู้เรียน', dashboard: 'สรุปผลการเรียน' }

function Cover({ course, className = 'size-12' }: { course: Course; className?: string }) {
  const url = course.thumbnailUrl
  if (url && (url.startsWith('http') || url.startsWith('/'))) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`${className} rounded-xl object-cover shrink-0`} />
  }
  return (
    <span className={`${className} rounded-xl bg-freshket-100 text-freshket-600 flex items-center justify-center shrink-0`}>
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
      </svg>
    </span>
  )
}

export function CoursePackageEditor({ initial, courses, allUsers, departments, teams, records, isSuperAdmin, saving, onSave, onClose }: {
  initial: CoursePackage | null
  /** Every course a package may hold. */
  courses: Course[]
  allUsers: UserProfile[]
  departments: Department[]
  teams: Team[]
  /** Training records, for who has started and for the reports. */
  records: TrainingRecord[]
  isSuperAdmin: boolean
  saving?: boolean
  onSave: (draft: PackageDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PackageDraft>(() => draftOf(initial))
  const [tab, setTab] = useState<Tab>('details')
  const [reportView, setReportView] = useState<'overview' | 'individual'>('overview')
  const [search, setSearch] = useState('')
  const [titleErr, setTitleErr] = useState('')
  const [dateErr, setDateErr] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // The course whose structure is open in the side panel.
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const set = <K extends keyof PackageDraft>(k: K, v: PackageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const tabs: Tab[] = initial ? ['details', 'learners', 'dashboard'] : ['details', 'learners']

  const chosen = draft.courseIds
  const available = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courses.filter((c) => !chosen.includes(c.id) &&
      (!q || c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)))
  }, [courses, chosen, search])

  const audience = { assignedUserIds: draft.assignedUserIds, assignedDepartments: draft.assignedDepartments, assignedTeamIds: draft.assignedTeamIds }
  const hasAudience = draft.assignedUserIds.length > 0 || draft.assignedDepartments.length > 0 || draft.assignedTeamIds.length > 0 || draft.targetRoles.length > 0

  async function handleSave() {
    if (!draft.title.trim()) { setTab('details'); setTitleErr('กรุณากรอกชื่อ Course Design'); return }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      setTab('details'); setDateErr('วันสิ้นสุดต้องไม่ก่อนวันที่เริ่ม'); return
    }
    if (draft.isPublished && chosen.length === 0) {
      setTab('details')
      void confirmAction({ title: 'ยังไม่มีหลักสูตรในชุด', text: 'เพิ่มหลักสูตรอย่างน้อยหนึ่งอัน ก่อนเผยแพร่', confirmText: 'ตกลง', cancelText: 'ปิด' })
      return
    }
    if (draft.isPublished && !hasAudience) {
      const ok = await confirmAction({
        title: 'ยังไม่ได้กำหนดผู้เรียน',
        text: 'เผยแพร่ตอนนี้จะยังไม่มีใครเห็น Course Design นี้ (ไปที่แท็บ กำหนดผู้เรียน ได้)',
        confirmText: 'เผยแพร่ต่อ',
        cancelText: 'กลับไปแก้ไข',
      })
      if (!ok) { setTab('learners'); return }
    }
    onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() })
  }

  const viewing = viewingId ? byId.get(viewingId) : undefined

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {viewing && <CourseStructureDrawer course={viewing} onClose={() => setViewingId(null)} />}
      <div className="animate-pop-in flex flex-col flex-1 min-h-0">

        <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 truncate">{initial ? 'แก้ไข Course Design' : 'สร้าง Course Design'}</h2>
              {draft.title && <p className="text-xs text-gray-400 truncate max-w-xs">{draft.title}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5" title="เผยแพร่ = ยิงหลักสูตรทั้งหมดในชุดนี้ให้ผู้เรียนที่ถูกมอบหมาย">
              <span className="text-xs text-gray-500">{draft.isPublished ? 'Published' : 'Draft'}</span>
              <button type="button" role="switch" aria-checked={draft.isPublished} aria-label="เผยแพร่" onClick={() => set('isPublished', !draft.isPublished)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${draft.isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${draft.isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-normal text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-all">ยกเลิก</button>
            <button onClick={() => void handleSave()} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all disabled:opacity-60">
              {saving
                ? <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 p-3 gap-1 shrink-0 overflow-y-auto">
            {tabs.map((t) => {
              const active = tab === t
              return (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${active ? 'bg-freshket-50 text-freshket-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className={`shrink-0 size-7 rounded-lg flex items-center justify-center transition-colors ${active ? 'bg-freshket-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICON[t]} /></svg>
                  </span>
                  <span className="flex-1 truncate">{TAB_LABEL[t]}</span>
                  {t === 'details' && <span className={`text-xs font-bold px-1.5 rounded-full ${active ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'}`}>{chosen.length}</span>}
                  {t === 'learners' && draft.assignedUserIds.length > 0 && <span className={`text-xs font-bold px-1.5 rounded-full ${active ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'}`}>{draft.assignedUserIds.length}</span>}
                </button>
              )
            })}
          </aside>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="lg:hidden flex items-center gap-2 overflow-x-auto border-b border-gray-100 px-4 py-2 shrink-0" style={{ scrollbarWidth: 'none' }}>
              {tabs.map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${tab === t ? 'bg-freshket-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50">
              {tab === 'details' && (
                <div className="max-w-6xl mx-auto p-6 space-y-5">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อ Course Design <span className="text-rose-500">*</span></label>
                      <input type="text" value={draft.title} onChange={(e) => { set('title', e.target.value); setTitleErr('') }}
                        placeholder="เช่น เส้นทางพนักงานขายใหม่"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:border-freshket-500 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300" />
                      {titleErr && <p className="text-xs text-rose-500 mt-1">{titleErr}</p>}
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1.5">คำอธิบาย</label>
                      <input type="text" value={draft.description} onChange={(e) => set('description', e.target.value)}
                        placeholder="อธิบายสั้นๆ ว่าชุดนี้เหมาะกับใคร และเรียนไปเพื่ออะไร"
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:border-freshket-500 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300" />
                    </div>

                    {/* Cover image — the Course Design is shown by this, the same picker the course form uses */}
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-2">ภาพปก</label>
                      <CoverImagePicker
                        value={draft.thumbnailUrl} onChange={(url) => set('thumbnailUrl', url)}
                        title={draft.title} description={draft.description} entityId={initial?.id}
                        catalog={COURSE_IMAGE_CATALOG} uploadEndpoint="/api/upload/course-image" uploadIdField="courseId"
                        aspect={3 / 1}
                      />
                    </div>

                    {/* When it opens and closes */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">วันที่เริ่มหลักสูตร</label>
                        <input type="date" value={draft.startDate} onChange={(e) => { set('startDate', e.target.value); setDateErr('') }}
                          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:border-freshket-500 focus:outline-none focus:border-freshket-500" />
                        <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = เริ่มทันทีที่เผยแพร่</p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">วันสิ้นสุด</label>
                        <input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => { set('endDate', e.target.value); setDateErr('') }}
                          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white hover:border-freshket-500 focus:outline-none focus:border-freshket-500" />
                        <p className="text-xs text-gray-400 mt-1">ไม่ตั้งค่า = ไม่มีกำหนดส่ง</p>
                      </div>
                      {dateErr && <p className="text-xs text-rose-500 sm:col-span-2">{dateErr}</p>}
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none w-fit">
                      <input type="checkbox" checked={draft.sequential} onChange={(e) => set('sequential', e.target.checked)}
                        className="size-4 mt-0.5 rounded border-gray-300 text-freshket-500 focus:ring-2 focus:ring-freshket-300 cursor-pointer" />
                      <span>
                        <span className="text-sm font-bold text-gray-700 block">ให้เรียนตามลำดับ</span>
                        <span className="text-xs text-gray-400">หลักสูตรถัดไปจะเปิดเมื่อเรียนหลักสูตรก่อนหน้าจบแล้ว (ล็อกที่หน้าชุดของผู้เรียน)</span>
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Every other course, to add */}
                    <section className="bg-white rounded-2xl border border-gray-100 p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-3">เพิ่มหลักสูตร</h3>
                      <div className="relative mb-3">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาหลักสูตร..."
                          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300" />
                      </div>
                      {available.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-10">{courses.length === chosen.length ? 'เพิ่มครบทุกหลักสูตรแล้ว' : 'ไม่พบหลักสูตร'}</p>
                      ) : (
                        <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                          {available.map((c) => (
                            <li key={c.id}>
                              <button type="button" onClick={() => set('courseIds', addCourse(chosen, c.id))}
                                className="w-full flex items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left hover:border-freshket-200 hover:bg-freshket-50 transition-all duration-150 group">
                                <Cover course={c} className="size-10" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold text-gray-900 truncate">{c.title}</span>
                                  <span className="block text-xs text-gray-400 truncate">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                                </span>
                                <span className="size-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 group-hover:bg-freshket-500 group-hover:text-white transition-colors" aria-hidden="true">
                                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {/* The package: its courses, in order */}
                    <section className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900">หลักสูตรใน Course Design</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">{chosen.length}</span>
                      </div>
                      {chosen.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีหลักสูตร — เลือกจากรายการทางซ้าย</p>
                      ) : (
                        <ol className="space-y-2">
                          {chosen.map((id, i) => {
                            const c = byId.get(id)
                            return (
                              <li key={id}
                                onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); if (overIndex !== i) setOverIndex(i) } }}
                                onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) set('courseIds', moveCourse(chosen, dragIndex, i)); setDragIndex(null); setOverIndex(null) }}
                                className={`flex items-center gap-3 rounded-xl border bg-white p-2.5 transition-all ${dragIndex === i ? 'opacity-40' : ''} ${dragIndex !== null && overIndex === i && dragIndex !== i ? 'border-freshket-400 ring-2 ring-freshket-200' : 'border-gray-100'}`}>
                                <button type="button" draggable
                                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDragIndex(i) }}
                                  onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                                  aria-label="ลากเพื่อสลับลำดับ" title="ลากเพื่อสลับลำดับ"
                                  className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors">
                                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                                  </svg>
                                </button>
                                <span className="size-6 rounded-full bg-freshket-100 text-freshket-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                                {/* Opens the course's structure in a side panel */}
                                <button type="button" disabled={!c} onClick={() => setViewingId(id)} title={c ? 'ดูโครงสร้างหลักสูตร' : undefined}
                                  className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg hover:bg-gray-50 transition-colors disabled:cursor-default disabled:hover:bg-transparent">
                                  {c ? <Cover course={c} className="size-10" /> : <span className="size-10 rounded-xl bg-gray-100 shrink-0" />}
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold text-gray-900 truncate">{c?.title ?? '(ไม่พบหลักสูตรนี้แล้ว)'}</span>
                                    <span className="block text-xs text-gray-400 truncate">{c ? (CATEGORY_LABELS[c.category] ?? c.category) : 'จะถูกข้ามเมื่อผู้เรียนเปิดดู'}</span>
                                  </span>
                                </button>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button type="button" disabled={i === 0} onClick={() => set('courseIds', moveCourse(chosen, i, i - 1))} aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น"
                                    className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                                  </button>
                                  <button type="button" disabled={i === chosen.length - 1} onClick={() => set('courseIds', moveCourse(chosen, i, i + 1))} aria-label="เลื่อนลง" title="เลื่อนลง"
                                    className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                  </button>
                                  <button type="button" onClick={() => set('courseIds', removeCourse(chosen, id))} aria-label="เอาออก" title="เอาออก"
                                    className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
                                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </section>
                  </div>

                  <p className="text-xs text-gray-400 leading-relaxed">
                    หลักสูตรแต่ละอันเป็นร่างเนื้อหา (บทเรียน แบบทดสอบ Key Take Away) ส่วนผู้เรียน วันที่เริ่ม และการเผยแพร่ กำหนดที่ Course Design นี้ — เผยแพร่ชุดนี้คือการยิงหลักสูตรทั้งหมดในชุดให้ผู้เรียนที่ถูกมอบหมาย
                  </p>
                </div>
              )}

              {tab === 'learners' && (
                <LearnerAssignmentTab
                  value={audience}
                  onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                  allUsers={allUsers}
                  departments={departments}
                  teams={teams}
                  records={records}
                  courseIds={chosen}
                  isSuperAdmin={isSuperAdmin}
                />
              )}

              {tab === 'dashboard' && initial && (
                <>
                  {/* Two views of the same report: the overview charts, and how each learner is doing */}
                  <div role="tablist" aria-label="มุมมองสรุปผลการเรียน" className="flex items-center gap-1 px-6 pt-5">
                    {([['overview', 'ภาพรวม'], ['individual', 'ผลการเรียนรายบุคคล']] as const).map(([key, label]) => (
                      <button key={key} type="button" role="tab" aria-selected={reportView === key} onClick={() => setReportView(key)}
                        className={`px-4 py-2 rounded-full text-sm border transition-colors duration-150 ${reportView === key ? 'bg-freshket-100 text-freshket-700 border-freshket-200 font-bold' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {reportView === 'overview'
                    ? <PackageDashboardTab pkg={{ courseIds: chosen, ...audience, targetRoles: draft.targetRoles }} courses={courses} users={allUsers} records={records} />
                    : <PackageSummaryTab pkg={{ courseIds: chosen, ...audience, targetRoles: draft.targetRoles }} courses={courses} users={allUsers} records={records} />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
