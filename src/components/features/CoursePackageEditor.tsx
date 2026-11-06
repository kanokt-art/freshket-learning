'use client'

import { useMemo, useState } from 'react'
import { moveCourse, addCourse, removeCourse } from '@/lib/courses/packages'
import { CATEGORY_LABELS, type Course } from '@/types/course'
import type { CoursePackage } from '@/types/coursePackage'

// The editor for one Course Design: a name, a description, which courses it holds and in what order, whether
// learners must go in that order, and whether it is published. Full screen, like the quiz editor. The order is
// set by dragging a course by its handle or with the arrows; a course is added from the list on the right.

export interface PackageDraft {
  title: string
  description: string
  courseIds: string[]
  sequential: boolean
  isPublished: boolean
}

export function draftOf(pkg: CoursePackage | null): PackageDraft {
  return {
    title: pkg?.title ?? '',
    description: pkg?.description ?? '',
    courseIds: pkg?.courseIds ?? [],
    sequential: pkg?.sequential ?? false,
    isPublished: pkg?.isPublished ?? false,
  }
}

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

export function CoursePackageEditor({ initial, courses, saving, onSave, onClose }: {
  initial: CoursePackage | null
  /** Every course a package may hold. */
  courses: Course[]
  saving?: boolean
  onSave: (draft: PackageDraft) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PackageDraft>(() => draftOf(initial))
  const [search, setSearch] = useState('')
  const [titleErr, setTitleErr] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const set = <K extends keyof PackageDraft>(k: K, v: PackageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const chosen = draft.courseIds
  const available = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courses.filter((c) => !chosen.includes(c.id) &&
      (!q || c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)))
  }, [courses, chosen, search])

  function handleSave() {
    if (!draft.title.trim()) { setTitleErr('กรุณากรอกชื่อ Course Design'); return }
    onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      <div className="animate-pop-in flex flex-col flex-1 min-h-0">

        <div className="flex items-center justify-between gap-3 px-6 py-3 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="font-bold text-gray-900 truncate">{initial ? 'แก้ไข Course Design' : 'สร้าง Course Design'}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">{draft.isPublished ? 'Published' : 'Draft'}</span>
              <button type="button" role="switch" aria-checked={draft.isPublished} aria-label="เผยแพร่" onClick={() => set('isPublished', !draft.isPublished)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${draft.isPublished ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${draft.isPublished ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-normal text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-all">ยกเลิก</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-freshket-500 text-white rounded-xl hover:bg-freshket-600 transition-all disabled:opacity-60">
              {saving
                ? <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
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
              <label className="flex items-start gap-2.5 cursor-pointer select-none w-fit">
                <input type="checkbox" checked={draft.sequential} onChange={(e) => set('sequential', e.target.checked)}
                  className="size-4 mt-0.5 rounded border-gray-300 text-freshket-500 focus:ring-2 focus:ring-freshket-300 cursor-pointer" />
                <span>
                  <span className="text-sm font-bold text-gray-700 block">ให้เรียนตามลำดับ</span>
                  <span className="text-xs text-gray-400">หลักสูตรถัดไปจะเปิดเมื่อเรียนหลักสูตรก่อนหน้าจบแล้ว (ล็อกที่หน้าแพ็กเกจ)</span>
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* The package: its courses, in order */}
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-900">หลักสูตรใน Course Design</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">{chosen.length}</span>
                </div>
                {chosen.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">ยังไม่มีหลักสูตร — เลือกจากรายการทางขวา</p>
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
                          {c ? <Cover course={c} className="size-10" /> : <span className="size-10 rounded-xl bg-gray-100 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900 truncate">{c?.title ?? '(ไม่พบหลักสูตรนี้แล้ว)'}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {c ? `${CATEGORY_LABELS[c.category] ?? c.category}${c.isPublished === false ? ' · ยังไม่เผยแพร่ (ผู้เรียนจะไม่เห็น)' : ''}` : 'จะถูกข้ามเมื่อผู้เรียนเปิดดู'}
                            </p>
                          </div>
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
                            <span className="block text-xs text-gray-400 truncate">{CATEGORY_LABELS[c.category] ?? c.category}{c.isPublished === false ? ' · ยังไม่เผยแพร่' : ''}</span>
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
            </div>

            <p className="text-xs text-gray-400">
              ผู้เรียนเห็น Course Design นี้เมื่อมีอย่างน้อยหนึ่งหลักสูตรที่เป็นของเขา หลักสูตรแต่ละอันยังกำหนดผู้เรียนที่หน้าหลักสูตรเอง การเข้าชุดไม่เปลี่ยนว่าใครต้องเรียนอะไร
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
