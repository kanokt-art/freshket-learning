'use client'

import { useMemo, useRef, useState } from 'react'
import { parseAssessmentCSV, type ParsedAssessmentScore } from '@/lib/utils/csvParser'
import type { UserProfile } from '@/types/user'
import type { CSVImportError } from '@/types/tracking'

// Super-admin tool: import a Google-Forms assessment CSV (Pre/Post scores),
// map each row to an employee by email, preview the match, then write the
// matched rows to the `assessmentScores` collection.

function subjectFromFileName(name: string): string {
  const base = name.replace(/\.csv$/i, '')
  const m = base.match(/assessment[_\s-]*(.+)$/i)
  return (m ? m[1] : base).trim() || 'Assessment'
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface Row extends ParsedAssessmentScore { uid: string | null }

export function ImportAssessmentModal({ users, onClose, onDone }: {
  users: UserProfile[]
  onClose: () => void
  onDone: (result: { imported: number; matched: number; unmatchedEmails: string[] }) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [subject, setSubject] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [parseErrors, setParseErrors] = useState<CSVImportError[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uidByEmail = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of users) if (u.email) m.set(u.email.toLowerCase(), u.uid)
    return m
  }, [users])

  const matched = rows.filter(r => r.uid)
  const unmatchedEmails = Array.from(new Set(rows.filter(r => !r.uid).map(r => r.email)))

  async function handleFile(file: File) {
    setParsing(true)
    setError(null)
    try {
      setFileName(file.name)
      setSubject(subjectFromFileName(file.name))
      const { data, errors } = await parseAssessmentCSV(file)
      setRows(data.map(r => ({ ...r, uid: uidByEmail.get(r.email) ?? null })))
      setParseErrors(errors)
    } catch (e) {
      console.error(e)
      setError('อ่านไฟล์ไม่สำเร็จ — ตรวจสอบว่าเป็นไฟล์ CSV')
    } finally {
      setParsing(false)
    }
  }

  async function handleImport() {
    if (matched.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const { getClientFirestore, writeBatch, doc, collection } = await import('@/lib/firebase/client')
      const db = getClientFirestore()
      const now = new Date()
      const subj = subject.trim() || 'Assessment'
      // Firestore caps a batch at 500 writes — chunk to be safe.
      for (let i = 0; i < matched.length; i += 450) {
        const batch = writeBatch(db)
        for (const r of matched.slice(i, i + 450)) {
          const takenAt = new Date(r.takenAt)
          const ms = isNaN(takenAt.getTime()) ? now.getTime() : takenAt.getTime()
          // Deterministic id → re-importing the same file updates, never duplicates.
          const id = `${r.uid}_${slug(subj)}_${r.type}_${ms}`
          batch.set(doc(collection(db, 'assessmentScores'), id), {
            uid: r.uid,
            email: r.email,
            subject: subj,
            type: r.type,
            score: r.score,
            total: r.total,
            pct: r.pct,
            takenAt: isNaN(takenAt.getTime()) ? now : takenAt,
            createdAt: now,
          })
        }
        await batch.commit()
      }
      onDone({ imported: matched.length, matched: matched.length, unmatchedEmails })
    } catch (e) {
      console.error(e)
      setError('บันทึกลง Firestore ไม่สำเร็จ — กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">นำเข้าคะแนนแบบทดสอบ</h2>
            <p className="text-sm font-normal text-gray-500">CSV จาก Google Form — ใช้เฉพาะ Timestamp · Email Address · Score · Type</p>
          </div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Dropzone / picker */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-gray-300 bg-slate-50 hover:bg-slate-100 transition-colors py-8 flex flex-col items-center gap-2 text-gray-500"
          >
            <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-sm font-bold">{fileName || 'เลือกไฟล์ CSV'}</span>
            {parsing && <span className="text-xs text-gray-400">กำลังอ่านไฟล์...</span>}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {/* Preventive tip — the #1 cause of "รูปแบบผิด" errors on this import:
              a spreadsheet silently reformats a Score cell like "6/10" into a
              date the moment the column isn't set to Text. */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs text-amber-700">
            <b>ก่อน export:</b> ตั้งค่าคอลัมน์ Score ใน Google Sheets/Excel เป็น <b>ข้อความ (Plain text)</b> ก่อนเสมอ
            ไม่เช่นนั้นค่าอย่าง <code className="bg-amber-100 px-1 rounded">6/10</code> อาจถูกแปลงเป็นวันที่โดยอัตโนมัติ (เช่น <code className="bg-amber-100 px-1 rounded">6-Oct</code>)
            แล้วระบบจะอ่านคะแนนผิดหรือขึ้น &ldquo;รูปแบบผิด&rdquo;
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-600">{error}</div>
          )}

          {rows.length > 0 && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">ชื่อชุดแบบทดสอบ</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 border border-gray-100 p-3 text-center">
                  <p className="text-lg font-black text-gray-900">{rows.length}</p>
                  <p className="text-xs text-gray-400">แถวทั้งหมด</p>
                </div>
                <div className="rounded-xl bg-freshket-50 border border-freshket-100 p-3 text-center">
                  <p className="text-lg font-black text-freshket-700">{matched.length}</p>
                  <p className="text-xs text-freshket-600">จับคู่พนักงานได้</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
                  <p className="text-lg font-black text-amber-700">{unmatchedEmails.length}</p>
                  <p className="text-xs text-amber-600">ไม่พบอีเมล</p>
                </div>
              </div>

              {parseErrors.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-bold text-rose-600 mb-1.5">
                    {parseErrors.some(e => e.field === 'header')
                      ? 'ไม่พบคอลัมน์ที่ต้องใช้ในไฟล์'
                      : `ข้าม ${parseErrors.length} แถวที่รูปแบบไม่ถูกต้อง`}
                  </p>
                  <ul className="text-xs text-rose-500 space-y-1 max-h-32 overflow-y-auto">
                    {parseErrors.map((e, i) => (
                      <li key={i}>{e.row > 0 ? `แถว ${e.row} · ` : ''}{e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {unmatchedEmails.length > 0 && (
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">อีเมลที่ไม่ตรงกับพนักงาน (ข้าม)</p>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {unmatchedEmails.map(e => (
                      <span key={e} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{e}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50">ยกเลิก</button>
          <button onClick={handleImport} disabled={matched.length === 0 || saving}
            className="flex-1 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? 'กำลังบันทึก...' : `นำเข้า ${matched.length} รายการ`}
          </button>
        </div>
      </div>
    </div>
  )
}
