'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, Link2, ListChecks, NotebookPen, PlaySquare, Presentation, Smile, X } from 'lucide-react'
import { courseQuizzes } from '@/lib/courses/courseQuizzes'
import { CATEGORY_LABELS, LESSON_TYPE_LABELS, type Course, type LessonType } from '@/types/course'

// A side panel that shows what is inside a course: its topics and lessons, and whether it opens and closes
// with a test, without leaving the Course Design being edited. Read-only.

const LESSON_ICON: Record<LessonType, typeof PlaySquare> = {
  video: PlaySquare, article: FileText, file: Presentation, link: Link2, quiz: ListChecks, assignment: NotebookPen, personality: Smile,
}

export function CourseStructureDrawer({ course, onClose }: { course: Course; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Test lessons are the strips above and below; only the teaching lessons are numbered.
  const topics = (course.topics ?? []).map((t) => ({ ...t, lessons: (t.lessons ?? []).filter((l) => l.type !== 'quiz') }))
  const lessonCount = topics.reduce((n, t) => n + t.lessons.length, 0)
  const { pre, post } = courseQuizzes(course)
  let n = 0

  const strip = (label: string) => (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-freshket-200 bg-freshket-50 text-freshket-700">
      <ListChecks className="size-4 shrink-0" strokeWidth={1.8} />
      <span className="text-xs font-bold">{label}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`โครงสร้างหลักสูตร ${course.title}`} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400">โครงสร้างหลักสูตร</p>
            <h3 className="text-base font-bold text-gray-900 mt-0.5">{course.title}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {CATEGORY_LABELS[course.category] ?? course.category} · {topics.length} หัวข้อ · {lessonCount} บทเรียน
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="size-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-150 shrink-0">
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {course.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.thumbnailUrl} alt="" className="w-full aspect-[3/1] rounded-xl object-cover border border-gray-100" />
          )}
          {course.description && <p className="text-sm text-gray-600 whitespace-pre-wrap">{course.description}</p>}

          {pre && strip('Pre-Test (ก่อนเรียน)')}

          {topics.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">หลักสูตรนี้ยังไม่มีบทเรียน</p>
          ) : topics.map((t, ti) => (
            <section key={t.id} className="rounded-xl border border-gray-100 bg-white">
              <h4 className="px-3 py-2.5 text-sm font-bold text-gray-800 border-b border-gray-100">{t.title || `หัวข้อ #${ti + 1}`}</h4>
              {t.lessons.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">ยังไม่มีบทเรียนในหัวข้อนี้</p>
              ) : (
                <ol className="divide-y divide-gray-50">
                  {t.lessons.map((l) => {
                    n += 1
                    const Icon = LESSON_ICON[l.type] ?? FileText
                    return (
                      <li key={l.id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <span className="size-5 rounded-full bg-freshket-100 text-freshket-700 text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
                        <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">{l.title || `บทเรียน #${n}`}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 shrink-0">
                          <Icon className="size-3.5" strokeWidth={1.8} />
                          {LESSON_TYPE_LABELS[l.type]}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          ))}

          {post && strip('Post-Test (หลังเรียน)')}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <Link href={`/courses/${course.id}`}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-freshket-200 bg-freshket-100 text-freshket-700 text-sm font-bold hover:bg-freshket-200 transition-all duration-150">
            <ExternalLink className="size-4" strokeWidth={2} />
            เปิดหน้าหลักสูตร
          </Link>
        </div>
      </aside>
    </div>
  )
}
