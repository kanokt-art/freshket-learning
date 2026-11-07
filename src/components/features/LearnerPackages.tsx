'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useCoursePackages, useMyTrainingRecords } from '@/hooks/useFirestore'
import { packageProgress, packageVisibleTo, type PackageCourseStatus } from '@/lib/courses/packages'
import type { Course } from '@/types/course'

// The Course Designs on a learner's My Course: the published packages that hold at least one course meant for them,
// each with how far they are and the course to take next. Nothing is shown when there are none.

/** The launched Course Designs this learner may see, each with how far they are in it. */
export function useVisiblePackages() {
  const { user } = useAuth()
  const { data: courses } = useCourses()
  const { data: packages } = useCoursePackages()
  const { data: records } = useMyTrainingRecords(user?.uid ?? '')

  const me = useMemo(
    () => ({ uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId }),
    [user?.uid, user?.role, user?.department, user?.teamId],
  )
  const statusOf = useMemo(() => {
    const m = new Map(records.map((r) => [r.courseId, r.status as PackageCourseStatus]))
    return (id: string): PackageCourseStatus => m.get(id) ?? 'not_started'
  }, [records])

  return useMemo(
    () => packages
      .filter((p) => packageVisibleTo(p, courses as Course[], me))
      .map((p) => ({ pkg: p, progress: packageProgress(p, courses as Course[], statusOf, me) })),
    [packages, courses, me, statusOf],
  )
}

export type VisiblePackage = ReturnType<typeof useVisiblePackages>[number]

/** One Course Design as a card: its own cover, how many courses are finished, and what to take next. */
export function PackageCard({ pkg, progress, onOpen }: { pkg: VisiblePackage['pkg']; progress: VisiblePackage['progress']; onOpen: () => void }) {
  const finished = progress.total > 0 && progress.done === progress.total
  return (
    <button type="button" onClick={onOpen}
      style={{ border: 'var(--card-border)' }}
      className="text-left bg-white rounded-2xl overflow-hidden flex flex-col hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 group">
      {/* The Course Design's own cover leads the card */}
      {pkg.thumbnailUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={pkg.thumbnailUrl} alt="" className="w-full aspect-[3/1] object-cover" />
        : <div className="w-full aspect-[3/1] bg-freshket-100" aria-hidden="true" />}
      <div className="p-5 flex flex-col gap-3 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 leading-snug group-hover:text-freshket-600 transition-colors">{pkg.title}</h3>
          {pkg.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{pkg.description}</p>}
        </div>
        {finished && (
          <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">เรียนจบแล้ว</span>
        )}
      </div>

      {/* The path: one dot per course, filled as each is finished */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {progress.items.filter((i) => i.applicable).map((i) => (
          <span key={i.course.id} className={`h-1.5 flex-1 rounded-full ${i.status === 'completed' ? 'bg-freshket-500' : i.status === 'in_progress' ? 'bg-freshket-200' : 'bg-gray-100'}`} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        จบแล้ว <span className="font-bold text-gray-900">{progress.done}/{progress.total}</span> หลักสูตร
        {pkg.sequential && <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">เรียนตามลำดับ</span>}
      </p>

      <div className="flex items-center justify-between gap-3 mt-auto pt-1 border-t border-gray-50">
        <p className="text-xs text-gray-500 truncate min-w-0">
          {progress.next ? <>ต่อไป: <span className="font-bold text-gray-800">{progress.next.course.title}</span></> : 'ครบทุกหลักสูตรแล้ว'}
        </p>
        <span className="shrink-0 text-xs font-bold text-freshket-600">{finished ? 'ดูอีกครั้ง' : progress.done > 0 ? 'เรียนต่อ' : 'เริ่มเรียน'} →</span>
      </div>
      </div>
    </button>
  )
}

export function LearnerPackages() {
  const router = useRouter()
  const { user } = useAuth()
  const cards = useVisiblePackages()

  if (!user || cards.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-sm font-bold text-gray-900">Course Design</h2>
        <span className="text-xs text-gray-400">เรียนเป็นชุด เรียงตามลำดับที่แนะนำ</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ pkg, progress }) => (
          <PackageCard key={pkg.id} pkg={pkg} progress={progress} onOpen={() => router.push(`/courses/design/${pkg.id}`)} />
        ))}
      </div>
    </section>
  )
}
