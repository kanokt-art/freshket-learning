'use client'

// The learner-assignment building blocks of the course builder, moved out of the courses page so a Course Design
// (which now owns who a course is for) can use the very same pickers, roster table and rules.

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { STATUS_LABELS, STATUS_COLORS, recordProgressPercent, type TrainingStatus, type TrainingRecord } from '@/types/tracking'
import type { UserProfile, UserRole, Department, Team } from '@/types/user'
import { save, remove, patch, removeMany } from '@/lib/data/collection'
import { formatDateEN } from '@/lib/utils/dateFormatter'
import { alertError, confirmAction } from '@/lib/ui/alert'
import { formatTenure } from '@/lib/users/tenure'
import { CopyableText, StartDateCell } from '@/components/common/EmployeeCells'
import { formatPersonName } from '@/lib/users/displayName'
import { onlyCurrentOrIncoming, isCurrentOrIncoming, isActiveEmployee } from '@/lib/users/active'
import { PHASE1_DEPARTMENTS, isTargetDepartment } from '@/lib/modules'
import { getDemoMode } from '@/lib/demo/demoMode'
import { authedFetch } from '@/lib/api/authedFetch'
import { InfoTooltip } from '@/components/common/InfoTooltip'

const DEMO_MODE = getDemoMode()

export function fmtDate(d: Date | string | undefined) {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d as string)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

// Real per-lesson progress when the learner's record has it (written by the course
// detail page as they complete lessons); falls back to the coarse status-derived
// estimate for records that predate lesson tracking or came from a CSV import.
export function approxProgressPct(status: TrainingStatus, record?: TrainingRecord): number {
  if (record && (record.totalLessons ?? 0) > 0) return recordProgressPercent(record)
  if (status === 'not_started') return 0
  if (status === 'in_progress') return 50
  return 100
}


// ── Assigned Learners Table Modal (from the "ทั้งหมด" counter in the builder) ──
export interface AssignedLearnerRow {
  user: UserProfile
  record?: TrainingRecord
  status: TrainingStatus
  lastActivity?: Date
}

// Super_admin manual correction of one learner's status/score(s) — the only
// path to it, since firestore.rules lets a learner write only their OWN
// record and never `score` at all (see /trainingRecords in firestore.rules).
// Goes through POST /api/training-records/override (Admin SDK); the realtime
// onSnapshot behind useAllTrainingRecords picks up the write on its own, so
// there's no local state to reconcile here after a successful save.
export function OverrideRecordModal({ row, courseId, courseTitle, hasPreTest, hasPostTest, onClose }: {
  row: AssignedLearnerRow; courseId: string; courseTitle: string
  hasPreTest: boolean; hasPostTest: boolean; onClose: () => void
}) {
  const [status, setStatus] = useState<TrainingStatus>(row.status)
  const [score, setScore] = useState(row.record?.score != null ? String(row.record.score) : '')
  const [preTestScore, setPreTestScore] = useState(row.record?.preTestScore != null ? String(row.record.preTestScore) : '')
  const [postTestScore, setPostTestScore] = useState(row.record?.postTestScore != null ? String(row.record.postTestScore) : '')
  const [saving, setSaving] = useState(false)

  function toNum(s: string): number | null | undefined {
    if (s.trim() === '') return null // explicit clear
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }

  async function handleReset() {
    if (DEMO_MODE) { onClose(); return }
    const ok = await confirmAction({ title: 'ล้างประวัติการเรียนของคอร์สนี้?', text: 'ลบสถานะ คะแนน และประวัติการสอบของผู้เรียนคนนี้ในหลักสูตรนี้ เพื่อให้เริ่มเรียน/ทำแบบทดสอบใหม่ได้ ย้อนกลับไม่ได้', confirmText: 'ล้างประวัติ', danger: true })
    if (!ok) return
    setSaving(true)
    try {
      const res = await authedFetch('/api/training-records/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: row.user.uid, courseId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        void alertError('ล้างประวัติไม่สำเร็จ', json.error ?? `HTTP ${res.status}`)
        return
      }
      onClose()
    } catch (e) {
      void alertError('ล้างประวัติไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    // Demo mode has no writable training-records backend — ALL_RECORDS is a
    // static mock array, not React state, so there's nothing to persist to
    // and nothing that would re-render from it either way. Matches every
    // other DEMO_MODE branch in this file: skip the network call entirely.
    if (DEMO_MODE) { onClose(); return }
    setSaving(true)
    try {
      const res = await authedFetch('/api/training-records/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.user.uid,
          courseId,
          courseTitle,
          status,
          score: toNum(score),
          ...(hasPreTest ? { preTestScore: toNum(preTestScore) } : {}),
          ...(hasPostTest ? { postTestScore: toNum(postTestScore) } : {}),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        void alertError('บันทึกไม่สำเร็จ', json.error ?? `HTTP ${res.status}`)
        return
      }
      onClose()
    } catch (e) {
      void alertError('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">แก้ไขสถานะ/คะแนน</p>
          <p className="text-xs text-gray-400 truncate">{row.user.displayName}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">สถานะ</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TrainingStatus)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-freshket-500">
              {(Object.keys(STATUS_LABELS) as TrainingStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน</label>
            <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)}
              placeholder="เว้นว่าง = ไม่มีคะแนน"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
            />
          </div>
          {hasPreTest && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน Pre-Test</label>
              <input type="number" min={0} max={100} value={preTestScore} onChange={(e) => setPreTestScore(e.target.value)}
                placeholder="เว้นว่าง = ไม่มีคะแนน"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
              />
            </div>
          )}
          {hasPostTest && (
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">คะแนน Post-Test</label>
              <input type="number" min={0} max={100} value={postTestScore} onChange={(e) => setPostTestScore(e.target.value)}
                placeholder="เว้นว่าง = ไม่มีคะแนน"
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-freshket-500 placeholder:text-gray-300"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          {row.record && (
            <button type="button" onClick={handleReset} disabled={saving}
              className="mr-auto px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-60">
              ล้างประวัติ
            </button>
          )}
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-60">
            ยกเลิก
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center gap-1.5">
            {saving && <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}

export function computeAssignedRows(assignedUserIds: string[], allUsers: UserProfile[], allTrainingRecords: TrainingRecord[], courseId?: string): AssignedLearnerRow[] {
  return assignedUserIds
    .map((uid) => allUsers.find((u) => u.uid === uid))
    .filter((u): u is UserProfile => !!u)
    .map((u) => {
      const record = courseId ? allTrainingRecords.find((r) => r.courseId === courseId && r.userId === u.uid) : undefined
      const status: TrainingStatus = record?.status ?? 'not_started'
      const lastActivity = record?.completedAt ?? record?.startedAt
      return { user: u, record, status, lastActivity }
    })
}

// Every column both learner tables can sort by. The assigned-learners table
// and the 165-row summary table share this so a column added to one is
// sortable in the other without a second comparator.
export type AssignedSortKey =
  | 'name' | 'department' | 'startDate' | 'hireDate' | 'status'
  | 'position' | 'tenure' | 'progress' | 'score' | 'lastActivity'
  | 'preTest' | 'postTest'

/** Rows carry at least a user and a status; the record is optional. */
export type SortableLearnerRow = {
  user: UserProfile
  record?: TrainingRecord
  status: TrainingStatus
  lastActivity?: Date
}

export function sortLearnerRows<T extends SortableLearnerRow>(
  rows: T[],
  sortKey: AssignedSortKey | null,
  sortDir: 'asc' | 'desc',
): T[] {
  if (!sortKey) return rows
  // Blanks sort last in BOTH directions. A learner with no score is not
  // "lower than zero" — pushing them to the end keeps the first screen full of
  // the rows that actually carry data, which is what someone sorting a
  // 165-row table is looking for.
  const nullsLast = (cmp: number, aMissing: boolean, bMissing: boolean) => {
    if (aMissing && bMissing) return 0
    if (aMissing) return 1
    if (bMissing) return -1
    return sortDir === 'asc' ? cmp : -cmp
  }
  const byNumber = (a?: number, b?: number) =>
    nullsLast((a ?? 0) - (b ?? 0), a == null, b == null)
  const byDate = (a?: Date, b?: Date) =>
    nullsLast((a?.getTime() ?? 0) - (b?.getTime() ?? 0), a == null, b == null)
  const byText = (a?: string, b?: string) =>
    nullsLast((a ?? '').localeCompare(b ?? '', 'th'), !a, !b)

  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'name':         return byText(a.user.displayName, b.user.displayName)
      case 'department':   return byText(a.user.department, b.user.department)
      case 'position':     return byText(a.user.position, b.user.position)
      case 'status':       return byText(a.status, b.status)
      case 'startDate':    return byDate(a.record?.startedAt, b.record?.startedAt)
      // The day they joined the company (not when they started this course).
      case 'hireDate':     return byDate(a.user.startDate, b.user.startDate)
      case 'lastActivity': return byDate(a.lastActivity, b.lastActivity)
      // Longest tenure first when descending: an earlier start date means more
      // time served, so this sorts on the date itself.
      case 'tenure':       return byDate(a.user.startDate, b.user.startDate)
      case 'progress':     return byNumber(
        approxProgressPct(a.status, a.record),
        approxProgressPct(b.status, b.record),
      )
      case 'score':        return byNumber(a.record?.score, b.record?.score)
      case 'preTest':      return byNumber(a.record?.preTestScore, b.record?.preTestScore)
      case 'postTest':     return byNumber(a.record?.postTestScore, b.record?.postTestScore)
      default:             return 0
    }
  })
}

/** Column-sort state shared by both learner tables. */
export function useLearnerSort() {
  const [sortKey, setSortKey] = useState<AssignedSortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function handleSort(key: AssignedSortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  return { sortKey, sortDir, handleSort }
}

export function SortableTh({ label, sortKey, activeSortKey, sortDir, onSort }: {
  label: string; sortKey: AssignedSortKey; activeSortKey: AssignedSortKey | null; sortDir: 'asc' | 'desc'
  onSort: (key: AssignedSortKey) => void
}) {
  const active = sortKey === activeSortKey
  return (
    <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-gray-600 transition-colors"
      onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <svg className={`size-3 transition-transform ${active ? 'text-gray-600' : 'text-gray-300'} ${active && sortDir === 'desc' ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </span>
    </th>
  )
}

export function AssignedLearnersTable({ rows, enrolledUserIds, onRemove, onRemoveMany, emptyText, courseId, courseTitle, hasPreTest, hasPostTest, isSuperAdmin }: {
  rows: AssignedLearnerRow[]; enrolledUserIds: Set<string>; onRemove: (uid: string) => void
  /** Bulk removal. Falls back to one onRemove per uid when not supplied. */
  onRemoveMany?: (uids: string[]) => void
  emptyText?: string
  courseId?: string; courseTitle?: string; hasPreTest?: boolean; hasPostTest?: boolean; isSuperAdmin?: boolean
}) {
  const { sortKey, sortDir, handleSort } = useLearnerSort()
  const [editingRow, setEditingRow] = useState<AssignedLearnerRow | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Resigned learners are never shown here, no toggle — this table is for
  // managing who's assigned, not auditing history (the summary tab, which
  // covers training-record history, keeps its own hide/show toggle instead).
  // Assigning a course to a department/team condition, or just an org
  // reorganisation over time, both leave resigned learners sitting in
  // assignedUserIds (removeAssignedUser only prunes on manual removal), so
  // this filter is what actually keeps them out of view.
  const visibleRows = useMemo(() => rows.filter((r) => isCurrentOrIncoming(r.user) && isTargetDepartment(r.user.department)), [rows])

  // Search the list by name (English or Thai), nickname or department.
  const [query, setQuery] = useState('')
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visibleRows
    return visibleRows.filter(({ user: u }) =>
      [u.displayNameEN, u.displayName, u.nickname, u.department].some((v) => (v ?? '').toLowerCase().includes(q)),
    )
  }, [visibleRows, query])

  const sorted = useMemo(() => sortLearnerRows(filteredRows, sortKey, sortDir), [filteredRows, sortKey, sortDir])

  // Everyone in the list (the search narrows what is shown, not what stays selected), and
  // just the people currently shown (what "select all" and the header tick act on).
  const selectableUids = useMemo(() => visibleRows.map((r) => r.user.uid), [visibleRows])
  const shownUids = useMemo(() => sorted.map((r) => r.user.uid), [sorted])

  // Drop selections whose row disappeared (removed, or filtered out upstream),
  // otherwise the count could exceed what's on screen.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const valid = new Set(selectableUids)
      const next = new Set(Array.from(prev).filter((uid) => valid.has(uid)))
      return next.size === prev.size ? prev : next
    })
  }, [selectableUids])

  const allSelected = shownUids.length > 0 && shownUids.every((uid) => selected.has(uid))
  const someSelected = !allSelected && shownUids.some((uid) => selected.has(uid))

  function toggleOne(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) shownUids.forEach((uid) => next.delete(uid))
      else shownUids.forEach((uid) => next.add(uid))
      return next
    })
  }

  async function handleRemoveSelected() {
    const uids = Array.from(selected)
    if (uids.length === 0) return
    const started = uids.filter((uid) => enrolledUserIds.has(uid)).length
    const ok = await confirmAction({
      title: `ลบผู้เรียน ${uids.length} คน?`,
      text: started > 0
        ? `ในจำนวนนี้ ${started} คนเริ่มเรียนแล้ว ประวัติการเรียนของคนเหล่านั้นในหลักสูตรนี้ (ความคืบหน้า คะแนน สถานะ) จะถูกลบถาวรเมื่อบันทึก และกู้คืนไม่ได้`
        : 'ผู้เรียนที่เลือกจะถูกนำออกจากรายชื่อของหลักสูตรนี้',
      confirmText: started > 0 ? 'ลบผู้เรียนและประวัติ' : 'ลบออก',
      danger: true,
    })
    if (!ok) return
    if (onRemoveMany) onRemoveMany(uids)
    else uids.forEach(onRemove)
    setSelected(new Set())
  }
  // One learner. Someone who already started is removed only after a confirmation that
  // says their history in this course goes with them.
  async function handleRemoveOne(row: AssignedLearnerRow) {
    const started = enrolledUserIds.has(row.user.uid)
    if (started) {
      const ok = await confirmAction({
        title: `ลบ ${formatPersonName(row.user)} ออกจากหลักสูตร?`,
        text: 'คนนี้เริ่มเรียนแล้ว ประวัติการเรียนของเขาในหลักสูตรนี้ (ความคืบหน้า คะแนน สถานะ) จะถูกลบถาวรเมื่อบันทึก และกู้คืนไม่ได้',
        confirmText: 'ลบผู้เรียนและประวัติ',
        danger: true,
      })
      if (!ok) return
    }
    onRemove(row.user.uid)
  }

  // Editing needs a real courseId to write trainingRecords/{uid}_{courseId} —
  // a brand-new, unsaved course has none yet, so the edit affordance is
  // simply unavailable until the course exists.
  const canEdit = isSuperAdmin && !!courseId

  return (
    <>
    {/* Search: name, nickname or department */}
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-white">
      <div className="relative flex-1 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
        </svg>
        <input
          type="search"
          id="assigned-learners-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ ชื่อเล่น หรือแผนก"
          aria-label="ค้นหาผู้เรียน"
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-400"
        />
      </div>
      {query.trim() && (
        <span className="text-xs text-gray-500 shrink-0">
          พบ <span className="font-bold text-gray-800">{sorted.length}</span> จาก {visibleRows.length} คน
        </span>
      )}
    </div>

    {/* Bulk action bar — only occupies space once something is selected. */}
    {selected.size > 0 && (
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-freshket-50 border-b border-freshket-200">
        <span className="text-xs font-bold text-freshket-700">เลือกแล้ว {selected.size} คน</span>
        <button type="button" onClick={() => setSelected(new Set())}
          className="text-xs font-normal text-gray-500 hover:text-gray-700 transition-colors">
          ล้างการเลือก
        </button>
        <button type="button" onClick={() => { void handleRemoveSelected() }}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          ลบออก {selected.size} คน
        </button>
      </div>
    )}
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100 sticky top-0 bg-white">
          <th className="px-4 py-3 w-10">
            <input
              type="checkbox"
              aria-label="เลือกทั้งหมด"
              checked={allSelected}
              // Partial selection reads as a dash rather than a tick — a
              // checked box here would claim every row is selected.
              ref={(el) => { if (el) el.indeterminate = someSelected }}
              onChange={toggleAll}
              disabled={shownUids.length === 0}
              className="size-4 rounded border-gray-300 text-freshket-500 focus:ring-2 focus:ring-freshket-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            />
          </th>
          <SortableTh label="Name" sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <th className="text-left text-xs font-bold text-gray-400 px-4 py-3 whitespace-nowrap">Position</th>
          <SortableTh label="Department" sortKey="department" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Start Date" sortKey="hireDate" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Tenure" sortKey="tenure" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Course Started" sortKey="startDate" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Last Activity" sortKey="lastActivity" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Progress" sortKey="progress" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <SortableTh label="Score" sortKey="score" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          {hasPreTest && <SortableTh label="Pre-Test" sortKey="preTest" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
          {hasPostTest && <SortableTh label="Post-Test" sortKey="postTest" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
          <SortableTh label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr><td colSpan={11 + (hasPreTest ? 1 : 0) + (hasPostTest ? 1 : 0)} className="text-center text-gray-400 text-sm py-10">
            {/* Distinguish "genuinely nobody assigned" from "everyone
                assigned here has resigned" — otherwise this read as the
                assignment being empty when it wasn't. */}
            {visibleRows.length > 0
              ? `ไม่พบผู้เรียนที่ตรงกับ "${query.trim()}"`
              : rows.length > 0
                ? 'ผู้เรียนทั้งหมดในรายชื่อนี้ลาออกแล้ว'
                : (emptyText ?? 'ยังไม่มีผู้เรียนที่กำหนด')}
          </td></tr>
        ) : sorted.map((row) => {
          const { user: u, record, status, lastActivity } = row
          const pct = approxProgressPct(status, record)
          const isEnrolled = enrolledUserIds.has(u.uid)
          const isSelected = selected.has(u.uid)
          return (
            <tr key={u.uid} className={`group border-b border-gray-50 last:border-0 transition-colors ${isSelected ? 'bg-freshket-50/60' : 'hover:bg-gray-50/60'}`}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={`เลือก ${u.displayName}`}
                  checked={isSelected}
                  onChange={() => toggleOne(u.uid)}
                  className="size-4 rounded border-gray-300 text-freshket-500 focus:ring-2 focus:ring-freshket-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {u.photoURL
                      ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                      : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{formatPersonName(u)}</p>
                    {u.employmentStatus === 'Pending' && (
                      <span className="inline-block mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">ยังไม่เริ่มงาน</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600"><CopyableText text={u.position} /></td>
              <td className="px-4 py-3 text-xs text-gray-600"><CopyableText text={u.department} /></td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(u.startDate)}</td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatTenure(u.startDate)}</td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(record?.startedAt)}</td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(lastActivity)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2 w-24">
                  <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-freshket-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                {record?.score != null ? `${record.score}${record.passScore != null ? `/${record.passScore}` : ''}` : '—'}
              </td>
              {hasPreTest && (
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{record?.preTestScore ?? '—'}</td>
              )}
              {hasPostTest && (
                <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{record?.postTestScore ?? '—'}</td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {canEdit && (
                    <button type="button" title="แก้ไขสถานะ/คะแนน" onClick={() => setEditingRow(row)}
                      className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                  )}
                  <button type="button"
                    title={isEnrolled ? 'ลบออก (เริ่มเรียนแล้ว — ประวัติจะถูกลบด้วย)' : 'ลบออกจากรายชื่อผู้เรียน'}
                    onClick={() => { void handleRemoveOne(row) }}
                    className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all">
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    {editingRow && courseId && (
      <OverrideRecordModal
        row={editingRow}
        courseId={courseId}
        courseTitle={courseTitle ?? ''}
        hasPreTest={!!hasPreTest}
        hasPostTest={!!hasPostTest}
        onClose={() => setEditingRow(null)}
      />
    )}
    </>
  )
}

export function AssignedLearnersTableModal({ assignedUserIds, allUsers, allTrainingRecords, enrolledUserIds, courseId, courseTitle, hasPreTest, hasPostTest, isSuperAdmin, onRemove, onRemoveMany, onClose }: {
  assignedUserIds: string[]; allUsers: UserProfile[]; allTrainingRecords: TrainingRecord[]; enrolledUserIds: Set<string>
  courseId?: string; courseTitle?: string; hasPreTest?: boolean; hasPostTest?: boolean; isSuperAdmin?: boolean
  onRemove: (uid: string) => void; onRemoveMany?: (uids: string[]) => void; onClose: () => void
}) {
  const rows = useMemo(() => computeAssignedRows(assignedUserIds, allUsers, allTrainingRecords, courseId), [assignedUserIds, allUsers, allTrainingRecords, courseId])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">รายชื่อผู้เรียน</h3>
            <p className="text-xs text-gray-400">{rows.filter((r) => isCurrentOrIncoming(r.user) && isTargetDepartment(r.user.department)).length} คน</p>
          </div>
          <button type="button" onClick={onClose}
            className="size-9 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <AssignedLearnersTable rows={rows} enrolledUserIds={enrolledUserIds} onRemove={onRemove} onRemoveMany={onRemoveMany}
            courseId={courseId} courseTitle={courseTitle} hasPreTest={hasPreTest} hasPostTest={hasPostTest} isSuperAdmin={isSuperAdmin} />
        </div>
      </div>
    </div>
  )
}



// ── Searchable filter dropdown (department/position pickers) ──────────────────
export function FilterCombobox({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-xs rounded-lg border border-gray-200 px-2.5 py-2 bg-white text-gray-600 hover:border-gray-300 transition-colors">
        <span className={`truncate ${value ? 'text-gray-700 font-bold' : 'text-gray-400'}`}>{value || placeholder}</span>
        <svg className={`size-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input type="text" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา..."
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!value ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
              {placeholder}
            </button>
            {filtered.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">ไม่พบ</p>
              : filtered.map((o) => (
                <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); setQuery('') }}
                  className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${value === o ? 'bg-freshket-50 text-freshket-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {o}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Side Panel shell (slide-over from the right) ──────────────────────────────
export function SidePanel({ title, subtitle, onClose, footer, children }: {
  title: string; subtitle?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[80vw] h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ animation: 'orgModalIn 0.18s cubic-bezier(0.16,1,0.3,1)' }}>
        <style>{`@keyframes orgModalIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }`}</style>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="size-8 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-3">{footer}</div>}
      </div>
    </div>
  )
}

export function PanelFooter({ selectedCount, onCancel, onConfirm }: { selectedCount: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <span className="text-xs font-bold text-gray-500">เลือกแล้ว {selectedCount} คน</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
          ยกเลิก
        </button>
        <button type="button" onClick={onConfirm}
          className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-xs font-bold hover:bg-freshket-600 transition-all">
          บันทึก
        </button>
      </div>
    </>
  )
}

export type GroupState = 'checked' | 'partial' | 'unchecked' | 'empty'

export function computeGroupState(ids: string[], assignedSet: Set<string>, enrolledUserIds: Set<string>): GroupState {
  const selectable = ids.filter((id) => !enrolledUserIds.has(id))
  if (selectable.length === 0) return 'empty'
  if (selectable.every((id) => assignedSet.has(id))) return 'checked'
  if (selectable.some((id) => assignedSet.has(id))) return 'partial'
  return 'unchecked'
}

export function GroupCheckbox({ state, onChange, allowIndeterminate = true }: {
  state: GroupState; onChange: () => void
  /**
   * The dash/indeterminate mark reads as "this GROUP is a mix of selected and
   * unselected members" — correct for DepartmentTeamPicker's real tree
   * (department → team → member), where a partially-checked department
   * genuinely means some but not all of its teams are picked. But
   * ConditionGroupPicker's buckets (rank/position/tenure) are flat and
   * independent, not parent/child — since tenure buckets can now overlap
   * (ไม่เกิน 3 เดือน sits inside น้อยกว่า 1 ปี), checking the narrower one
   * leaves the wider one showing a dash that has nothing to do with a
   * hierarchy, since there isn't one. Pass allowIndeterminate={false} there
   * so it just reads unchecked until the whole bucket is picked.
   */
  allowIndeterminate?: boolean
}) {
  return (
    <input type="checkbox" checked={state === 'checked'} disabled={state === 'empty'}
      ref={(el) => { if (el) el.indeterminate = allowIndeterminate && state === 'partial' }}
      onChange={onChange}
      className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-4 shrink-0 disabled:opacity-30"
    />
  )
}

// ── Individual Assignment Panel ────────────────────────────────────────────────
export function IndividualAssignmentPanel({ users, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  users: UserProfile[]; assignedIds: string[]; enrolledUserIds: Set<string>
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [sortByStartDate, setSortByStartDate] = useState<'none' | 'asc' | 'desc'>('none')
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))

  function toggleDraft(uid: string) {
    setDraft((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  }

  // Same rule as every other picker — see src/lib/users/active.ts.
  const activeUsers = useMemo(() => onlyCurrentOrIncoming(users), [users])

  const departments = useMemo(() => Array.from(new Set(activeUsers.map((u) => u.department).filter(Boolean))).sort() as string[], [activeUsers])
  const positions = useMemo(() => Array.from(new Set(activeUsers.map((u) => u.position).filter(Boolean))).sort() as string[], [activeUsers])

  const filtered = useMemo(() => {
    let list = activeUsers
    if (deptFilter) list = list.filter((u) => u.department === deptFilter)
    if (positionFilter) list = list.filter((u) => u.position === positionFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.displayNameEN?.toLowerCase() ?? '').includes(q) ||
        (u.nickname?.toLowerCase() ?? '').includes(q) ||
        (u.employeeId?.toLowerCase() ?? '').includes(q) ||
        (u.position?.toLowerCase() ?? '').includes(q),
      )
    }
    if (sortByStartDate !== 'none') {
      list = [...list].sort((a, b) => {
        const at = a.startDate?.getTime() ?? 0
        const bt = b.startDate?.getTime() ?? 0
        return sortByStartDate === 'asc' ? at - bt : bt - at
      })
    }
    return list
  }, [activeUsers, search, deptFilter, positionFilter, sortByStartDate])

  const filteredIds = useMemo(() => filtered.map((u) => u.uid), [filtered])
  const selectAllState = computeGroupState(filteredIds, draft, enrolledUserIds)

  function toggleSelectAllFiltered() {
    const selectableIds = filteredIds.filter((id) => !enrolledUserIds.has(id))
    setDraft((p) => {
      const n = new Set(p)
      if (selectAllState === 'checked') selectableIds.forEach((id) => n.delete(id))
      else selectableIds.forEach((id) => n.add(id))
      return n
    })
  }

  return (
    <SidePanel title="มอบหมายรายบุคคล" onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={() => { onConfirm(Array.from(draft)); onClose() }} />}
    >
      <div className="p-3 border-b border-gray-100 sticky top-0 bg-white z-10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัสพนักงาน หรือตำแหน่ง..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
            />
          </div>
          {departments.length > 0 && (
            <div className="w-52 shrink-0">
              <FilterCombobox value={deptFilter} onChange={setDeptFilter} options={departments} placeholder="ทุกแผนก" />
            </div>
          )}
          {positions.length > 0 && (
            <div className="w-52 shrink-0">
              <FilterCombobox value={positionFilter} onChange={setPositionFilter} options={positions} placeholder="ทุกตำแหน่ง" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <GroupCheckbox state={selectAllState} onChange={toggleSelectAllFiltered} />
            <span className="text-xs font-bold text-gray-600">เลือกทั้งหมด ({filteredIds.length} คน)</span>
          </label>
          <button type="button"
            onClick={() => setSortByStartDate((s) => s === 'asc' ? 'desc' : 'asc')}
            className={`shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors ${
              sortByStartDate !== 'none' ? 'text-freshket-600 bg-freshket-50' : 'text-gray-400 hover:bg-gray-50'
            }`}>
            วันเริ่มงาน
            <svg className={`size-3 transition-transform ${sortByStartDate === 'desc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบพนักงาน</p>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white z-[5]">
            <tr className="border-b border-gray-100">
              <th className="w-10 px-4 py-2.5"></th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">Name</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">Emp.ID</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">Position</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">Department</th>
              <th className="px-2 py-2.5 text-xs font-bold text-gray-500">Start Date</th>
              <th className="w-24 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isEnrolled = enrolledUserIds.has(u.uid)
              const checked = draft.has(u.uid) || isEnrolled
              return (
                <tr key={u.uid}
                  onClick={() => !isEnrolled && toggleDraft(u.uid)}
                  className={`border-b border-gray-50 transition-colors ${isEnrolled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={checked} disabled={isEnrolled} onChange={() => toggleDraft(u.uid)} onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 size-4 shrink-0 disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                        {u.photoURL
                          ? <img src={u.photoURL} alt={u.displayName} className="size-full object-cover" />
                          : <span className="text-xs font-bold text-gray-500">{u.displayName[0]}</span>}
                      </div>
                      <p className="text-xs font-bold text-gray-800 truncate">{formatPersonName(u)}</p>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-gray-500 whitespace-nowrap font-mono">{u.employeeId ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-gray-600"><CopyableText text={u.position} /></td>
                  <td className="px-2 py-2.5 text-xs text-gray-600"><CopyableText text={u.department} /></td>
                  <td className="px-2 py-2.5 text-xs text-gray-600"><StartDateCell startDate={u.startDate} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {isEnrolled && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">เรียนแล้ว</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </SidePanel>
  )
}

// ── Department → Team Picker ───────────────────────────────────────────────────
export interface DeptTreeNode {
  id: string; name: string
  teams: { id: string; name: string; memberIds: string[] }[]
  unassignedIds: string[]
}

export function DepartmentTeamPicker({ deptTree, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  deptTree: DeptTreeNode[]; assignedIds: string[]; enrolledUserIds: Set<string>
  /**
   * `departments` = names selected as a WHOLE department (every team + the
   * unassigned bucket checked) — see the assignedDepartments comment on the
   * Course type. `teamIds` = individual teams fully checked within a
   * department that ISN'T wholly selected (see assignedTeamIds) — e.g.
   * checking just "Chain" inside Key Account Management without checking
   * every other team there too.
   */
  onConfirm: (ids: string[], departments: string[], teamIds: string[]) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleDraftGroup(userIds: string[], checked: boolean) {
    setDraft((p) => {
      const n = new Set(p)
      if (checked) userIds.forEach((id) => n.add(id))
      else userIds.forEach((id) => n.delete(id))
      return n
    })
  }

  function handleConfirm() {
    const fullyCheckedDepts: string[] = []
    const fullyCheckedTeamIds: string[] = []
    for (const dept of deptTree) {
      const allDeptIds = [...dept.unassignedIds, ...dept.teams.flatMap((t) => t.memberIds)]
      if (computeGroupState(allDeptIds, draft, enrolledUserIds) === 'checked') {
        // Whole department — assignedDepartments already covers every team
        // and the unassigned bucket under it, so recording individual teams
        // here too would be redundant.
        fullyCheckedDepts.push(dept.name)
        continue
      }
      // Department isn't wholly selected, but individual teams under it can
      // still be — e.g. "just the Chain team" out of Key Account Management.
      for (const team of dept.teams) {
        if (computeGroupState(team.memberIds, draft, enrolledUserIds) === 'checked') {
          fullyCheckedTeamIds.push(team.id)
        }
      }
    }
    onConfirm(Array.from(draft), fullyCheckedDepts, fullyCheckedTeamIds)
    onClose()
  }

  return (
    <SidePanel title="เลือกสังกัด" onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={handleConfirm} />}
    >
      {deptTree.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบข้อมูลแผนก</p>
      ) : deptTree.map((dept) => {
        const allDeptIds = [...dept.unassignedIds, ...dept.teams.flatMap((t) => t.memberIds)]
        const state = computeGroupState(allDeptIds, draft, enrolledUserIds)
        const isOpen = expanded.has(dept.id)
        return (
          <div key={dept.id} className="border-b border-gray-100">
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
              <button type="button" onClick={() => toggleExpand(dept.id)} className="shrink-0 text-gray-400 hover:text-gray-600">
                <svg className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <GroupCheckbox state={state} onChange={() => toggleDraftGroup(allDeptIds.filter((id) => !enrolledUserIds.has(id)), state !== 'checked')} />
              <button type="button" onClick={() => toggleExpand(dept.id)} className="flex-1 min-w-0 text-left">
                <span className="text-sm font-bold text-gray-800 truncate">{dept.name}</span>
              </button>
              <span className="text-xs text-gray-400 shrink-0">{allDeptIds.length} คน</span>
            </div>
            {isOpen && (
              <div className="pl-10 pb-2 space-y-0.5">
                {dept.teams.map((team) => {
                  const tState = computeGroupState(team.memberIds, draft, enrolledUserIds)
                  return (
                    <label key={team.id} className="flex items-center gap-2 pr-4 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                      <GroupCheckbox state={tState} onChange={() => toggleDraftGroup(team.memberIds.filter((id) => !enrolledUserIds.has(id)), tState !== 'checked')} />
                      <span className="text-xs text-gray-600 flex-1 truncate">{team.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{team.memberIds.length} คน</span>
                    </label>
                  )
                })}
                {dept.unassignedIds.length > 0 && (
                  <label className="flex items-center gap-2 pr-4 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                    <GroupCheckbox
                      state={computeGroupState(dept.unassignedIds, draft, enrolledUserIds)}
                      onChange={() => toggleDraftGroup(dept.unassignedIds.filter((id) => !enrolledUserIds.has(id)), computeGroupState(dept.unassignedIds, draft, enrolledUserIds) !== 'checked')}
                    />
                    <span className="text-xs text-gray-400 flex-1 italic">ยังไม่มีทีม</span>
                    <span className="text-xs text-gray-400 shrink-0">{dept.unassignedIds.length} คน</span>
                  </label>
                )}
              </div>
            )}
          </div>
        )
      })}
    </SidePanel>
  )
}

// ── Generic condition group picker (rank / position / tenure) ─────────────────
export function ConditionGroupPicker({ title, groups, assignedIds, enrolledUserIds, onConfirm, onClose }: {
  title: string; groups: { key: string; label: string; userIds: string[] }[]
  assignedIds: string[]; enrolledUserIds: Set<string>
  onConfirm: (ids: string[]) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(assignedIds))

  function toggleDraftGroup(userIds: string[], checked: boolean) {
    setDraft((p) => {
      const n = new Set(p)
      if (checked) userIds.forEach((id) => n.add(id))
      else userIds.forEach((id) => n.delete(id))
      return n
    })
  }

  return (
    <SidePanel title={title} onClose={onClose}
      footer={<PanelFooter selectedCount={draft.size} onCancel={onClose} onConfirm={() => { onConfirm(Array.from(draft)); onClose() }} />}
    >
      {groups.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">ไม่พบข้อมูล</p>
      ) : groups.map((g) => {
        const state = computeGroupState(g.userIds, draft, enrolledUserIds)
        return (
          <label key={g.key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
            <GroupCheckbox state={state} allowIndeterminate={false} onChange={() => toggleDraftGroup(g.userIds.filter((id) => !enrolledUserIds.has(id)), state !== 'checked')} />
            <span className="flex-1 text-sm font-bold text-gray-800 truncate">{g.label}</span>
            <span className="text-xs text-gray-400 shrink-0">{g.userIds.length} คน</span>
          </label>
        )
      })}
    </SidePanel>
  )
}

// ── Save confirmation modal ─────────────────────────────────────────────────────
export function SaveConfirmationModal({ recipientCount, skippedCount, saving, onBack, onConfirm }: {
  recipientCount: number; skippedCount: number; saving: boolean
  onBack: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="animate-pop-in bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
        <div className="size-14 rounded-full bg-freshket-100 flex items-center justify-center mx-auto mb-4">
          <svg className="size-7 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1">ยืนยันการบันทึกหลักสูตร</h3>
        <p className="text-sm text-gray-600 mb-1">จะแจ้งเตือนผู้เรียน <span className="font-bold text-freshket-600">{recipientCount} คน</span></p>
        {skippedCount > 0 && (
          <p className="text-xs text-gray-400 mb-1">ข้าม {skippedCount} คนที่เรียนไปแล้ว</p>
        )}
        <p className="text-xs text-gray-400 mb-6">ผู้ใช้ที่เคยเรียนคอร์สนี้แล้วจะไม่ถูกส่งซ้ำ</p>
        <div className="flex gap-3">
          <button onClick={onBack} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-60">
            ย้อนกลับ
          </button>
          <button onClick={() => onConfirm()} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <><span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังบันทึก...</> : 'ยืนยันและบันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}


// Buckets are NOT required to be disjoint — the picker just unions the
// userIds of every checked bucket, so "ไม่เกิน 3 เดือน" deliberately overlaps
// "น้อยกว่า 1 ปี" rather than splitting it: someone 2 months in still belongs
// under "less than 1 year" too, and a rule built for onboarding-stage
// employees needs the finer 3-month cut without losing the coarser one other
// courses already rely on.
export const TENURE_BUCKETS: { key: string; label: string; test: (years: number) => boolean }[] = [
  { key: 'lt3mo', label: 'ไม่เกิน 3 เดือน', test: (y) => y <= 3 / 12 },
  { key: 'lt1',  label: 'น้อยกว่า 1 ปี', test: (y) => y < 1 },
  { key: '1to3', label: '1-3 ปี',        test: (y) => y >= 1 && y < 3 },
  { key: '3to5', label: '3-5 ปี',        test: (y) => y >= 3 && y < 5 },
  { key: 'gt5',  label: 'มากกว่า 5 ปี',   test: (y) => y >= 5 },
]

export function tenureYears(startDate?: Date | string): number | null {
  if (!startDate) return null
  const d = startDate instanceof Date ? startDate : new Date(startDate as string)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
}

// Display form for the summary tab's tenure column (shared with the team views).
export function fmtTenure(startDate?: Date | string): string {
  return formatTenure(startDate)
}

