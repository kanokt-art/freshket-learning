'use client'

// นำเข้าผลคะแนนรายหลักสูตร (CSV) — admin flow:
//   1. เลือกหลักสูตร + วางไฟล์ CSV (คอลัมน์: employeeEmail, score, status, completedAt)
//   2. ระบบตรวจก่อนเขียนจริง (mode=check) → แสดงแถวใหม่ / อีเมลที่ไม่พบ /
//      "ข้อมูลซ้ำ" (คะแนน-สถานะเดิม → ใหม่) พร้อมทางเลือก ทับ หรือ ข้าม
//   3. ยืนยัน (mode=commit) → สรุปผลการนำเข้า
// ไม่มีการเขียนใด ๆ ก่อนขั้นยืนยัน — หน้าจอซ้ำคือด่านบังคับ

import { useState, useRef, type ChangeEvent, type DragEvent } from 'react'
import { authedUpload } from '@/lib/api/authedFetch'
import { STATUS_LABELS, type TrainingStatus, type CSVImportError } from '@/types/tracking'
import type { Course } from '@/types/course'

// Loading has two genuinely different phases with different progress signals:
//   'uploading'  → real byte-transfer % from the XHR upload event
//   'processing' → the server is resolving each row's email against Firestore
//                   (no progress signal exists for this — a single JSON
//                   response arrives at the end), so the bar eases toward ~92%
//                   and only completes once the response actually lands. Same
//                   "ease toward near-100, snap on completion" convention as
//                   NavProgress.tsx uses for route transitions elsewhere in
//                   this app — an honest "still working," not a fabricated ETA.
type Phase = 'idle' | 'uploading' | 'processing'

interface DuplicateRow {
  email: string
  displayName: string
  existingScore: number | null
  existingStatus: string
  newScore: number | null
  newStatus: string
}

interface CheckResult {
  newRows: { email: string; displayName: string; score: number | null; status: string }[]
  duplicates: DuplicateRow[]
  unmatched: string[]
  errors: CSVImportError[]
}

interface CommitResult {
  written: number
  skipped: number
  unmatched: string[]
  errors: CSVImportError[]
}

const statusLabel = (s: string) => STATUS_LABELS[s as TrainingStatus] ?? s

export function CourseResultsImport({ courses, onClose, onDone }: {
  courses: Course[]
  onClose: () => void
  onDone?: () => void
}) {
  const [step, setStep] = useState<'setup' | 'preview' | 'done'>('setup')
  const [courseId, setCourseId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [strategy, setStrategy] = useState<'overwrite' | 'skip'>('skip')
  const [commit, setCommit] = useState<CommitResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const course = courses.find((c) => c.id === courseId)

  function pickFile(f: File) {
    if (!f.name.endsWith('.csv')) { setError('รองรับเฉพาะไฟล์ .csv'); return }
    setError(null)
    setFile(f)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
  }

  function downloadTemplate() {
    const blob = new Blob(['employeeEmail,score,status,completedAt\nsomchai@freshket.co,85,completed,2026-07-19\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template_course_results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function post<T>(mode: 'check' | 'commit'): Promise<T | null> {
    if (!file || !course) return null
    const fd = new FormData()
    fd.append('file', file)
    fd.append('courseId', course.id)
    fd.append('courseTitle', course.title)
    fd.append('mode', mode)
    if (mode === 'commit') fd.append('strategy', strategy)

    setPhase('uploading'); setProgress(0)
    const json = await authedUpload<T>(
      '/api/csv/course-results',
      fd,
      (pct) => setProgress(pct),
      // Request body finished sending — the server hasn't answered yet, so
      // this is exactly the upload→processing boundary. Fires reliably even
      // when the file is small enough that no progress ticks land at all.
      () => { setProgress(100); setPhase('processing') },
    )
    return json
  }

  async function handleCheck() {
    setBusy(true); setError(null)
    try {
      const json = await post<CheckResult>('check')
      if (json) {
        setCheck(json)
        // No duplicates → still show the preview so the admin confirms counts.
        setStep('preview')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setBusy(false); setPhase('idle') }
  }

  async function handleCommit() {
    setBusy(true); setError(null)
    try {
      const json = await post<CommitResult>('commit')
      if (json) {
        setCommit(json)
        setStep('done')
        onDone?.()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setBusy(false); setPhase('idle') }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        style={{ animation: 'popIn 0.2s cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes popIn { from { transform: scale(0.95); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">นำเข้าผลคะแนน (CSV)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 'setup' && 'เลือกหลักสูตร แล้วอัปโหลดไฟล์ผลคะแนน'}
              {step === 'preview' && `ตรวจสอบก่อนนำเข้า — ${course?.title ?? ''}`}
              {step === 'done' && 'นำเข้าเสร็จสิ้น'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* ── Step 1: setup ── */}
          {step === 'setup' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">หลักสูตร</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-freshket-300 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">— เลือกหลักสูตรที่จะนำเข้าผลคะแนน —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-500">ไฟล์ผลคะแนน (.csv)</label>
                <button onClick={downloadTemplate} className="text-xs text-freshket-600 underline underline-offset-2 hover:text-freshket-700">
                  ดาวน์โหลด Template
                </button>
              </div>
              <div
                onDragOver={(e) => { if (busy) return; e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { if (busy) { e.preventDefault(); return }; onDrop(e) }}
                onClick={() => { if (!busy) inputRef.current?.click() }}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors ${
                  busy ? 'cursor-not-allowed opacity-60 border-gray-200' : 'cursor-pointer border-gray-200 hover:border-freshket-500 hover:bg-freshket-100/40'
                } ${dragging && !busy ? 'border-freshket-500 bg-freshket-100' : ''}`}
              >
                <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-gray-700">{file ? file.name : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}</p>
                <p className="text-xs text-gray-400">ต้องมีคอลัมน์อีเมล (Email Address หรือ employeeEmail) · คะแนนรองรับ 0-100 หรือ 6/10 · รองรับไฟล์ Google Forms</p>
                <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onChange} />
              </div>
            </>
          )}

          {/* ── Step 2: preview + duplicate screen ── */}
          {step === 'preview' && check && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <PreviewStat label="เพิ่มใหม่" value={check.newRows.length} cls="bg-freshket-100 text-freshket-700" />
                <PreviewStat label="ข้อมูลซ้ำ" value={check.duplicates.length} cls="bg-amber-100 text-amber-700" />
                <PreviewStat label="ไม่พบอีเมล" value={check.unmatched.length} cls="bg-rose-100 text-rose-600" />
                <PreviewStat label="รูปแบบผิด" value={check.errors.length} cls="bg-gray-100 text-gray-600" />
              </div>

              {check.duplicates.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-200/60">
                    <p className="text-sm font-bold text-amber-700">
                      พบข้อมูลซ้ำ {check.duplicates.length} รายการ — พนักงานเหล่านี้มีผลของหลักสูตรนี้อยู่แล้ว
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-amber-700/70">
                          <th className="px-4 py-2 font-bold">พนักงาน</th>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">คะแนน เดิม → ใหม่</th>
                          <th className="px-4 py-2 font-bold whitespace-nowrap">สถานะ เดิม → ใหม่</th>
                        </tr>
                      </thead>
                      <tbody>
                        {check.duplicates.map((d) => (
                          <tr key={d.email} className="border-t border-amber-200/40">
                            <td className="px-4 py-2">
                              <p className="font-bold text-gray-800">{d.displayName}</p>
                              <p className="text-xs text-gray-400">{d.email}</p>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                              {d.existingScore ?? '—'} <span className="text-gray-400">→</span> <span className="font-bold">{d.newScore ?? '—'}</span>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              {statusLabel(d.existingStatus)} <span className="text-gray-400">→</span> <span className="font-bold">{statusLabel(d.newStatus)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-amber-200/60 space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="dup-strategy" checked={strategy === 'skip'} onChange={() => setStrategy('skip')} className="accent-[#00ce7c]" />
                      <span><b>ข้ามแถวที่ซ้ำ</b> — เก็บผลเดิมไว้ นำเข้าเฉพาะแถวใหม่ {check.newRows.length} รายการ</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="dup-strategy" checked={strategy === 'overwrite'} onChange={() => setStrategy('overwrite')} className="accent-[#00ce7c]" />
                      <span><b>ทับข้อมูลเดิม</b> — ใช้ค่าจากไฟล์นี้แทนทั้ง {check.duplicates.length} รายการที่ซ้ำ</span>
                    </label>
                  </div>
                </div>
              )}

              {check.unmatched.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                  <p className="text-sm font-bold text-rose-600 mb-1">ไม่พบพนักงานตามอีเมล ({check.unmatched.length}) — แถวเหล่านี้จะถูกข้าม</p>
                  <p className="text-xs text-rose-500 break-all">{check.unmatched.join(', ')}</p>
                </div>
              )}

              {check.errors.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-bold text-gray-600 mb-1">ปัญหารูปแบบข้อมูล ({check.errors.length})</p>
                  <ul className="text-xs text-gray-500 space-y-0.5 max-h-24 overflow-y-auto">
                    {check.errors.map((e, i) => (
                      <li key={i}>{e.row > 0 ? `แถว ${e.row} · ` : ''}{e.field}: {e.message}{e.rawValue ? ` ("${e.rawValue}")` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}

              {check.newRows.length === 0 && check.duplicates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีแถวที่นำเข้าได้ — ตรวจสอบไฟล์อีกครั้ง</p>
              )}
            </>
          )}

          {/* ── Step 3: done ── */}
          {step === 'done' && commit && (
            <div className="text-center py-6 space-y-3">
              <div className="size-14 mx-auto rounded-full bg-freshket-100 flex items-center justify-center">
                <svg className="size-7 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-base font-bold text-gray-900">นำเข้าผลคะแนนสำเร็จ</p>
              <p className="text-sm text-gray-500">
                บันทึก {commit.written} รายการ
                {commit.skipped > 0 && ` · ข้ามแถวซ้ำ ${commit.skipped} รายการ`}
                {commit.unmatched.length > 0 && ` · ไม่พบอีเมล ${commit.unmatched.length} รายการ`}
              </p>
              <p className="text-xs text-gray-400">สถิติผู้เรียน (userStats) ถูกอัปเดตให้อัตโนมัติแล้ว</p>
            </div>
          )}

          {phase !== 'idle' && (
            <div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: phase === 'uploading' ? `${progress}%` : '92%',
                    background: '#00ce7c',
                    transition: phase === 'uploading'
                      ? 'width 0.15s ease-out'
                      : 'width 3s cubic-bezier(0.05, 0.05, 0, 1)',
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                {phase === 'uploading'
                  ? `กำลังอัปโหลดไฟล์... ${progress}%`
                  : step === 'preview'
                  ? 'กำลังบันทึกข้อมูลลงระบบ...'
                  : 'กำลังตรวจสอบข้อมูลกับฐานข้อมูลพนักงาน...'}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          {step === 'setup' && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">ยกเลิก</button>
              <button
                onClick={handleCheck}
                disabled={!courseId || !file || busy}
                className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบไฟล์'}
              </button>
            </>
          )}
          {step === 'preview' && check && (
            <>
              <button onClick={() => { setStep('setup'); setCheck(null) }} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors">ย้อนกลับ</button>
              <button
                onClick={handleCommit}
                disabled={busy || (check.newRows.length === 0 && !(strategy === 'overwrite' && check.duplicates.length > 0))}
                className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy
                  ? 'กำลังนำเข้า...'
                  : `ยืนยันนำเข้า ${check.newRows.length + (strategy === 'overwrite' ? check.duplicates.length : 0)} รายการ`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-colors">ปิด</button>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewStat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${cls}`}>
      <p className="text-lg font-black leading-none tabular-nums">{value}</p>
      <p className="text-xs font-bold mt-1">{label}</p>
    </div>
  )
}
