'use client'

import { useMemo, useState } from 'react'
import { CourseDashboard } from '@/components/features/CourseDashboard'
import { courseAudience, type AudienceCourse } from '@/lib/courses/audience'
import { packageStanding } from '@/lib/courses/packageRecords'
import { courseQuizzes } from '@/lib/courses/courseQuizzes'
import { isCurrentOrIncoming } from '@/lib/users/active'
import { formatPersonName } from '@/lib/users/displayName'
import type { DashRow } from '@/lib/courses/dashboardData'
import type { Course } from '@/types/course'
import type { TrainingRecord } from '@/types/tracking'
import type { UserProfile } from '@/types/user'

// The two report tabs of a Course Design — แดชบอร์ด and สรุปผลการเรียน. They read the package the way the course
// builder used to read one course: the audience is the learners, their records across the package's courses make
// their standing. Read-only.

interface Props {
  /** The package as it is being edited (audience and courses). */
  pkg: AudienceCourse & { courseIds: string[] }
  courses: Course[]
  users: UserProfile[]
  records: TrainingRecord[]
}

/** The package's learners, and how many of them have left the company (hidden unless asked for). */
function useLearners(pkg: Props['pkg'], users: UserProfile[]) {
  const [hideResigned, setHideResigned] = useState(true)
  const everyone = useMemo(() => courseAudience(pkg, users), [pkg, users])
  const visible = useMemo(() => (hideResigned ? everyone.filter(isCurrentOrIncoming) : everyone), [everyone, hideResigned])
  const resignedCount = everyone.length - everyone.filter(isCurrentOrIncoming).length
  return { visible, resignedCount, hideResigned, setHideResigned }
}

function ResignedToggle({ count, value, onChange }: { count: number; value: boolean; onChange: (v: boolean) => void }) {
  if (count === 0) return null
  return (
    <label className="inline-flex items-center gap-2 text-xs font-normal text-gray-500 cursor-pointer select-none">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 rounded border-gray-300 text-freshket-500 focus:ring-2 focus:ring-freshket-300 cursor-pointer" />
      ซ่อนพนักงานที่ลาออก ({count} คน)
    </label>
  )
}

export function PackageDashboardTab({ pkg, courses, users, records }: Props) {
  const inPackage = useMemo(() => pkg.courseIds.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c), [pkg.courseIds, courses])
  const [view, setView] = useState<string>('all')
  const { visible, resignedCount, hideResigned, setHideResigned } = useLearners(pkg, users)

  const selected = view === 'all' ? inPackage.map((c) => c.id) : [view]
  const rows: DashRow[] = useMemo(() => {
    const ids = new Set(selected)
    return visible.map((u) => {
      const recs = records.filter((r) => r.userId === u.uid && ids.has(r.courseId))
      if (recs.length === 0) return { department: u.department }
      const s = packageStanding(recs, ids.size)
      return {
        department: u.department,
        record: { status: s.status, startedAt: s.startedAt, completedAt: s.completedAt, preTestScore: s.preTestScore, postTestScore: s.postTestScore },
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, records, view, inPackage])

  if (inPackage.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-20">เพิ่มหลักสูตรเข้าชุดก่อน จึงจะเห็นแดชบอร์ด</p>
  }

  return (
    <div>
      <div className="w-full max-w-6xl mx-auto px-6 pt-8 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
          ดูผลของ
          <select value={view} onChange={(e) => setView(e.target.value)}
            className="px-3 py-2 text-sm font-normal rounded-xl border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-freshket-300">
            <option value="all">ทุกหลักสูตรในชุด (ภาพรวม)</option>
            {inPackage.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <span className="flex-1" />
        <ResignedToggle count={resignedCount} value={hideResigned} onChange={setHideResigned} />
      </div>
      {/* Remounted per view so the quiz figures follow the chosen course */}
      <CourseDashboard key={view} courseIds={selected} rows={rows} />
    </div>
  )
}

type SortKey = 'name' | 'department' | 'progress'

export function PackageSummaryTab({ pkg, courses, users, records }: Props) {
  const inPackage = useMemo(() => pkg.courseIds.map((id) => courses.find((c) => c.id === id)).filter((c): c is Course => !!c), [pkg.courseIds, courses])
  const { visible, resignedCount, hideResigned, setHideResigned } = useLearners(pkg, users)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'progress', dir: 'desc' })

  const recordOf = useMemo(() => {
    const m = new Map<string, TrainingRecord>()
    records.forEach((r) => m.set(`${r.userId}:${r.courseId}`, r))
    return m
  }, [records])

  const table = useMemo(() => {
    const ids = inPackage.map((c) => c.id)
    return visible.map((u) => {
      const recs = ids.map((id) => recordOf.get(`${u.uid}:${id}`)).filter((r): r is TrainingRecord => !!r)
      return { user: u, standing: packageStanding(recs, ids.length) }
    })
  }, [visible, inPackage, recordOf])

  const stats = useMemo(() => ({
    total: table.length,
    finished: table.filter((r) => r.standing.status === 'completed').length,
    inProgress: table.filter((r) => r.standing.status === 'in_progress').length,
    avgProgress: table.length && inPackage.length
      ? Math.round((table.reduce((n, r) => n + r.standing.done / inPackage.length, 0) / table.length) * 100)
      : 0,
  }), [table, inPackage.length])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? table.filter(({ user: u }) => [u.displayName, u.displayNameEN, u.nickname].some((x) => (x ?? '').toLowerCase().includes(q)))
      : table
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = sort.key === 'name' ? formatPersonName(a.user).toLowerCase()
        : sort.key === 'department' ? (a.user.department ?? '').toLowerCase()
        : a.standing.done
      const bv = sort.key === 'name' ? formatPersonName(b.user).toLowerCase()
        : sort.key === 'department' ? (b.user.department ?? '').toLowerCase()
        : b.standing.done
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [table, search, sort])

  // Which of the package's courses carry a before / after test. A course with a pre-test is also sat again after it,
  // so it counts for both. A column only exists when at least one course has that test.
  const preCourses = useMemo(() => inPackage.filter((c) => courseQuizzes(c).pre), [inPackage])
  const postCourses = useMemo(() => inPackage.filter((c) => courseQuizzes(c).post), [inPackage])
  // ✓ once the learner has a score for that test in every course that has it, ✗ otherwise.
  const taken = (uid: string, courseList: Course[], field: 'preTestScore' | 'postTestScore') =>
    courseList.every((c) => typeof recordOf.get(`${uid}:${c.id}`)?.[field] === 'number')
  const mark = (ok: boolean) => ok
    ? <span className="text-freshket-700 font-bold" aria-label="ทำแล้ว">✓</span>
    : <span className="text-rose-500 font-bold" aria-label="ยังไม่ได้ทำ">✗</span>
  const extraCols = (preCourses.length > 0 ? 1 : 0) + (postCourses.length > 0 ? 1 : 0)

  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'progress' ? 'desc' : 'asc' }))
  const Th = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-3 text-xs font-bold text-gray-500 text-left whitespace-nowrap ${className}`}>
      <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 hover:text-gray-700 ${sort.key === k ? 'text-gray-900' : ''}`}>
        {children}
        <svg className={`size-3 ${sort.key === k ? 'opacity-100' : 'opacity-30'} ${sort.key === k && sort.dir === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
      </button>
    </th>
  )

  if (inPackage.length === 0) return <p className="text-sm text-gray-400 text-center py-20">เพิ่มหลักสูตรเข้าชุดก่อน จึงจะเห็นสรุปผลการเรียน</p>

  const cell = (r: TrainingRecord | undefined) => {
    if (!r || r.status === 'not_started') return <span className="text-gray-300">—</span>
    if (r.status === 'completed') return <span className="inline-flex items-center gap-1 text-freshket-700 font-bold">✓{typeof r.score === 'number' ? ` ${r.score}` : ''}</span>
    if (r.status === 'failed') return <span className="text-rose-600 font-bold">ไม่ผ่าน</span>
    return <span className="text-blue-600 font-bold">กำลังเรียน</span>
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <p className="text-sm font-bold text-gray-800">ภาพรวมผู้เรียน</p>
          <ResignedToggle count={resignedCount} value={hideResigned} onChange={setHideResigned} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { v: stats.total, l: 'ผู้เรียนทั้งหมด', cls: 'bg-slate-50 border-gray-100 text-gray-900', lc: 'text-gray-400' },
            { v: stats.finished, l: 'เรียนจบทั้งชุด', cls: 'bg-freshket-50 border-freshket-100 text-freshket-700', lc: 'text-freshket-600' },
            { v: stats.inProgress, l: 'กำลังเรียน', cls: 'bg-blue-50 border-blue-100 text-blue-700', lc: 'text-blue-600' },
            { v: `${stats.avgProgress}%`, l: 'ความคืบหน้าเฉลี่ย', cls: 'bg-gray-50 border-gray-100 text-gray-600', lc: 'text-gray-400' },
          ].map((t) => (
            <div key={t.l} className={`rounded-xl border p-3.5 text-center ${t.cls}`}>
              <p className="text-xl font-black">{t.v}</p>
              <p className={`text-xs mt-0.5 ${t.lc}`}>{t.l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาจากชื่อจริง นามสกุล หรือชื่อเล่น..."
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300" />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th k="name">Name</Th>
                <Th k="department">Department</Th>
                <Th k="progress">Progress</Th>
                {inPackage.map((c, i) => (
                  <th key={c.id} className="px-4 py-3 text-xs font-bold text-gray-500 text-left max-w-[10rem]" title={c.title}>
                    <span className="block truncate">{i + 1}. {c.title}</span>
                  </th>
                ))}
                {preCourses.length > 0 && <th className="px-4 py-3 text-xs font-bold text-gray-500 text-center whitespace-nowrap">Pre-assessment</th>}
                {postCourses.length > 0 && <th className="px-4 py-3 text-xs font-bold text-gray-500 text-center whitespace-nowrap">Post-assessment</th>}
                <th className="px-4 py-3 text-xs font-bold text-gray-500 text-left whitespace-nowrap">Pre / Post</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.length === 0 ? (
                <tr><td colSpan={4 + extraCols + inPackage.length} className="px-4 py-12 text-center text-sm text-gray-400">ยังไม่มีผู้เรียน — ไปที่แท็บ กำหนดผู้เรียน</td></tr>
              ) : shown.map(({ user: u, standing }) => {
                const pct = Math.round((standing.done / inPackage.length) * 100)
                return (
                  <tr key={u.uid} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatPersonName(u)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{u.department ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[8rem]">
                        <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: '#00ce7c' }} /></span>
                        <span className="text-xs text-gray-500 tabular-nums w-14 text-right">{standing.done}/{inPackage.length}</span>
                      </div>
                    </td>
                    {inPackage.map((c) => <td key={c.id} className="px-4 py-3 text-xs whitespace-nowrap">{cell(recordOf.get(`${u.uid}:${c.id}`))}</td>)}
                    {preCourses.length > 0 && <td className="px-4 py-3 text-sm text-center">{mark(taken(u.uid, preCourses, 'preTestScore'))}</td>}
                    {postCourses.length > 0 && <td className="px-4 py-3 text-sm text-center">{mark(taken(u.uid, postCourses, 'postTestScore'))}</td>}
                    <td className="px-4 py-3 text-xs text-gray-600 tabular-nums whitespace-nowrap">
                      {standing.preTestScore ?? '—'} → {standing.postTestScore ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
