'use client'

import { useMemo, useState } from 'react'
import {
  AssignedLearnersTable, AssignedLearnersTableModal, IndividualAssignmentPanel, DepartmentTeamPicker, ConditionGroupPicker,
  computePackageRows, TENURE_BUCKETS, tenureYears, type DeptTreeNode,
} from '@/components/features/LearnerAssignment'
import type { TrainingRecord } from '@/types/tracking'
import { getTeamLeadIds, getTeamManagerIds, type UserProfile, type Department, type Team } from '@/types/user'
import { onlyCurrentOrIncoming, isCurrentOrIncoming } from '@/lib/users/active'
import { PHASE1_DEPARTMENTS, isTargetDepartment } from '@/lib/modules'

// "กำหนดผู้เรียน" for a Course Design: who the learners are — people picked one by one, and conditions (a whole
// department, a team, a rank, a position, a tenure) that pick them. The same pickers and roster the course builder
// used to carry; the audience now lives on the Course Design, so this takes the audience as a value and reports
// changes, instead of reading a course form.

export interface Audience {
  assignedUserIds: string[]
  assignedDepartments: string[]
  assignedTeamIds: string[]
}

export function LearnerAssignmentTab({ value, onChange, allUsers, departments, teams, records, courseIds, isSuperAdmin }: {
  value: Audience
  onChange: (patch: Partial<Audience>) => void
  allUsers: UserProfile[]
  departments: Department[]
  teams: Team[]
  /** Training records, to see who has already started one of this package's courses. */
  records: TrainingRecord[]
  courseIds: string[]
  isSuperAdmin: boolean
}) {
  // Whoever already has a record in one of the package's courses.
  const enrolledUserIds = useMemo(() => {
    const ids = new Set(courseIds)
    return new Set(records.filter((r) => ids.has(r.courseId)).map((r) => r.userId))
  }, [records, courseIds])

  // Every picker builds its groups from this list: people still employed (or about to start), in the departments of
  // the current rollout. Someone who has resigned is never meant to be assigned a course.
  const assignableUsers = useMemo(
    () => onlyCurrentOrIncoming(allUsers).filter((u) => isTargetDepartment(u.department)),
    [allUsers],
  )

  // A user's teamId can point at a team that no longer exists; that is the same as having no team.
  const validTeamIds = useMemo(() => new Set(teams.map((t) => t.id)), [teams])

  // A team's lead or manager does not necessarily carry that team's id themselves; the team document is the source
  // of truth for who leads it, so they are counted in the team rather than under "no team".
  const leadOrManagerTeamId = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of teams) {
      for (const uid of [...getTeamLeadIds(t), ...getTeamManagerIds(t)]) if (!map.has(uid)) map.set(uid, t.id)
    }
    return map
  }, [teams])

  const deptTree: DeptTreeNode[] = useMemo(() => departments
    .filter((dept) => PHASE1_DEPARTMENTS.has(dept.name))
    .map((dept) => ({
      id: dept.id, name: dept.name,
      teams: teams.filter((t) => t.departmentId === dept.id).map((t) => ({
        id: t.id, name: t.name,
        memberIds: assignableUsers.filter((u) => u.teamId === t.id || leadOrManagerTeamId.get(u.uid) === t.id).map((u) => u.uid),
      })),
      unassignedIds: assignableUsers
        .filter((u) => u.department === dept.name && (!u.teamId || !validTeamIds.has(u.teamId)) && !leadOrManagerTeamId.has(u.uid))
        .map((u) => u.uid),
    })),
  [departments, teams, assignableUsers, validTeamIds, leadOrManagerTeamId])

  const groupsBy = (pick: (u: UserProfile) => string | undefined) => {
    const map = new Map<string, string[]>()
    assignableUsers.forEach((u) => { const k = pick(u); if (k) map.set(k, [...(map.get(k) ?? []), u.uid]) })
    return Array.from(map.entries()).map(([label, userIds]) => ({ key: label, label, userIds }))
  }
  const rankGroups = useMemo(() => groupsBy((u) => u.rank), [assignableUsers]) // eslint-disable-line react-hooks/exhaustive-deps
  const positionGroups = useMemo(() => groupsBy((u) => u.position), [assignableUsers]) // eslint-disable-line react-hooks/exhaustive-deps
  const tenureGroups = useMemo(() => TENURE_BUCKETS.map((b) => ({
    key: b.key, label: b.label,
    userIds: assignableUsers.filter((u) => { const y = tenureYears(u.startDate); return y !== null && b.test(y) }).map((u) => u.uid),
  })), [assignableUsers])

  const assignedRows = useMemo(
    () => computePackageRows(value.assignedUserIds, allUsers, records, courseIds),
    [value.assignedUserIds, allUsers, records, courseIds],
  )
  // The table hides people who resigned or are outside the target departments; they stay in the list until cleared.
  const activeAssignedIds = useMemo(
    () => new Set(assignedRows.filter((r) => isCurrentOrIncoming(r.user) && isTargetDepartment(r.user.department)).map((r) => r.user.uid)),
    [assignedRows],
  )
  const hiddenAssignedCount = value.assignedUserIds.filter((id) => !activeAssignedIds.has(id)).length

  const [openPanel, setOpenPanel] = useState<'individual' | 'department' | 'rank' | 'position' | 'tenure' | null>(null)
  const hasSavedDeptCondition = value.assignedDepartments.length > 0 || value.assignedTeamIds.length > 0
  const [condMasterOn, setCondMasterOn] = useState(hasSavedDeptCondition)
  const [condToggles, setCondToggles] = useState({ department: hasSavedDeptCondition, rank: false, position: false, tenure: false })
  const [showCond, setShowCond] = useState(false)
  const [showAssignedTable, setShowAssignedTable] = useState(false)

  // Only the department condition reports back WHICH values were picked; rank, position and tenure resolve straight to
  // the list of people.
  const deptConditionSaved = hasSavedDeptCondition
  const assignedTeamsByDept = useMemo(() => {
    const teamIdSet = new Set(value.assignedTeamIds)
    if (teamIdSet.size === 0) return []
    return deptTree
      .map((dept) => ({ deptName: dept.name, teamNames: dept.teams.filter((t) => teamIdSet.has(t.id)).map((t) => t.name) }))
      .filter((g) => g.teamNames.length > 0)
  }, [value.assignedTeamIds, deptTree])
  const condSummary = useMemo(() => {
    if (!condMasterOn) return 'ปิดอยู่'
    const names = Array.from(new Set([...value.assignedDepartments, ...assignedTeamsByDept.map((g) => g.deptName)]))
    return names.length > 0 ? 'สังกัด: ' + names.join(', ') : 'ยังไม่ได้ตั้งเงื่อนไข — กด "ตั้งเงื่อนไข"'
  }, [condMasterOn, value.assignedDepartments, assignedTeamsByDept])

  // Pulling someone out breaks the "whole department / whole team" guarantee the saved conditions rely on (the sync
  // would otherwise put them back), so any manual removal clears both conditions.
  function removeAssigned(uids: string[]) {
    const drop = new Set(uids)
    onChange({
      assignedUserIds: value.assignedUserIds.filter((id) => !drop.has(id)),
      assignedDepartments: [],
      assignedTeamIds: [],
    })
  }
  function clearHidden() {
    onChange({ assignedUserIds: value.assignedUserIds.filter((id) => activeAssignedIds.has(id)) })
  }

  const personIcon = (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )

  return (
    <div className="w-full max-w-5xl mx-auto px-6 py-8 space-y-4">
      <button type="button" onClick={() => setShowAssignedTable(true)}
        className="group flex items-center justify-between px-3 py-2 -mx-1 rounded-xl w-[calc(100%+0.5rem)] hover:bg-gray-50 transition-colors">
        <span className="text-xs font-bold text-gray-500">ผู้เรียนทั้งหมด</span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-gray-900 group-hover:text-freshket-600 transition-colors">
          <svg className="size-4 text-gray-400 group-hover:text-freshket-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          {value.assignedUserIds.length - hiddenAssignedCount}
        </span>
      </button>
      {hiddenAssignedCount > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 -mt-2 rounded-xl bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-700">
            +{hiddenAssignedCount} คนที่ลาออก ไม่พบในระบบ หรืออยู่นอกแผนก target ยังค้างอยู่ในรายชื่อ (ไม่แสดงในตาราง และไม่รับแจ้งเตือน)
          </p>
          <button type="button" onClick={clearHidden} className="shrink-0 text-xs font-bold text-amber-700 hover:underline">ล้าง</button>
        </div>
      )}

      {/* Individual assignment */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">{personIcon}</div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">มอบหมายรายบุคคล</p>
              <p className="text-xs text-gray-400">เลือกและจัดการรายชื่อผู้เรียนของ Course Design นี้ได้โดยตรง</p>
            </div>
          </div>
          <button type="button" onClick={() => setOpenPanel('individual')} aria-label="เพิ่มผู้เรียนรายบุคคล"
            className="size-9 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          </button>
        </div>
      </div>

      {/* Conditional assignment */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => setShowCond(true)} disabled={!condMasterOn} className="flex items-center gap-3 min-w-0 flex-1 text-left disabled:cursor-default">
            <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${condMasterOn ? 'bg-freshket-100 text-freshket-600' : 'bg-gray-100 text-gray-400'}`}>
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">มอบหมายตามเงื่อนไข</p>
              <p className="text-xs text-gray-400 truncate">{condSummary}</p>
            </div>
          </button>
          {condMasterOn && (
            <button type="button" onClick={() => setShowCond(true)}
              className="shrink-0 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
              ตั้งเงื่อนไข
            </button>
          )}
          <button type="button" role="switch" aria-checked={condMasterOn} aria-label="มอบหมายตามเงื่อนไข" onClick={() => setCondMasterOn((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0 ${condMasterOn ? 'bg-freshket-500' : 'bg-gray-200'}`}>
            <span className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${condMasterOn ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {value.assignedUserIds.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="max-h-[calc(100vh-17rem)] min-h-[20rem] overflow-auto">
            <AssignedLearnersTable
              rows={assignedRows}
              enrolledUserIds={enrolledUserIds}
              onRemove={(uid) => removeAssigned([uid])}
              onRemoveMany={removeAssigned}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        </div>
      )}

      {/* The conditions, in a card */}
      {showCond && condMasterOn && openPanel === null && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCond(false)}>
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-900">มอบหมายตามเงื่อนไข</p>
                <p className="text-xs text-gray-400">เลือกเงื่อนไข แล้วกด ตกลง เพื่อใช้กับรายชื่อผู้เรียน</p>
              </div>
              <button type="button" onClick={() => setShowCond(false)} aria-label="ปิด" className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {([
                  { key: 'department' as const, label: 'สังกัด' },
                  { key: 'rank' as const, label: 'ระดับตำแหน่ง' },
                  { key: 'position' as const, label: 'ตำแหน่ง' },
                  { key: 'tenure' as const, label: 'อายุงาน' },
                ]).map((row) => {
                  const isSaved = row.key === 'department' && deptConditionSaved
                  return (
                    <div key={row.key} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700 font-normal">{row.label}</span>
                          {condToggles[row.key] && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSaved ? 'bg-freshket-100 text-freshket-700' : 'bg-amber-100 text-amber-700'}`}>
                              {isSaved ? 'บันทึกแล้ว' : 'Standby — ยังไม่ได้ตั้งค่า'}
                            </span>
                          )}
                        </div>
                        <button type="button" role="switch" aria-checked={condToggles[row.key]} aria-label={row.label}
                          onClick={() => setCondToggles((p) => ({ ...p, [row.key]: !p[row.key] }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${condToggles[row.key] ? 'bg-freshket-500' : 'bg-gray-200'}`}>
                          <span className={`inline-block size-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${condToggles[row.key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {condToggles[row.key] && (
                        isSaved ? (
                          <div className="mt-2 flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1.5">
                              {value.assignedDepartments.map((deptName) => {
                                const dept = deptTree.find((d) => d.name === deptName)
                                return (
                                  <div key={deptName}>
                                    <p className="text-xs font-bold text-gray-700 truncate">{deptName}</p>
                                    {dept && dept.teams.length > 0 && <p className="text-xs text-gray-400 truncate">{dept.teams.map((t) => t.name).join(', ')}</p>}
                                  </div>
                                )
                              })}
                              {assignedTeamsByDept.map((g) => (
                                <div key={g.deptName}>
                                  <p className="text-xs font-bold text-gray-700 truncate">{g.deptName}</p>
                                  <p className="text-xs text-gray-400 truncate">{g.teamNames.join(', ')}</p>
                                </div>
                              ))}
                            </div>
                            <button type="button" onClick={() => setOpenPanel(row.key)} title={`แก้ไข${row.label}`}
                              className="shrink-0 size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-freshket-500 hover:text-white hover:border-freshket-500 transition-all">
                              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setOpenPanel(row.key)}
                            className="mt-2 flex items-center gap-1 text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors">
                            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            เลือก{row.label}
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 shrink-0">
              <p className="text-xs text-gray-500">รายชื่อผู้เรียนตอนนี้ <span className="font-bold text-gray-800">{value.assignedUserIds.length - hiddenAssignedCount}</span> คน</p>
              <button type="button" onClick={() => setShowCond(false)} className="px-6 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors">ตกลง</button>
            </div>
          </div>
        </div>
      )}

      {openPanel === 'individual' && (
        <IndividualAssignmentPanel users={assignableUsers} assignedIds={value.assignedUserIds} enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => onChange({ assignedUserIds: ids })} onClose={() => setOpenPanel(null)} />
      )}
      {openPanel === 'department' && (
        <DepartmentTeamPicker deptTree={deptTree} assignedIds={value.assignedUserIds} enrolledUserIds={enrolledUserIds}
          onConfirm={(ids, depts, teamIds) => onChange({ assignedUserIds: ids, assignedDepartments: depts, assignedTeamIds: teamIds })}
          onClose={() => setOpenPanel(null)} />
      )}
      {openPanel === 'rank' && (
        <ConditionGroupPicker title="เลือกระดับตำแหน่ง" groups={rankGroups} assignedIds={value.assignedUserIds} enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => onChange({ assignedUserIds: ids })} onClose={() => setOpenPanel(null)} />
      )}
      {openPanel === 'position' && (
        <ConditionGroupPicker title="เลือกตำแหน่ง" groups={positionGroups} assignedIds={value.assignedUserIds} enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => onChange({ assignedUserIds: ids })} onClose={() => setOpenPanel(null)} />
      )}
      {openPanel === 'tenure' && (
        <ConditionGroupPicker title="เลือกอายุงาน" groups={tenureGroups} assignedIds={value.assignedUserIds} enrolledUserIds={enrolledUserIds}
          onConfirm={(ids) => onChange({ assignedUserIds: ids })} onClose={() => setOpenPanel(null)} />
      )}

      {showAssignedTable && (
        <AssignedLearnersTableModal
          assignedUserIds={value.assignedUserIds}
          allUsers={allUsers}
          allTrainingRecords={records}
          packageCourseIds={courseIds}
          enrolledUserIds={enrolledUserIds}
          isSuperAdmin={isSuperAdmin}
          onRemove={(uid) => removeAssigned([uid])}
          onRemoveMany={removeAssigned}
          onClose={() => setShowAssignedTable(false)}
        />
      )}
    </div>
  )
}
