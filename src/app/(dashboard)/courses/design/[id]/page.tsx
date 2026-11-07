'use client'

import { useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useCourses, useCoursePackages, useMyTrainingRecords } from '@/hooks/useFirestore'
import { packageProgress, packageVisibleTo, type PackageCourseStatus } from '@/lib/courses/packages'
import { CATEGORY_LABELS, type Course } from '@/types/course'

// One Course Design as a learner takes it: its courses in order, how far they are, and a button on the one to do
// next. In a sequential package the later courses stay locked until the earlier ones are finished (here, on this
// page; each course is still its own course). A super_admin can open any package, draft or not, to see it.

const STATUS_LABEL: Record<PackageCourseStatus, string> = {
  not_started: 'ยังไม่เริ่ม', in_progress: 'กำลังเรียน', completed: 'เรียนจบแล้ว', failed: 'ยังไม่ผ่าน',
}

export default function CoursePackagePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'super_admin'
  const { data: courses, loading: coursesLoading } = useCourses()
  const { data: packages, loading: packagesLoading } = useCoursePackages()
  const { data: records } = useMyTrainingRecords(user?.uid ?? '')

  const pkg = packages.find((p) => p.id === id) ?? null
  const me = useMemo(
    () => ({ uid: user?.uid ?? '', role: user?.role ?? 'sale', department: user?.department, teamId: user?.teamId }),
    [user?.uid, user?.role, user?.department, user?.teamId],
  )
  const statusOf = useMemo(() => {
    const m = new Map(records.map((r) => [r.courseId, r.status as PackageCourseStatus]))
    return (cid: string): PackageCourseStatus => m.get(cid) ?? 'not_started'
  }, [records])

  const progress = useMemo(
    () => (pkg ? packageProgress(pkg, courses as Course[], statusOf, me, { allApplicable: isAdmin }) : null),
    [pkg, courses, statusOf, me, isAdmin],
  )

  const back = isAdmin ? '/courses/design' : '/courses'
  const loading = coursesLoading || packagesLoading
  const allowed = !!pkg && (isAdmin || packageVisibleTo(pkg, courses as Course[], me))

  if (!user) return null

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title={pkg?.title ?? 'Course Design'} subtitle={pkg ? `${progress?.items.length ?? 0} หลักสูตร` : undefined} />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <button type="button" onClick={() => router.push(back)} className="text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors">
            ← {isAdmin ? 'กลับไปจัดการ Course Design' : 'กลับไปหลักสูตรของฉัน'}
          </button>

          {loading ? (
            <div className="flex items-center justify-center py-20"><span className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : !allowed || !pkg || !progress ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
              <p className="text-sm font-bold text-gray-700">ไม่พบ Course Design นี้</p>
              <p className="text-xs text-gray-400 mt-1">อาจยังไม่เผยแพร่ หรือไม่มีหลักสูตรที่ตรงกับคุณ</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {pkg.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pkg.thumbnailUrl} alt="" className="w-full aspect-[3/1] object-cover" />
                )}
                <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 leading-snug">{pkg.title}</h2>
                    {pkg.description && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{pkg.description}</p>}
                  </div>
                  {!pkg.isPublished && <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">ร่าง (เห็นเฉพาะ Admin)</span>}
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress.pct}%`, background: '#00ce7c' }} />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">จบแล้ว {progress.done}/{progress.total} · {progress.pct}%</span>
                </div>
                {pkg.sequential && (
                  <p className="text-xs text-gray-400 mt-3">เรียนตามลำดับ: หลักสูตรถัดไปจะเปิดเมื่อจบหลักสูตรก่อนหน้า</p>
                )}
                </div>
              </div>

              {progress.items.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-sm text-gray-400">ยังไม่มีหลักสูตรในชุดนี้</div>
              ) : (
                <ol className="space-y-3">
                  {progress.items.map((it, i) => {
                    const c = it.course
                    const isNext = progress.next?.course.id === c.id
                    const img = c.thumbnailUrl && (c.thumbnailUrl.startsWith('http') || c.thumbnailUrl.startsWith('/')) ? c.thumbnailUrl : null
                    const disabled = !it.applicable || it.locked
                    return (
                      <li key={c.id}
                        className={`bg-white rounded-2xl border p-4 flex items-center gap-4 transition-all ${isNext ? 'border-freshket-300 shadow-sm' : 'border-gray-100'} ${disabled ? 'opacity-70' : ''}`}>
                        <span className={`size-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${it.status === 'completed' ? 'bg-freshket-500 text-white' : 'bg-freshket-100 text-freshket-700'}`}>
                          {it.status === 'completed'
                            ? <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            : i + 1}
                        </span>
                        {img
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={img} alt="" className="size-14 rounded-xl object-cover shrink-0 hidden sm:block" />
                          : <span className="size-14 rounded-xl bg-freshket-100 shrink-0 hidden sm:block" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-900 leading-snug">{c.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{CATEGORY_LABELS[c.category] ?? c.category}{c.durationMinutes ? ` · ${c.durationMinutes} นาที` : ''}</p>
                          <p className="text-xs mt-1.5">
                            {!it.applicable ? (
                              <span className="text-gray-400">ไม่ได้อยู่ในกลุ่มผู้เรียนของหลักสูตรนี้</span>
                            ) : it.locked ? (
                              <span className="inline-flex items-center gap-1 text-gray-500">
                                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                จบหลักสูตรก่อนหน้าก่อน จึงเปิดหลักสูตรนี้
                              </span>
                            ) : (
                              <span className={`font-bold ${it.status === 'completed' ? 'text-freshket-700' : it.status === 'in_progress' ? 'text-blue-600' : it.status === 'failed' ? 'text-rose-600' : 'text-gray-500'}`}>{STATUS_LABEL[it.status]}</span>
                            )}
                          </p>
                        </div>
                        <button type="button" disabled={disabled} onClick={() => router.push(isAdmin ? `/courses/${c.id}?view=learn` : `/courses/${c.id}`)}
                          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : isNext ? 'bg-freshket-500 text-white hover:bg-freshket-600' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                          {it.status === 'completed' ? 'ทบทวน' : it.status === 'in_progress' ? 'เรียนต่อ' : 'เริ่มเรียน'}
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
