'use client'

// The member directory used on the admin home and on a team lead's / manager's home: a roster table (newest
// start date first, every column sortable) and the profile window that opens from a row.

import { CopyableText, StartDateCell } from '@/components/common/EmployeeCells'
import { useState, useMemo, useEffect } from 'react'
import { authedFetch } from '@/lib/api/authedFetch'
import { useAuth } from '@/hooks/useAuth'
import { PHASE1_DEPARTMENTS } from '@/lib/modules'
import { useCourses, useUserTrainingRecords, useShadowRecordsByUser, useRoleplayAssessmentsByUser } from '@/hooks/useFirestore'
import { useMentorName } from '@/hooks/useMentorName'
import { courseQuestionnaireId } from '@/lib/courses/questionnaire'
import { UserQuestionnaireResult } from '@/components/features/QuestionnaireResultCell'
import { MemberCourseDrawer } from '@/components/features/MemberCourseDrawer'
import { CourseCover } from '@/components/features/CourseCover'
import { ShadowVisitDrawer } from '@/components/features/ShadowVisitDrawer'
import { formatPersonName } from '@/lib/users/displayName'
import { ShadowPushButton } from '@/components/features/ShadowPushButton'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useNotifications } from '@/hooks/useNotifications'
import { sidebarNotices } from '@/lib/notifications/sidebarNotices'
import { STATUS_LABELS, type TrainingStatus } from '@/types/tracking'
import { ROLE_LABELS, type UserProfile } from '@/types/user'
import { RADAR_GROUPS, type RoleplayAssessment } from '@/types/roleplay'
import type { ShadowRecord } from '@/types/shadow'

const STATUS_BADGE: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress:  'bg-blue-100 text-blue-700',
  completed:    'bg-freshket-100 text-freshket-700',
  failed:       'bg-rose-100 text-rose-600',
}

// ── Tenure helper ─────────────────────────────────────────────────────────────
function calcTenure(startDate: Date | undefined | null): string {
  if (!startDate) return '—'
  const start = startDate instanceof Date ? startDate : new Date(startDate as unknown as string)
  if (isNaN(start.getTime())) return '—'
  const now = new Date()
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days = now.getDate() - start.getDate()
  if (days < 0) {
    months--
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
  }
  if (months < 0) { years--; months += 12 }
  return `${years}.${String(months).padStart(2, '0')}.${String(days).padStart(2, '0')}`
}

function SortHeaderCell({ label, active, dir, onClick, className }: {
  label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void; className?: string
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1 text-left transition-colors ${active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'} ${className ?? ''}`}>
      {label}
      <svg className={`size-3 shrink-0 transition-transform ${active && dir === 'desc' ? 'rotate-180' : ''} ${active ? 'text-indigo-500' : 'text-gray-300'}`}
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    </button>
  )
}

// ── User Table ────────────────────────────────────────────────────────────────
export function UserTable({
  users,
  onSelect,
  selectedUid,
  restrict = true,
}: {
  users: UserProfile[]
  onSelect: (u: UserProfile) => void
  selectedUid?: string
  /**
   * Keep only real, numbered employees of the departments in the rollout (the admin's whole-company view). A
   * lead's own team is already scoped, so it passes false.
   */
  restrict?: boolean
}) {
  const [search, setSearch] = useState('')
  // Opens on the shortest tenure: the newest start date first.
  const [sortBy, setSortBy] = useState<'empId' | 'name' | 'department' | 'position' | 'startDate' | 'tenure' | null>('startDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    // Same "only the literal 'Active' counts as inactive" rule used across the
    // app (Employees list, course individual-assignment picker) — a resigned
    // employee shouldn't show up in a roster meant for current staff.
    // Also drop non-numeric employee IDs (e.g. "FTE" placeholder codes) — this
    // roster is meant to list real, numbered employees only.
    // And only departments in the current rollout (PHASE1_DEPARTMENTS, the list the
    // Employees page, org board and learner picker use): others are left out until onboarded.
    let list = users.filter((u) =>
      (!u.employmentStatus || u.employmentStatus === 'Active') &&
      (!restrict || (
        !!u.employeeId && /^\d+$/.test(u.employeeId) &&
        !!u.department && PHASE1_DEPARTMENTS.has(u.department)
      )),
    )

    const q = search.toLowerCase().trim()
    if (q) {
      list = list.filter((u) =>
        u.displayName?.toLowerCase().includes(q) ||
        (u.displayNameEN ?? '').toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q),
      )
    }

    if (sortBy) {
      const dir = sortDir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        if (sortBy === 'startDate' || sortBy === 'tenure') {
          const at = a.startDate ? new Date(a.startDate as unknown as string).getTime() : 0
          const bt = b.startDate ? new Date(b.startDate as unknown as string).getTime() : 0
          // Tenure is the inverse of start date (earlier start = longer tenure),
          // so "sort by tenure ascending" means most-recent-hire first.
          return sortBy === 'tenure' ? (bt - at) * dir : (at - bt) * dir
        }
        if (sortBy === 'empId') {
          return (a.employeeId ?? '').localeCompare(b.employeeId ?? '', undefined, { numeric: true }) * dir
        }
        const av = (sortBy === 'name' ? (a.displayNameEN || a.displayName) : a[sortBy]) ?? ''
        const bv = (sortBy === 'name' ? (b.displayNameEN || b.displayName) : b[sortBy]) ?? ''
        return av.localeCompare(bv) * dir
      })
    }

    return list
  }, [users, search, sortBy, sortDir, restrict])

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-gray-900">
          รายชื่อพนักงาน
          <span className="ml-2 text-xs font-normal text-gray-400">{filtered.length} คน</span>
        </h2>
        {/* Search */}
        <div className="relative w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสพนักงาน..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <div className="min-w-[1100px]">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-white border-b border-gray-100 text-xs font-bold text-gray-500">
            <div className="col-span-1">#</div>
            <SortHeaderCell className="col-span-1" label="Emp.ID" active={sortBy === 'empId'} dir={sortDir} onClick={() => toggleSort('empId')} />
            <SortHeaderCell className="col-span-2" label="Name" active={sortBy === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
            <SortHeaderCell className="col-span-2" label="Position" active={sortBy === 'position'} dir={sortDir} onClick={() => toggleSort('position')} />
            <SortHeaderCell className="col-span-2" label="Department" active={sortBy === 'department'} dir={sortDir} onClick={() => toggleSort('department')} />
            <SortHeaderCell className="col-span-2" label="Start Date" active={sortBy === 'startDate'} dir={sortDir} onClick={() => toggleSort('startDate')} />
            <div className="col-span-2">Email</div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <p className="text-sm">ไม่พบพนักงาน</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[500px] lg:max-h-[calc(100vh-380px)] min-h-[320px] overflow-y-auto">
              {filtered.map((u, i) => {
                const isSelected = u.uid === selectedUid
                return (
                  <button
                    key={u.uid}
                    onClick={() => onSelect(u)}
                    className={`w-full grid grid-cols-12 gap-2 px-4 py-3 text-left items-start transition-colors hover:bg-indigo-50/60 ${isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                  >
                    {/* # */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-400 tabular-nums">{i + 1}</span>
                    </div>
                    {/* Employee ID */}
                    <div className="col-span-1 flex items-center">
                      <span className="text-xs text-gray-500 font-mono truncate">{u.employeeId ?? '—'}</span>
                    </div>
                    {/* Name */}
                    <div className="col-span-2 flex items-center min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {u.displayNameEN || u.displayName || u.email}
                        {u.nickname && <span className="text-gray-400 font-normal"> ({u.nickname})</span>}
                      </p>
                    </div>
                    {/* Position — full text, with copy */}
                    <div className="col-span-2 flex items-start min-w-0 text-xs text-gray-600">
                      <CopyableText text={u.position} />
                    </div>
                    {/* Department */}
                    <div className="col-span-2 flex items-start min-w-0 text-xs text-gray-600">
                      <CopyableText text={u.department} />
                    </div>
                    {/* Start Date, with the length of service under it */}
                    <div className="col-span-2 flex items-start text-xs text-gray-500">
                      <StartDateCell startDate={u.startDate} />
                    </div>
                    {/* Email */}
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-gray-400 truncate">{u.email ?? '—'}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── User Profile Overlay Card ─────────────────────────────────────────────────
type ProfileTab = 'info' | 'training' | 'shadow' | 'roleplay'

export function UserSidePanel({
  user,
  onClose,
}: {
  user: UserProfile
  onClose: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('info')
  const [selectedShadow, setSelectedShadow] = useState<ShadowRecord | null>(null)
  // The course opened from the training list, read on the right: Key Take Away and the leads' feedback.
  const [openCourse, setOpenCourse] = useState<{ id: string; title: string } | null>(null)
  const { data: allCourses } = useCourses()
  // A questionnaire course (MBTI, …) has no score: its result is the person's type.
  const questionnaireByCourse = useMemo(() => new Map(allCourses.map((c) => [c.id, courseQuestionnaireId(c)] as const)), [allCourses])
  const coverByCourse = useMemo(() => new Map(allCourses.map((c) => [c.id, c.thumbnailUrl] as const)), [allCourses])
  const { data: shadowRecords } = useShadowRecordsByUser(user.uid)
  const { data: roleplayAssessments } = useRoleplayAssessmentsByUser(user.uid)

  // Gate the Shadow / Role Play tabs (and their header counts) by whether THIS
  // user's department has those modules enabled — don't surface a feature the
  // viewed employee has no access to. super_admin viewed users get all modules;
  // the shared module store is warm after first load so this resolves instantly.
  const { allowedModules, loading: moduleLoading } = useModuleAccess(user.role, user.department)
  const showShadow = !moduleLoading && allowedModules.has('shadow')
  const showRoleplay = !moduleLoading && allowedModules.has('roleplay')

  // If the active tab gets hidden (module not allowed, or still resolving), fall
  // back to Information so the panel never lands on a tab with no trigger.
  useEffect(() => {
    if ((tab === 'shadow' && !showShadow) || (tab === 'roleplay' && !showRoleplay)) setTab('info')
  }, [tab, showShadow, showRoleplay])
  // This one user's records only — no longer needs the whole collection passed in.
  const { data: scopedRecords } = useUserTrainingRecords(user.uid)

  const userRecords = useMemo(
    () => [...scopedRecords].sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt as unknown as string).getTime() : 0
      const tb = b.completedAt ? new Date(b.completedAt as unknown as string).getTime() : 0
      return tb - ta
    }),
    [scopedRecords],
  )

  const completedCount = userRecords.filter((r) => r.status === 'completed').length
  const inProgressCount = userRecords.filter((r) => r.status === 'in_progress').length
  const avgScore = useMemo(() => {
    const scored = userRecords.filter((r) => r.score != null && r.status === 'completed')
    return scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : null
  }, [userRecords])

  const ROLE_BADGE: Record<string, string> = {
    sale:        'bg-freshket-100 text-freshket-700',
    team_lead:   'bg-blue-100 text-blue-700',
    manager:     'bg-purple-100 text-purple-700',
    super_admin: 'bg-orange-100 text-orange-700',
  }

  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: 'info',     label: 'Information' },
    { key: 'training', label: 'Training',   count: userRecords.length },
    ...(showShadow   ? [{ key: 'shadow'   as const, label: 'Shadow',    count: shadowRecords.length }] : []),
    ...(showRoleplay ? [{ key: 'roleplay' as const, label: 'Role Play', count: roleplayAssessments.length }] : []),
  ]

  return (
    <div
      className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full sm:w-[65vw] max-w-[960px]"
      style={{ height: '85vh', animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
      onClick={e => e.stopPropagation()}
    >
      <style>{`@keyframes popIn { from { transform: scale(0.93); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="size-11 rounded-full object-cover border-2 border-freshket-200 shadow-sm shrink-0" />
        ) : (
          <div className="size-11 rounded-full bg-freshket-100 border border-freshket-200 flex items-center justify-center text-base font-black text-freshket-700 shrink-0">
            {(user.displayNameEN || user.displayName)?.charAt(0).toUpperCase() ?? '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 truncate">
              {user.displayNameEN || user.displayName || user.email}
              {user.nickname && <span className="text-gray-400 font-normal text-xs"> ({user.nickname})</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {user.employeeId && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{user.employeeId}</span>
            )}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_BADGE[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <div className="text-center px-3 py-2 bg-freshket-50 rounded-xl min-w-[52px]">
            <p className="text-base font-black text-freshket-600 leading-none">{completedCount}</p>
            <p className="text-xs text-freshket-700 mt-0.5">Passed</p>
          </div>
          {showShadow && (
            <div className="text-center px-3 py-2 bg-blue-50 rounded-xl min-w-[52px]">
              <p className="text-base font-black text-blue-600 leading-none">{shadowRecords.length}</p>
              <p className="text-xs text-blue-700 mt-0.5">Shadow</p>
            </div>
          )}
          {showRoleplay && (
            <div className="text-center px-3 py-2 bg-purple-50 rounded-xl min-w-[52px]">
              <p className="text-base font-black text-purple-600 leading-none">{roleplayAssessments.length}</p>
              <p className="text-xs text-purple-700 mt-0.5">RolePlay</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 shrink-0 px-6 gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-freshket-500 text-freshket-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full leading-none font-bold ${
                tab === t.key ? 'bg-freshket-100 text-freshket-700' : 'bg-gray-100 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Tab: Information */}
        {tab === 'info' && (
          <div className="p-6 space-y-6">
            {/* Contact */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Contact</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Email" value={user.email} />
                <ProfileField label="Employee ID" value={user.employeeId ?? '—'} />
                <ProfileField label="Nickname" value={user.nickname ?? '—'} />
              </div>
            </section>
            {/* Role & Department */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Role & Department</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Role" value={ROLE_LABELS[user.role]} />
                <ProfileField label="Department" value={user.department ?? '—'} />
                <ProfileField label="Position" value={user.position ?? '—'} />
                <ProfileField label="Line Manager" value={(user as UserProfile & { lineManager?: string }).lineManager ?? '—'} />
              </div>
            </section>
            {/* Employment */}
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Employment</p>
              <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                <ProfileField label="Start Date" value={user.startDate ? new Date(user.startDate as unknown as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <ProfileField label="Tenure" value={calcTenure(user.startDate as Date | undefined)} />
              </div>
            </section>
          </div>
        )}

        {/* Tab: Training Record */}
        {tab === 'training' && (
          <div className="p-6 space-y-3">
            {userRecords.length === 0 ? (
              <EmptyState label="ยังไม่มีประวัติการอบรม" />
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-500">
                  <div className="col-span-4">หลักสูตร</div>
                  <div className="col-span-2 text-center">สถานะ</div>
                  <div className="col-span-1 text-center">Pre</div>
                  <div className="col-span-1 text-center">Post</div>
                  <div className="col-span-2 text-center">คะแนน</div>
                  <div className="col-span-2 text-right">วันที่อบรมจบ</div>
                </div>
                {userRecords.map(rec => {
                  // The day the course was finished; not finished yet reads as a dash.
                  const dateStr = rec.completedAt
                    ? new Date(rec.completedAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                    : '—'
                  const change = rec.preTestScore != null && rec.postTestScore != null ? rec.postTestScore - rec.preTestScore : null
                  const tone = (v: number) => (v >= 80 ? 'text-freshket-600' : v >= 60 ? 'text-amber-600' : 'text-rose-600')
                  const scoreColor = rec.score != null
                    ? rec.score >= 80 ? 'text-freshket-600' : rec.score >= 60 ? 'text-amber-600' : 'text-rose-600'
                    : 'text-gray-400'
                  return (
                    <div key={rec.id} className="grid grid-cols-12 gap-2 px-3 py-3 bg-white border border-gray-100 rounded-xl items-center hover:bg-gray-50 transition-colors">
                      <button
                        type="button"
                        onClick={() => setOpenCourse({ id: rec.courseId, title: rec.courseTitle })}
                        title="อ่าน Key Take Away และ Feedback"
                        className="col-span-4 min-w-0 text-left group/course flex items-center gap-3"
                      >
                        <CourseCover url={coverByCourse.get(rec.courseId)} className="size-11" />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-gray-800 line-clamp-2 leading-snug group-hover/course:text-freshket-700 group-hover/course:underline">{rec.courseTitle}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">ครั้งที่ {rec.attemptCount}</span>
                        </span>
                      </button>
                      <div className="col-span-2 flex justify-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[rec.status]}`}>
                          {STATUS_LABELS[rec.status]}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-sm font-black tabular-nums ${rec.preTestScore != null ? tone(rec.preTestScore) : 'text-gray-300'}`}>{rec.preTestScore ?? '—'}</span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-sm font-black tabular-nums ${rec.postTestScore != null ? tone(rec.postTestScore) : 'text-gray-300'}`}>{rec.postTestScore ?? '—'}</span>
                        {change !== null && (
                          <span className={`text-xs font-bold tabular-nums block leading-none mt-0.5 ${change > 0 ? 'text-freshket-600' : change < 0 ? 'text-rose-600' : 'text-gray-400'}`}>{change > 0 ? `+${change}` : change}</span>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        {questionnaireByCourse.get(rec.courseId) ? (
                          <UserQuestionnaireResult uid={user.uid} definitionId={questionnaireByCourse.get(rec.courseId)!} ownerName={formatPersonName(user)} />
                        ) : (
                          <>
                            <span className={`text-sm font-black ${scoreColor}`}>
                              {rec.score != null ? rec.score : '—'}
                            </span>
                            {rec.passScore != null && (
                              <span className="text-xs text-gray-400 block leading-none">/{rec.passScore}</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-xs text-gray-500 whitespace-nowrap">{dateStr}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {openCourse && (
          <MemberCourseDrawer
            memberUid={user.uid}
            memberName={formatPersonName(user)}
            courseId={openCourse.id}
            courseTitle={openCourse.title}
            onClose={() => setOpenCourse(null)}
          />
        )}

        {/* Tab: Shadow Visit */}
        {tab === 'shadow' && (
          <div className="p-6 space-y-2.5">
            {shadowRecords.length === 0 ? (
              <EmptyState label="ยังไม่มีบันทึก Shadow Visit" />
            ) : (
              shadowRecords.map(rec => (
                <ShadowCard key={rec.id} record={rec} onClick={() => setSelectedShadow(rec)} />
              ))
            )}
          </div>
        )}

        {/* A visit opens in a drawer on the right, over the list */}
        {selectedShadow && <ShadowVisitDrawer record={selectedShadow} onClose={() => setSelectedShadow(null)} />}

        {/* Tab: Role Play */}
        {tab === 'roleplay' && (
          <RolePlayTab assessments={roleplayAssessments} />
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 w-28">{label}</span>
      <span className="text-xs font-bold text-gray-800 text-right break-all flex-1">{value}</span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg className="size-10 text-gray-200 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  )
}

const SEGMENT_STYLE: Record<string, string> = {
  'Mini Chain':  'bg-blue-100 text-blue-700',
  'Stand alone': 'bg-amber-100 text-amber-700',
  'Chain':       'bg-purple-100 text-purple-700',
}
const PERSONA_STYLE: Record<string, string> = {
  'Chef':       'bg-freshket-100 text-freshket-700',
  'Owner':      'bg-sky-100 text-sky-700',
  'Purchasing': 'bg-indigo-100 text-indigo-700',
  'Manager':    'bg-orange-100 text-orange-700',
}

function ShadowCard({ record, onClick }: { record: ShadowRecord; onClick?: () => void }) {
  const mentorName = useMentorName()
  const dateStr = record.createdAt
    ? new Date(record.createdAt as unknown as string).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      className="w-full cursor-pointer text-left bg-white border border-gray-100 rounded-2xl p-4 hover:border-freshket-200 hover:bg-freshket-50/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-freshket-100 transition-colors">
          <svg className="size-4 text-slate-500 group-hover:text-freshket-600 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">{record.storeName}</p>
            <span className="text-xs text-gray-400 shrink-0">{dateStr}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEGMENT_STYLE[record.segment] ?? 'bg-gray-100 text-gray-600'}`}>{record.segment}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PERSONA_STYLE[record.persona] ?? 'bg-gray-100 text-gray-600'}`}>{record.persona}</span>
            <span className="text-xs text-gray-400">Mentor: <span className="font-bold text-gray-600">{mentorName(record)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {record.ratingScore != null && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{record.ratingScore}/5</span>
          )}
          <ShadowPushButton record={record} size="sm" />
          <svg className="size-4 text-gray-300 group-hover:text-freshket-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── RolePlayTab ───────────────────────────────────────────────────────────────

function avgTopicsForGroups(assessments: RoleplayAssessment[]): number[] {
  return RADAR_GROUPS.map(g => {
    let sum = 0, cnt = 0
    assessments.forEach(a => {
      g.keys.forEach(k => {
        const t = a.topics.find(t => t.key === k)
        if (t) { sum += t.rating; cnt++ }
      })
    })
    return cnt > 0 ? sum / cnt : 0
  })
}

function RolePlayTab({ assessments }: { assessments: RoleplayAssessment[] }) {
  const [viewMode, setViewMode] = useState<'overall' | 'pre' | 'post'>('overall')
  const [selectedRound, setSelectedRound] = useState<number>(1)

  const preRounds  = useMemo(() => Array.from(new Set(assessments.filter(a => a.type === 'pre').map(a => a.round))).sort((a,b)=>a-b), [assessments])
  const postRounds = useMemo(() => Array.from(new Set(assessments.filter(a => a.type === 'post').map(a => a.round))).sort((a,b)=>a-b), [assessments])

  const chartAssessments = useMemo(() => {
    if (viewMode === 'overall') return assessments
    const filtered = assessments.filter(a => a.type === viewMode && a.round === selectedRound)
    return filtered
  }, [assessments, viewMode, selectedRound])

  if (assessments.length === 0) return <EmptyState label="ยังไม่มีผล Role Play" />

  const overallScores  = avgTopicsForGroups(assessments)
  const preAvgScores   = avgTopicsForGroups(assessments.filter(a => a.type === 'pre'))
  const postAvgScores  = avgTopicsForGroups(assessments.filter(a => a.type === 'post'))

  const radarSets: { scores: number[]; color: string; label: string }[] = viewMode === 'overall'
    ? [
        ...(preAvgScores.some(s => s > 0)  ? [{ scores: preAvgScores,  color: '#3b82f6', label: 'Pre avg'  }] : []),
        ...(postAvgScores.some(s => s > 0) ? [{ scores: postAvgScores, color: '#00ce7c', label: 'Post avg' }] : []),
      ]
    : [{ scores: avgTopicsForGroups(chartAssessments), color: viewMode === 'pre' ? '#3b82f6' : '#00ce7c', label: viewMode === 'pre' ? `Pre รอบ ${selectedRound}` : `Post รอบ ${selectedRound}` }]

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['overall', 'pre', 'post'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setViewMode(m); if (m === 'pre' && preRounds.length) setSelectedRound(preRounds[0]); if (m === 'post' && postRounds.length) setSelectedRound(postRounds[0]) }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              viewMode === m
                ? m === 'overall' ? 'bg-gray-800 text-white' : m === 'pre' ? 'bg-blue-500 text-white' : 'bg-freshket-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {m === 'overall' ? 'ภาพรวม' : m === 'pre' ? `Pre (${preRounds.length} รอบ)` : `Post (${postRounds.length} รอบ)`}
          </button>
        ))}
        {viewMode !== 'overall' && (
          <select
            value={selectedRound}
            onChange={e => setSelectedRound(Number(e.target.value))}
            className="ml-2 text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-freshket-300"
          >
            {(viewMode === 'pre' ? preRounds : postRounds).map(r => (
              <option key={r} value={r}>รอบที่ {r}</option>
            ))}
          </select>
        )}
      </div>

      {/* Radar chart */}
      <div className="bg-gray-50 rounded-2xl p-2">
        <ProfileRadarChart radarSets={radarSets} />
      </div>

      {/* Group scores breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {RADAR_GROUPS.map((g, i) => {
          const score = viewMode === 'overall'
            ? overallScores[i]
            : avgTopicsForGroups(chartAssessments)[i]
          const pct = (score / 10) * 100
          const barColor = score >= 7 ? '#00ce7c' : score >= 5 ? '#f59e0b' : '#f87171'
          return (
            <div key={g.label} className="bg-white rounded-xl p-3 border border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-600 font-bold truncate">{g.shortLabel}</span>
                <span className="text-xs font-black" style={{ color: barColor }}>{score > 0 ? score.toFixed(1) : '—'}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Assessor notes */}
      {chartAssessments.map(a => a.overallNote && (
        <div key={a.id} className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-600 mb-1">{a.assessorName} · {a.type === 'pre' ? 'Pre' : 'Post'} รอบ {a.round}</p>
          <p className="text-xs text-gray-700 leading-relaxed">{a.overallNote}</p>
        </div>
      ))}
    </div>
  )
}

// ── SVG Radar Chart ───────────────────────────────────────────────────────────
const AXIS_COLORS = ['#2563eb','#7c3aed','#0891b2','#0d9488','#16a34a','#d97706','#dc2626','#9333ea']

function ProfileRadarChart({ radarSets }: { radarSets: { scores: number[]; color: string; label: string }[] }) {
  const cx = 200, cy = 190, maxR = 85, n = RADAR_GROUPS.length
  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) })
  const poly = (scores: number[]) =>
    scores.map((s, i) => pt(i, (s / 10) * maxR)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'
  const gridPcts = [0.2, 0.4, 0.6, 0.8, 1.0]
  const gridPolys = gridPcts.map(pct =>
    RADAR_GROUPS.map((_, i) => pt(i, maxR * pct)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'
  )
  return (
    <svg viewBox="30 40 340 300" className="w-full">
      <path d={gridPolys[4]} fill="#f8fafc" />
      {gridPolys.map((d, i) => <path key={i} d={d} fill="none" stroke={i === 4 ? '#d1d5db' : '#e5e7eb'} strokeWidth={i === 4 ? '1' : '0.75'} />)}
      {RADAR_GROUPS.map((_, i) => { const o = pt(i, maxR); return <line key={i} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke="#e5e7eb" strokeWidth="0.75" /> })}
      {[2,4,6,8,10].map((v, idx) => { const p = pt(0, maxR * gridPcts[idx]); return <text key={idx} x={p.x+4} y={p.y+1} fontSize="7" fill="#cbd5e1" fontFamily="Noto Sans Thai, sans-serif">{v}</text> })}
      {radarSets.map((rs, ri) => (
        <g key={ri}>
          <path d={poly(rs.scores)} fill={`${rs.color}1a`} stroke={rs.color} strokeWidth="2" strokeLinejoin="round" />
          {rs.scores.map((s, i) => { if (s <= 0) return null; const vp = pt(i, (s/10)*maxR); return <circle key={i} cx={vp.x} cy={vp.y} r="3.5" fill={rs.color} stroke="white" strokeWidth="1.5" /> })}
        </g>
      ))}
      {radarSets.length > 1 && radarSets.map((rs, ri) => {
        const x = cx - (radarSets.length * 45) / 2 + ri * 90
        const y = cy + maxR + 32
        return <g key={ri}><rect x={x} y={y} width={22} height={9} rx="2" fill={`${rs.color}1a`} stroke={rs.color} strokeWidth="1.5" /><text x={x+27} y={y+7.5} fontSize="8.5" fill="#64748b" fontFamily="Noto Sans Thai, sans-serif">{rs.label}</text></g>
      })}
      {RADAR_GROUPS.map((g, i) => {
        const p = pt(i, maxR + 22)
        const anchor = Math.abs(p.x - cx) < 10 ? 'middle' : p.x > cx ? 'start' : 'end'
        return <text key={i} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle" fontSize="9" fill={AXIS_COLORS[i]} fontFamily="Noto Sans Thai, sans-serif" fontWeight="700">{g.shortLabel}</text>
      })}
    </svg>
  )
}

