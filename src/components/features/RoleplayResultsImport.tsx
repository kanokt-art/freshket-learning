'use client'

// นำเข้าผล Roleplay Assessment (CSV) — admin flow:
//   1. วางไฟล์ CSV จาก Google Forms (FKT-Learning-Master - Roleplay export)
//   2. ระบบตรวจก่อนเขียนจริง (mode=check) → แสดงแถวใหม่ / ชื่อที่จับคู่ user ไม่ได้ /
//      แถว test ที่ถูกข้าม / "ข้อมูลซ้ำ" พร้อมทางเลือก ทับ หรือ ข้าม
//   3. ยืนยัน (mode=commit) → เขียนลง roleplayAssessments
// SUBJECT จับคู่จากคอลัมน์ Name (ชื่อเล่น/ชื่อจริง) ไม่ใช่ email (email = ผู้ประเมิน)
// รอบ 1 = Pre, รอบอื่น = Post

import { useState, useRef, type ChangeEvent, type DragEvent } from 'react'
import { authedUpload } from '@/lib/api/authedFetch'
import type { CSVImportError } from '@/types/tracking'

type Phase = 'idle' | 'uploading' | 'processing'

interface RowSummary {
  subjectName: string
  rawName: string
  assessorName: string
  round: number
  type: 'pre' | 'post'
  takenAt: string
}

interface CheckResult {
  newRows: RowSummary[]
  duplicates: RowSummary[]
  unmatched: string[]
  skipped: { name: string; reason: 'test' }[]
  errors: CSVImportError[]
}

interface CommitResult {
  written: number
  skipped: number
  skippedTest: number
  unmatched: string[]
  errors: CSVImportError[]
}

const typePill = (t: 'pre' | 'post') =>
  t === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-freshket-100 text-freshket-700'

export function RoleplayResultsImport({ onClose, onDone }: {
  onClose: () => void
  onDone?: () => void
}) {
  const [step, setStep] = useState<'setup' | 'preview' | 'done'>('setup')
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

  async function post<T>(mode: 'check' | 'commit'): Promise<T | null> {
    if (!file) return null
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    if (mode === 'commit') fd.append('strategy', strategy)

    setPhase('uploading'); setProgress(0)
    const json = await authedUpload<T>(
      '/api/csv/roleplay',
      fd,
      (pct) => setProgress(pct),
      () => { setProgress(100); setPhase('processing') },
    )
    return json
  }

  async function handleCheck() {
    setBusy(true); setError(null)
    try {
      const json = await post<CheckResult>('check')
      if (json) { setCheck(json); setStep('preview') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally { setBusy(false); setPhase('idle') }
  }

  async function handleCommit() {
    setBusy(true); setError(null)
    try {
      const json = await post<CommitResult>('commit')
      if (json) { setCommit(json); setStep('done'); onDone?.() }
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
            <h2 className="text-base font-bold text-gray-900">นำเข้าผล Roleplay (CSV)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === 'setup' && 'อัปโหลดไฟล์ Roleplay จาก Google Forms'}
              {step === 'preview' && 'ตรวจสอบก่อนนำเข้า'}
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
              <div className="rounded-xl bg-slate-50 border border-gray-100 px-4 py-3 text-xs text-gray-500 leading-relaxed">
                ไฟล์จับคู่คะแนน 25 หัวข้อตาม<b>ลำดับคอลัมน์</b> ของฟอร์ม Roleplay ·
                คอลัมน์ <b>Name</b> = ผู้ถูกประเมิน (จับคู่กับพนักงานจากชื่อเล่น/ชื่อ) ·
                <b>Email Address</b> = ผู้ประเมิน · <b>ครั้งที่สอบ</b> รอบ 1 = Pre, รอบอื่น = Post ·
                แถวที่ชื่อมีคำว่า test/round จะถูกข้ามอัตโนมัติ
              </div>
              <label className="block text-xs font-bold text-gray-500">ไฟล์ Roleplay (.csv)</label>
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
                <p className="text-xs text-gray-400">รองรับไฟล์ export จาก Google Forms โดยตรง</p>
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
                <PreviewStat label="จับคู่ชื่อไม่ได้" value={check.unmatched.length} cls="bg-rose-100 text-rose-600" />
                <PreviewStat label="ข้ามแถว test" value={check.skipped.length} cls="bg-gray-100 text-gray-600" />
              </div>

              {check.newRows.length > 0 && (
                <div className="rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-freshket-50/60">
                    <p className="text-sm font-bold text-freshket-700">แถวใหม่ที่จะนำเข้า ({check.newRows.length})</p>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {check.newRows.map((r, i) => (
                          <tr key={i} className="border-t border-gray-50 first:border-t-0">
                            <td className="px-4 py-2">
                              <p className="font-bold text-gray-800">{r.subjectName}</p>
                              {r.rawName !== r.subjectName && <p className="text-xs text-gray-400">ในไฟล์: {r.rawName}</p>}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typePill(r.type)}`}>
                                {r.type === 'pre' ? 'Pre' : 'Post'} · รอบ {r.round}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">ประเมินโดย {r.assessorName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {check.duplicates.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-amber-200/60">
                    <p className="text-sm font-bold text-amber-700">
                      พบข้อมูลซ้ำ {check.duplicates.length} รายการ — มีผลประเมินรอบนี้อยู่แล้ว
                    </p>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {check.duplicates.map((d, i) => (
                          <tr key={i} className="border-t border-amber-200/40 first:border-t-0">
                            <td className="px-4 py-2 font-bold text-gray-800">{d.subjectName}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typePill(d.type)}`}>
                                {d.type === 'pre' ? 'Pre' : 'Post'} · รอบ {d.round}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">ประเมินโดย {d.assessorName}</td>
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
                  <p className="text-sm font-bold text-rose-600 mb-1">จับคู่ชื่อกับพนักงานไม่ได้ ({check.unmatched.length}) — แถวเหล่านี้จะถูกข้าม</p>
                  <p className="text-xs text-rose-500 break-all">{check.unmatched.join(', ')}</p>
                  <p className="text-xs text-rose-400 mt-1.5">ตรวจว่าพนักงานเหล่านี้อยู่ในระบบและตั้งชื่อเล่นตรงกับในไฟล์</p>
                </div>
              )}

              {check.skipped.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-bold text-gray-600 mb-1">ข้ามแถวทดสอบ ({check.skipped.length})</p>
                  <p className="text-xs text-gray-500 break-all">{check.skipped.map((s) => s.name).join(', ')}</p>
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
              <p className="text-base font-bold text-gray-900">นำเข้าผล Roleplay สำเร็จ</p>
              <p className="text-sm text-gray-500">
                บันทึก {commit.written} รายการ
                {commit.skipped > 0 && ` · ข้ามแถวซ้ำ ${commit.skipped}`}
                {commit.skippedTest > 0 && ` · ข้าม test ${commit.skippedTest}`}
                {commit.unmatched.length > 0 && ` · จับคู่ชื่อไม่ได้ ${commit.unmatched.length}`}
              </p>
              <p className="text-xs text-gray-400">ข้อมูลจะแสดงในหน้า Roleplay และ Dashboard ของพนักงานทันที</p>
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
                  : 'กำลังจับคู่ชื่อกับฐานข้อมูลพนักงาน...'}
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
                disabled={!file || busy}
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
